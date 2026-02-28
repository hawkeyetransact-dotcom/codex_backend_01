import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditReport } from "../models/auditReportModel.js";
import { Capa } from "../models/capaModel.js";
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

const parseDocUrls = (value = "") =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const decodeSafe = (value = "") => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
};

const extractFileName = (url = "", fallback = "attachment") => {
  const base = String(url || "").split("?")[0] || "";
  const name = base.split("/").filter(Boolean).pop() || fallback;
  return decodeSafe(name);
};

const summarizeAuditorAttachments = (attachments = []) => {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return "";
  const byType = { audio: 0, photo: 0, file: 0 };
  const names = [];
  list.forEach((attachment) => {
    const type = String(attachment?.type || "file").toLowerCase();
    if (byType[type] !== undefined) byType[type] += 1;
    else byType.file += 1;
    const name = String(attachment?.fileName || attachment?.url || "").trim();
    if (name) names.push(extractFileName(name, name));
  });
  const counts = Object.entries(byType)
    .filter(([, count]) => Number(count) > 0)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  if (!counts) return "";
  const sampleNames = names.slice(0, 3).join(", ");
  return sampleNames
    ? `Auditor attachments reviewed (${counts}): ${sampleNames}.`
    : `Auditor attachments reviewed (${counts}).`;
};

const buildQuestionContextNotes = (question = {}) => {
  const notes = [];
  const auditorVerification = question?.responseDetails?.auditorVerification || {};
  const comments = String(auditorVerification?.comments || "").trim();
  if (comments) notes.push(`Auditor comments: ${comments}`);
  const followUpMessage = String(question?.messages || "").trim();
  if (followUpMessage) notes.push(`Follow-up request/response: ${followUpMessage}`);
  const internalNotes = String(question?.internalNotes || "").trim();
  if (internalNotes) notes.push(`Internal notes: ${internalNotes}`);
  const questionnaireResponse = String(question?.textResponse || "").trim();
  if (questionnaireResponse) notes.push(`Questionnaire response: ${questionnaireResponse}`);

  const attachmentSummary = summarizeAuditorAttachments(question?.auditorAttachments || []);
  if (attachmentSummary) notes.push(attachmentSummary);

  const evidenceNames = parseDocUrls(question?.docUrls || "")
    .slice(0, 4)
    .map((url) => extractFileName(url))
    .filter(Boolean);
  if (evidenceNames.length) {
    notes.push(`Linked supplier evidence: ${evidenceNames.join(", ")}.`);
  }
  return notes.join(" ").trim();
};

const hasFollowUpSignal = (question = {}) =>
  question?.responseDetails?.auditorVerification?.followUp === true ||
  question?.flagStatus === "auditor_flagged" ||
  Boolean(question?.followUp) ||
  Boolean(String(question?.messages || "").trim());

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
    followUp: hasFollowUpSignal(q),
    cfr: "ICH Q7",
    notes: buildQuestionContextNotes(q),
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

const buildObservationNotes = (result = {}, linkedQuestion = {}) => {
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
  const contextual = buildQuestionContextNotes(linkedQuestion);
  if (contextual) {
    parts.push(contextual);
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
      hasFollowUpSignal(linkedQuestion)
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
        hasFollowUpSignal(linkedQuestion),
      cfr: buildObservationReference(result),
      notes: buildObservationNotes(result, linkedQuestion),
      linkedEvidenceIds: normalizeObjectIdArray(linkedQuestion?.linkedEvidenceIds),
      linkedCapaIds: normalizeObjectIdArray(linkedQuestion?.linkedCapaIds),
      linkedFindingId: toObjectIdOrNull(linkedQuestion?.linkedFindingId),
    };
  });
};

