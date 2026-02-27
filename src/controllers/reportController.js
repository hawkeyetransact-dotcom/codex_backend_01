import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditReport } from "../models/auditReportModel.js";
import { AccessGrant } from "../models/accessGrantModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";
import mongoose from "mongoose";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { runComplianceFlowForAudit } from "../services/compliance/complianceFlowService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const normalizeObjectIdArray = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((item) => toObjectIdOrNull(item))
    .filter(Boolean);

const buildLegacyObservations = (questions = []) =>
  questions.map((q) => ({
    questionId: toObjectIdOrNull(q._id),
    title: q.question,
    severity:
      q?.responseDetails?.auditorVerification?.severity ||
      q.severity ||
      "Info",
    classification:
      q?.responseDetails?.auditorVerification?.actionClass ||
      q.actionClass ||
      "None",
    followUp:
      q?.responseDetails?.auditorVerification?.followUp === true ||
      q.flagStatus === "auditor_flagged" ||
      !!q.followUp,
    cfr: "ICH Q7",
    notes:
      q?.responseDetails?.auditorVerification?.comments ||
      q.internalNotes ||
      q.textResponse ||
      q.messages ||
      "",
    linkedEvidenceIds: normalizeObjectIdArray(q.linkedEvidenceIds),
    linkedCapaIds: normalizeObjectIdArray(q.linkedCapaIds),
    linkedFindingId: toObjectIdOrNull(q.linkedFindingId),
  }));

const verdictToSeverity = (verdict = "") => {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "NON_COMPLIANT") return "Major";
  if (normalized === "INSUFFICIENT") return "Minor";
  return "Info";
};

const verdictToClassification = (verdict = "") => {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "NON_COMPLIANT") return "OAI";
  if (normalized === "INSUFFICIENT") return "VAI";
  if (normalized === "COMPLIANT") return "NAI";
  return "None";
};

const buildObservationReference = (result = {}) => {
  const refs = [];
  if (result.regulatoryReference) refs.push(String(result.regulatoryReference));
  const mappedControls = Array.isArray(result.mappedControls) ? result.mappedControls : [];
  mappedControls.forEach((control) => {
    if (control?.clauseRef) refs.push(String(control.clauseRef));
    if (Array.isArray(control?.standardRefs)) {
      control.standardRefs.forEach((item) => item && refs.push(String(item)));
    }
  });
  const uniq = Array.from(new Set(refs.filter(Boolean)));
  return uniq[0] || "ICH Q7";
};

const buildObservationNotes = (result = {}) => {
  const parts = [];
  if (result.machineReason) parts.push(String(result.machineReason));
  const evidence = Array.isArray(result.evidenceSuggestions)
    ? result.evidenceSuggestions
        .slice(0, 2)
        .map((item) => String(item?.title || "").trim())
        .filter(Boolean)
    : [];
  if (evidence.length) {
    parts.push(`Suggested evidence: ${evidence.join(", ")}`);
  }
  return parts.join(" ").trim();
};

const buildDynamicObservations = ({ questionResults = [], questions = [] }) => {
  const questionById = new Map(
    (Array.isArray(questions) ? questions : []).map((item) => [String(item._id), item])
  );
  const raw = Array.isArray(questionResults) ? questionResults : [];
  const filtered = raw.filter((result) => {
    const verdict = String(
      result.finalVerdict || result.auditorVerdict || result.machineVerdict || ""
    ).toUpperCase();
    const linkedQuestion = questionById.get(String(result.questionId));
    return (
      verdict === "NON_COMPLIANT" ||
      verdict === "INSUFFICIENT" ||
      Boolean(linkedQuestion?.followUp)
    );
  });
  const source = filtered.length ? filtered : raw.slice(0, 25);

  return source.map((result) => {
    const linkedQuestion = questionById.get(String(result.questionId));
    const verdict = String(
      result.finalVerdict || result.auditorVerdict || result.machineVerdict || ""
    ).toUpperCase();
    return {
      questionId: toObjectIdOrNull(result.questionId || linkedQuestion?._id),
      title: result.questionText || linkedQuestion?.question || "Question",
      severity: verdictToSeverity(verdict),
      classification: verdictToClassification(verdict),
      followUp:
        verdict === "NON_COMPLIANT" ||
        verdict === "INSUFFICIENT" ||
        linkedQuestion?.flagStatus === "auditor_flagged" ||
        Boolean(linkedQuestion?.followUp),
      cfr: buildObservationReference(result),
      notes:
        buildObservationNotes(result) ||
        linkedQuestion?.internalNotes ||
        linkedQuestion?.textResponse ||
        linkedQuestion?.messages ||
        "",
      linkedEvidenceIds: normalizeObjectIdArray(linkedQuestion?.linkedEvidenceIds),
      linkedCapaIds: normalizeObjectIdArray(linkedQuestion?.linkedCapaIds),
      linkedFindingId: toObjectIdOrNull(linkedQuestion?.linkedFindingId),
    };
  });
};