const ensureAuditorCanAccessAudit = async ({ audit, user }) => {
  if (!audit || !user?._id) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  const role = String(user.role || "").toLowerCase();
  if (role === "admin" || role === "superadmin" || role === "tenant_admin") return;
  if (role !== "auditor") {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  const assigned =
    String(audit.auditor_id || "") === String(user._id || "") ||
    (await canAuditorAccessAudit(user._id, audit._id));
  if (!assigned) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const buildComplianceSuggestions = (questionResults = []) => {
  const rows = Array.isArray(questionResults) ? questionResults : [];
  const severityWeight = (verdict = "") => {
    const normalized = String(verdict || "").toUpperCase();
    if (normalized === "NON_COMPLIANT") return 3;
    if (normalized === "INSUFFICIENT") return 2;
    if (normalized === "NOT_APPLICABLE") return 0;
    return 1;
  };
  const suggestions = rows
    .map((row) => {
      const verdict = String(
        row.finalVerdict || row.auditorVerdict || row.machineVerdict || ""
      ).toUpperCase();
      const topEvidence = Array.isArray(row.evidenceSuggestions)
        ? row.evidenceSuggestions
            .slice(0, 3)
            .map((item) => String(item?.title || "").trim())
            .filter(Boolean)
        : [];
      return {
        questionId: row.questionId || null,
        questionText: row.questionText || "Question",
        categoryName: row.categoryName || "",
        verdict,
        severityWeight: severityWeight(verdict),
        regulatoryReference: buildObservationReference(row),
        reason: String(row.machineReason || "").trim(),
        suggestedAction:
          verdict === "NON_COMPLIANT"
            ? "Open follow-up and CAPA with target closure timeline."
            : verdict === "INSUFFICIENT"
            ? "Collect additional objective evidence before closure."
            : "Maintain control and retain supporting evidence.",
        evidenceSuggestions: topEvidence,
      };
    })
    .sort((left, right) => right.severityWeight - left.severityWeight);

  return {
    total: suggestions.length,
    highRisk: suggestions.filter((item) => item.verdict === "NON_COMPLIANT").length,
    mediumRisk: suggestions.filter((item) => item.verdict === "INSUFFICIENT").length,
    items: suggestions.slice(0, 25),
  };
};

const countAuditorAttachments = (questions = []) =>
  (Array.isArray(questions) ? questions : []).reduce(
    (sum, question) =>
      sum + (Array.isArray(question?.auditorAttachments) ? question.auditorAttachments.length : 0),
    0
  );

const observationToCapaSeverity = (severity = "") => {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "major") return "major";
  if (normalized === "minor") return "minor";
  return "info";
};

const shouldCreateCapaFromObservation = (observation = {}) => {
  const severity = String(observation.severity || "").toLowerCase();
  const classification = String(observation.classification || "").toUpperCase();
  if (observation.followUp) return true;
  if (severity === "critical" || severity === "major" || severity === "minor") return true;
  if (classification === "OAI" || classification === "VAI") return true;
  return false;
};

const resolveCapaTargetDate = (severity = "") => {
  const now = Date.now();
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "critical") return new Date(now + 14 * 24 * 60 * 60 * 1000);
  if (normalized === "major") return new Date(now + 30 * 24 * 60 * 60 * 1000);
  if (normalized === "minor") return new Date(now + 45 * 24 * 60 * 60 * 1000);
  return new Date(now + 60 * 24 * 60 * 60 * 1000);
};

export const generateDraftReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId)
      .select("tenantOrgId auditor_id supplier_id create_by_buyer_id supplier_product_id site_id")
      .populate("supplier_product_id", "name")
      .populate("site_id", "site_name")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    if (audit?.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
      return res.status(404).json({ success: false, error: "Not Found" });
    }
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

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
    const followUpCount = observations.filter((observation) => observation.followUp).length;
    const auditorAttachmentCount = countAuditorAttachments(qs);
    const summary = complianceSummary
      ? `Draft report for ${productName} at ${siteName}. Standard: ${standardLabel}. Evaluated ${complianceSummary.total || 0} questions (${complianceSummary.compliant || 0} compliant, ${complianceSummary.nonCompliant || 0} non-compliant, ${complianceSummary.insufficient || 0} insufficient, ${complianceSummary.notApplicable || 0} not applicable). Auditor follow-up inputs included for ${followUpCount} observations with ${auditorAttachmentCount} attachment(s).`
      : `Draft report for ${productName} at ${siteName} with ${observations.length} observations. Auditor follow-up inputs included for ${followUpCount} observations with ${auditorAttachmentCount} attachment(s).`;

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

export const getAuditComplianceSuggestion = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id tenantOrgId auditor_id supplier_id create_by_buyer_id")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    if (audit?.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
      return res.status(404).json({ success: false, error: "Not Found" });
    }
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const standardKey = req.body?.standardKey || req.query?.standardKey;
    const standardVersion = req.body?.standardVersion || req.query?.standardVersion;
    const compliance = await runComplianceFlowForAudit({
      tenantId,
      auditId,
      actorUserId: req.user?._id,
      standardKey,
      standardVersion,
      includeQuestionResults: true,
      hydrateEvidenceSuggestions: true,
    });
    const suggestions = buildComplianceSuggestions(compliance.questionResults || []);

    return res.json({
      success: true,
      data: {
        auditId,
        runId: compliance?.run?._id || null,
        standard: compliance?.standard || null,
        summary: compliance?.summary || null,
        suggestions,
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("getAuditComplianceSuggestion error", error);
    return res.status(status).json({
      success: false,
      error: status === 403 ? "Forbidden" : "Failed to run compliance suggestion",
    });
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

export const generateCapasFromReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id tenantOrgId auditor_id supplier_id create_by_buyer_id")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    if (audit?.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
      return res.status(404).json({ success: false, error: "Not Found" });
    }
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) {
      return res.status(404).json({ success: false, error: "Draft report not found. Generate report first." });
    }

    const observations = Array.isArray(report.observations) ? report.observations : [];
    if (!observations.length) {
      return res.json({
        success: true,
        data: {
          auditId,
          reportId: report._id,
          generatedCount: 0,
          reusedCount: 0,
          skippedCount: 0,
          capas: [],
        },
      });
    }

    const observationIds = observations.map((observation) => observation?._id).filter(Boolean);
    const existingCapas = observationIds.length
      ? await Capa.find({
          auditId,
          linkedObservationIds: { $in: observationIds },
        })
          .select("_id linkedObservationIds")
          .lean()
      : [];
    const existingByObservationId = new Map();
    existingCapas.forEach((capa) => {
      (Array.isArray(capa.linkedObservationIds) ? capa.linkedObservationIds : []).forEach((observationId) => {
        const key = String(observationId || "");
        if (!key) return;
        const list = existingByObservationId.get(key) || [];
        list.push(String(capa._id));
        existingByObservationId.set(key, list);
      });
    });

    const created = [];
    const reused = [];
    const skipped = [];
    const questionUpdates = [];

    for (const observation of observations) {
      const observationId = String(observation?._id || "");
      if (!shouldCreateCapaFromObservation(observation)) {
        skipped.push({
          observationId,
          title: observation?.title || "Observation",
          reason: "Observation does not require CAPA.",
        });
        continue;
      }

      const existingLinks = Array.from(
        new Set([
          ...(Array.isArray(observation?.linkedCapaIds)
            ? observation.linkedCapaIds.map((item) => String(item))
            : []),
          ...(existingByObservationId.get(observationId) || []),
        ])
      ).filter(Boolean);

      if (existingLinks.length) {
        observation.linkedCapaIds = normalizeObjectIdArray(existingLinks);
        reused.push({
          observationId,
          title: observation?.title || "Observation",
          capaIds: existingLinks,
        });
        if (observation?.questionId) {
          questionUpdates.push({
            updateOne: {
              filter: { _id: observation.questionId },
              update: { $addToSet: { linkedCapaIds: { $each: normalizeObjectIdArray(existingLinks) } } },
            },
          });
        }
        continue;
      }

      const severity = observationToCapaSeverity(observation?.severity);
      const capaTenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || undefined;
      const capa = await Capa.create({
        tenantOrgId: capaTenantId,
        auditId: audit._id,
        title: `CAPA - ${String(observation?.title || "Observation").slice(0, 180)}`,
        description: [
          observation?.notes ? String(observation.notes).trim() : "",
          observation?.cfr ? `Reference: ${observation.cfr}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        severity,
        status: "NEEDS_SUPPLIER",
        supplierId: audit.supplier_id || null,
        buyerId: audit.create_by_buyer_id || null,
        auditorId: audit.auditor_id || null,
        ownerId: audit.supplier_id || null,
        linkedQuestionIds: observation?.questionId ? [observation.questionId] : [],
        linkedObservationIds: observation?._id ? [observation._id] : [],
        targetDate: resolveCapaTargetDate(severity),
        createdBy: req.user?._id,
        updatedBy: req.user?._id,
        metadata: {
          source: "AUTO_FROM_AUDIT_REPORT",
          classification: String(observation?.classification || "None"),
        },
      });

      observation.linkedCapaIds = normalizeObjectIdArray([
        ...(Array.isArray(observation?.linkedCapaIds) ? observation.linkedCapaIds : []),
        capa._id,
      ]);

      created.push({
        capaId: capa._id,
        observationId,
        title: capa.title,
        severity: capa.severity,
        targetDate: capa.targetDate,
      });

      if (observation?.questionId) {
        questionUpdates.push({
          updateOne: {
            filter: { _id: observation.questionId },
            update: { $addToSet: { linkedCapaIds: capa._id } },
          },
        });
      }
    }

    if (questionUpdates.length) {
      await AuditQuestions.bulkWrite(questionUpdates, { ordered: false });
    }

    report.updatedBy = req.user?._id;
    await report.save();

    return res.json({
      success: true,
      data: {
        auditId,
        reportId: report._id,
        generatedCount: created.length,
        reusedCount: reused.length,
        skippedCount: skipped.length,
        capas: created,
        reused,
        skipped,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("generateCapasFromReport error", error);
    return res.status(status).json({
      success: false,
      error: status === 403 ? "Forbidden" : "Failed to generate CAPAs",
    });
  }
};