export const generateDraftReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId)
      .populate("supplier_product_id", "name")
      .populate("site_id", "site_name")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    if (audit?.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
      return res.status(404).json({ success: false, error: "Not Found" });
    }

    const qs = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;

    let observations = [];
    let complianceMeta = null;
    try {
      if (tenantId) {
        const compliance = await runComplianceFlowForAudit({
          tenantId,
          auditId,
          actorUserId: req.user?._id,
          standardKey: req.body?.standardKey,
          standardVersion: req.body?.standardVersion,
          includeQuestionResults: true,
          hydrateEvidenceSuggestions: true,
        });
        observations = buildDynamicObservations({
          questionResults: compliance.questionResults,
          questions: qs,
        });
        complianceMeta = {
          runId: compliance?.run?._id || null,
          standard: compliance?.standard || null,
          summary: compliance?.summary || null,
        };
      }
    } catch (error) {
      console.warn("generateDraftReport compliance mapping failed", error?.message || error);
    }
    if (!observations.length) {
      observations = buildLegacyObservations(qs);
    }
    const productName = audit?.supplier_product_id?.name || "product";
    const siteName = audit?.site_id?.site_name || "site";
    const complianceSummary = complianceMeta?.summary;
    const standardLabel = complianceMeta?.standard
      ? `${complianceMeta.standard.name || complianceMeta.standard.standardKey} (${complianceMeta.standard.standardKey} v${complianceMeta.standard.version})`
      : "ICH Q7";
    const summary = complianceSummary
      ? `Draft report for ${productName} at ${siteName}. Standard: ${standardLabel}. Evaluated ${complianceSummary.total || 0} questions (${complianceSummary.compliant || 0} compliant, ${complianceSummary.nonCompliant || 0} non-compliant, ${complianceSummary.insufficient || 0} insufficient, ${complianceSummary.notApplicable || 0} not applicable).`
      : `Draft report for ${productName} at ${siteName} with ${observations.length} observations.`;

    const report = await AuditReport.findOneAndUpdate(
      { auditRequestId: auditId },
      {
        auditRequestId: auditId,
        tenantOrgId: tenantId,
        summary,
        observations,
        status: "DRAFT",
        updatedBy: req.user?._id,
        createdBy: req.user?._id,
      },
      { new: true, upsert: true }
    );

    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: report.tenantOrgId || tenantId,
        auditId: audit._id,
        entityType: "report",
        entityId: report._id,
        action: "REPORT_DRAFT_GENERATED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: null,
        after: { status: report.status },
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    }

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("generateDraftReport error", error);
    return res.status(500).json({ success: false, error: "Failed to generate report" });
  }
};

const assertGrant = async (req, auditId) => {
  if (req.user?.adminScope === "PLATFORM") return;
  const role = req.user?.role;
  if (role === "admin" || role === "superadmin" || role === "tenant_admin") return;

  if (role === "auditor") {
    const ok = await canAuditorAccessAudit(req.user?._id, auditId);
    if (ok) return;
  }

  const audit = await AuditRequestMaster.findById(auditId)
    .select("supplier_id create_by_buyer_id auditor_id")
    .lean();
  if (audit) {
    if (role === "buyer" && String(audit.create_by_buyer_id) === String(req.user?._id)) return;
    if ((role === "supplier" || role === "supplierUser") && String(audit.supplier_id) === String(req.user?._id)) return;
    if (role === "auditor" && String(audit.auditor_id) === String(req.user?._id)) return;
  }

  const grant = await AccessGrant.findOne({
    tenant_id: req.user?.tenant_id,
    granteeUserId: req.user?._id,
    resourceType: "report",
    resourceId: auditId,
    status: "ACTIVE",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
  if (!grant) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const logDownload = async (req, auditId) => {
  try {
    await AdminAuditLog.create({
      tenant_id: req.user?.tenant_id || null,
      actorUserId: req.user?._id,
      adminScope: req.user?.adminScope || "NONE",
      action: "report_download",
      entityType: "AuditReport",
      entityId: auditId,
      details: `report download`,
    });
  } catch (err) {
    console.error("logDownload error", err);
  }
};

export const getReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    await assertGrant(req, auditId);
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    await logDownload(req, auditId);
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: report.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
        auditId,
        entityType: "report",
        entityId: report._id,
        action: "REPORT_VIEWED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: null,
        after: null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    }
    return res.json({ success: true, data: report });
  } catch (error) {
    const status = error.status || 500;
    console.error("getReport error", error);
    return res.status(status).json({ success: false, error: status === 403 ? "Forbidden" : "Failed to load report" });
  }
};

export const signReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { role } = req.body;
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    report.signatures = report.signatures || [];
    report.signatures.push({
      role: role || req.user?.role || "auditor",
      userId: req.user?._id,
      signedAt: new Date(),
    });
    report.status = "PENDING_SIGNATURES";
    await report.save();
    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: report.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
        auditId,
        entityType: "report",
        entityId: report._id,
        action: "REPORT_SIGNED",
        actorId: req.user?._id,
        actorRole: req.user?.role,
        before: null,
        after: { status: report.status },
        ip: req.ip,
        userAgent: req.get("user-agent"),
        meta: { role: role || req.user?.role || "auditor" },
      });
    }
    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("signReport error", error);
    return res.status(500).json({ success: false, error: "Failed to sign report" });
  }
};

export const updateReportObservationLinks = async (req, res) => {
  try {
    const { auditId, observationId } = req.params;
    const { linkedEvidenceIds, linkedCapaIds, linkedFindingId } = req.body || {};
    await assertGrant(req, auditId);
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    const observation = report.observations?.id(observationId);
    if (!observation) {
      return res.status(404).json({ success: false, error: "Observation not found" });
    }
    if (Array.isArray(linkedEvidenceIds)) observation.linkedEvidenceIds = linkedEvidenceIds;
    if (Array.isArray(linkedCapaIds)) observation.linkedCapaIds = linkedCapaIds;
    if (linkedFindingId !== undefined) observation.linkedFindingId = linkedFindingId;
    report.updatedBy = req.user?._id;
    await report.save();
    return res.json({ success: true, data: observation });
  } catch (error) {
    const status = error.status || 500;
    console.error("updateReportObservationLinks error", error);
    return res.status(status).json({ success: false, error: status === 403 ? "Forbidden" : "Failed to update observation" });
  }
};
