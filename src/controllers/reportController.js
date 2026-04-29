import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditReport } from "../models/auditReportModel.js";
import { Capa } from "../models/capaModel.js";
import { AccessGrant } from "../models/accessGrantModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { ReportTemplate } from "../models/reportTemplateModel.js";
import mongoose from "mongoose";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { runComplianceFlowForAudit } from "../services/compliance/complianceFlowService.js";
import { recordAiActionMetric } from "../services/aiActionMetricService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { buildAuditReportData } from "../services/reportDataService.js";
import { mergeReportTemplate } from "../utils/reportTemplateEngine.js";
import { notifySupplier, notifyUsers } from "../services/governance/notifySupplier.js";

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

const resolveAuditIdParam = async (auditIdParam) => {
  const resolved = await resolveAuditRequestId({
    requestId: auditIdParam,
    AuditRequestModel: AuditRequestMaster,
  });
  if (!resolved) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  return String(resolved);
};

const DEFAULT_COMPLIANCE_STANDARD_KEY = "ICH_Q7_CFR21";

const isPlatformScopedAdmin = (req) => {
  const role = String(req.user?.role || "").toLowerCase();
  if (role === "superadmin") return true;
  return String(req.user?.adminScope || "").toUpperCase() === "PLATFORM";
};

const assertAuditTenantVisibility = ({ audit, req, allowAssignedAuditor = false }) => {
  if (!audit?.tenantOrgId || !req?.tenantId) return;
  if (String(audit.tenantOrgId) === String(req.tenantId)) return;
  if (isPlatformScopedAdmin(req)) return;
  const role = String(req.user?.role || "").toLowerCase();
  if (allowAssignedAuditor && role === "auditor") return;
  const err = new Error("Not Found");
  err.status = 404;
  throw err;
};

const toTemplateObservationRows = (observations = []) =>
  (Array.isArray(observations) ? observations : []).map((observation, index) => ({
    no: index + 1,
    severity: observation?.severity || "Info",
    reference: observation?.cfr || "",
    description: observation?.title || "Observation",
    evidence: observation?.notes || "",
    recommendation: observation?.followUp
      ? "Provide corrective action and objective evidence to close this observation."
      : "Maintain current controls and monitor through periodic review.",
    capaDueDate: "",
  }));

const resolveReportTemplateContext = async ({ auditId, requestTemplateId, reportArtifact }) => {
  let template = null;
  let source = "none";
  const candidateIds = [];
  const fromRequest = String(requestTemplateId || "").trim();
  const fromArtifact = String(reportArtifact?.data?.reportTemplateId || "").trim();
  if (fromRequest) candidateIds.push(fromRequest);
  if (fromArtifact) candidateIds.push(fromArtifact);

  for (const candidate of candidateIds) {
    if (!mongoose.Types.ObjectId.isValid(candidate)) continue;
    template = await ReportTemplate.findById(candidate).lean();
    if (template?.isActive !== false) {
      source = candidate === fromRequest ? "request" : "final_report_artifact";
      break;
    }
  }

  if (!template) {
    const requestedName = String(reportArtifact?.data?.reportTemplateName || "").trim();
    if (requestedName) {
      template = await ReportTemplate.findOne({ name: requestedName, isActive: true })
        .sort({ updatedAt: -1 })
        .lean();
      if (template) source = "final_report_artifact_name";
    }
  }

  if (!template) {
    template = await ReportTemplate.findOne({
      isActive: true,
      $or: [{ category: { $regex: /who|gmp|whopir/i } }, { name: { $regex: /who|gmp|whopir/i } }],
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (template) source = "category_fallback";
  }

  if (!template) {
    template = await ReportTemplate.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
    if (template) source = "active_fallback";
  }

  if (!template) {
    return {
      template: null,
      source: "none",
      renderedBlocks: [],
      highlights: [],
      reportData: null,
    };
  }

  const reportData = await buildAuditReportData(auditId);
  if (!reportData) {
    return {
      template,
      source,
      renderedBlocks: [],
      highlights: [],
      reportData: null,
    };
  }
  const { renderedBlocks, highlights } = mergeReportTemplate(template, reportData);
  return {
    template,
    source,
    renderedBlocks,
    highlights,
    reportData,
  };
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
  const startedAt = Date.now();
  const actionKey = "report_generation";
  try {
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const audit = await AuditRequestMaster.findById(auditId)
      .select("tenantOrgId auditor_id supplier_id create_by_buyer_id supplier_product_id site_id")
      .populate("supplier_product_id", "name")
      .populate("site_id", "site_name")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    assertAuditTenantVisibility({ audit, req, allowAssignedAuditor: true });
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const qs = await AuditQuestions.find({ auditRequestId: auditId }).lean();
    const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
    const reportArtifact = await AuditArtifact.findOne({
      auditId: audit._id,
      artifactType: "FINAL_REPORT",
    })
      .select("_id templateId data")
      .lean();

    let observations = [];
    let complianceMeta = null;
    try {
      if (tenantId) {
        const requestedStandardKey = req.body?.standardKey || req.query?.standardKey;
        const compliance = await runComplianceFlowForAudit({
          tenantId,
          auditId,
          actorUserId: req.user?._id,
          standardKey: requestedStandardKey || DEFAULT_COMPLIANCE_STANDARD_KEY,
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

    const templateContext = await resolveReportTemplateContext({
      auditId,
      requestTemplateId: req.body?.reportTemplateId,
      reportArtifact,
    });
    const templateObservationRows = toTemplateObservationRows(observations);
    let renderedBlocks = Array.isArray(templateContext.renderedBlocks)
      ? templateContext.renderedBlocks
      : [];
    if (renderedBlocks.length && templateObservationRows.length) {
      renderedBlocks = renderedBlocks.map((block) =>
        String(block?.type || "").toLowerCase() === "observations"
          ? { ...block, observations: templateObservationRows }
          : block
      );
    }
    const productName = audit?.supplier_product_id?.name || "product";
    const siteName = audit?.site_id?.site_name || "site";
    const complianceSummary = complianceMeta?.summary;
    const standardLabel = complianceMeta?.standard
      ? `${complianceMeta.standard.name || complianceMeta.standard.standardKey} (${complianceMeta.standard.standardKey} v${complianceMeta.standard.version})`
      : "ICH Q7";
    const followUpCount = observations.filter((observation) => observation.followUp).length;
    const auditorAttachmentCount = countAuditorAttachments(qs);
    const templateLabel = templateContext.template?.name
      ? ` Template: ${templateContext.template.name}.`
      : "";
    const summary = complianceSummary
      ? `Draft report for ${productName} at ${siteName}. Standard: ${standardLabel}. Evaluated ${complianceSummary.total || 0} questions (${complianceSummary.compliant || 0} compliant, ${complianceSummary.nonCompliant || 0} non-compliant, ${complianceSummary.insufficient || 0} insufficient, ${complianceSummary.notApplicable || 0} not applicable). Auditor follow-up inputs included for ${followUpCount} observations with ${auditorAttachmentCount} attachment(s).${templateLabel}`
      : `Draft report for ${productName} at ${siteName} with ${observations.length} observations. Auditor follow-up inputs included for ${followUpCount} observations with ${auditorAttachmentCount} attachment(s).${templateLabel}`;

    const report = await AuditReport.findOneAndUpdate(
      { auditRequestId: auditId },
      {
        auditRequestId: auditId,
        tenantOrgId: tenantId,
        summary,
        observations,
        reportTemplateId: templateContext.template?._id || null,
        reportTemplateName: templateContext.template?.name || "",
        reportTemplateSource: templateContext.source || "",
        renderedBlocks,
        templateHighlights: Array.isArray(templateContext.highlights)
          ? templateContext.highlights.slice(0, 500)
          : [],
        reportContextSnapshot: templateContext.reportData
          ? {
              auditRequestId: auditId,
              generatedAt: new Date(),
              observations: templateObservationRows,
              standards: templateContext.reportData?.audit?.standards || [],
            }
          : null,
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

    await recordAiActionMetric({
      tenantId: tenantId || req.user?.tenant_id || null,
      auditId,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "success",
      inputCount: Number(qs.length || 0),
      outputCount: Number(observations.length || 0),
      durationMs: Date.now() - startedAt,
      metadata: {
        complianceRunId: complianceMeta?.runId || null,
        reportTemplateId: templateContext.template?._id
          ? String(templateContext.template._id)
          : null,
        reportTemplateSource: templateContext.source || null,
      },
    });

    // Notify the buyer (audit creator) that the draft is ready for review.
    if (audit.create_by_buyer_id) {
      notifyUsers({
        tenantId,
        userIds: [audit.create_by_buyer_id],
        eventKey: "AUDIT_REPORT_DRAFTED",
        actionUrl: `/audits/${audit._id}/report`,
        payload: { auditId: audit._id, reportId: report._id, observationCount: observations.length },
      }).catch((e) => console.error("notifyUsers(AUDIT_REPORT_DRAFTED) failed:", e?.message));
    }

    return res.json({ success: true, data: report });
  } catch (error) {
    const status = error?.status || 500;
    const message = error?.message || "Failed to generate report";
    await recordAiActionMetric({
      tenantId: req.tenantId || req.user?.tenant_id || null,
      auditId: req.params?.auditId || null,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "error",
      durationMs: Date.now() - startedAt,
      metadata: { error: message },
    });
    console.error("generateDraftReport error", error);
    return res.status(status).json({ success: false, error: message });
  }
};

export const getAuditComplianceSuggestion = async (req, res) => {
  const startedAt = Date.now();
  const actionKey = "compliance_analysis";
  try {
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id tenantOrgId auditor_id supplier_id create_by_buyer_id")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    assertAuditTenantVisibility({ audit, req, allowAssignedAuditor: true });
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "Tenant context missing" });
    }

    const standardKey =
      req.body?.standardKey || req.query?.standardKey || DEFAULT_COMPLIANCE_STANDARD_KEY;
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

    const payload = {
      success: true,
      data: {
        auditId,
        runId: compliance?.run?._id || null,
        standard: compliance?.standard || null,
        summary: compliance?.summary || null,
        suggestions,
        generatedAt: new Date(),
      },
    };
    await recordAiActionMetric({
      tenantId,
      auditId,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "success",
      inputCount: Number(compliance?.summary?.total || 0),
      outputCount: Number(suggestions?.items?.length || 0),
      durationMs: Date.now() - startedAt,
      metadata: {
        runId: compliance?.run?._id || null,
        standardKey: compliance?.standard?.standardKey || null,
        standardVersion: compliance?.standard?.version || null,
      },
    });
    return res.json(payload);
  } catch (error) {
    const status = error.status || 500;
    const message = error?.message || "Failed to run compliance suggestion";
    await recordAiActionMetric({
      tenantId: req.tenantId || req.user?.tenant_id || null,
      auditId: req.params?.auditId || null,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "error",
      durationMs: Date.now() - startedAt,
      metadata: { error: message },
    });
    console.error("getAuditComplianceSuggestion error", error);
    return res.status(status).json({
      success: false,
      error: status === 403 ? "Forbidden" : message,
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
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
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
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const { role } = req.body;
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    report.signatures = report.signatures || [];
    report.signatures.push({
      role: role || req.user?.role || "auditor",
      userId: req.user?._id,
      signedAt: new Date(),
    });
    // If we have signatures from auditor + buyer + supplier, mark COMPLETED.
    const sigRoles = new Set(report.signatures.map((s) => s.role));
    if (sigRoles.has("auditor") && sigRoles.has("buyer") && (sigRoles.has("supplier") || sigRoles.has("supplierUser"))) {
      report.status = "COMPLETED";
    } else {
      report.status = "PENDING_SIGNATURES";
    }
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

    // Notify the other parties (so they know it's their turn or that it's finalized).
    try {
      const audit = await AuditRequestMaster.findById(auditId)
        .select("auditor_id supplier_id create_by_buyer_id tenantOrgId").lean();
      if (audit) {
        const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
        const remaining = [];
        if (!sigRoles.has("auditor") && audit.auditor_id) remaining.push(audit.auditor_id);
        if (!sigRoles.has("buyer") && audit.create_by_buyer_id) remaining.push(audit.create_by_buyer_id);
        if (!sigRoles.has("supplier") && !sigRoles.has("supplierUser") && audit.supplier_id) remaining.push(audit.supplier_id);
        if (remaining.length && report.status !== "COMPLETED") {
          notifyUsers({
            tenantId, userIds: remaining, eventKey: "AUDIT_REPORT_AWAITING_SIGNATURE",
            actionUrl: `/audits/${auditId}/report`,
            payload: { auditId, reportId: report._id, signedBy: role || req.user?.role },
          }).catch(() => {});
        }
        if (report.status === "COMPLETED") {
          const all = [audit.auditor_id, audit.create_by_buyer_id, audit.supplier_id].filter(Boolean);
          notifyUsers({
            tenantId, userIds: all, eventKey: "AUDIT_REPORT_COMPLETED",
            actionUrl: `/audits/${auditId}/report`,
            payload: { auditId, reportId: report._id },
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("signReport notify failed:", e?.message);
    }

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("signReport error", error);
    return res.status(500).json({ success: false, error: "Failed to sign report" });
  }
};

// Buyer/QA review action — moves a draft report into PENDING_REVIEW or APPROVED.
export const reviewReport = async (req, res) => {
  try {
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const { decision, comments } = req.body || {};
    if (!["APPROVED", "PENDING_REVIEW", "DRAFT"].includes(decision)) {
      return res.status(400).json({ success: false, error: "decision must be APPROVED, PENDING_REVIEW, or DRAFT" });
    }
    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });
    report.status = decision;
    report.factualAccuracyReview = {
      reviewerId: req.user?._id,
      reviewedAt: new Date(),
      decision,
      comments: comments || null,
    };
    await report.save();

    // Notify auditor of decision.
    try {
      const audit = await AuditRequestMaster.findById(auditId)
        .select("auditor_id supplier_id tenantOrgId").lean();
      if (audit?.auditor_id) {
        const tenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null;
        notifyUsers({
          tenantId, userIds: [audit.auditor_id], eventKey: "AUDIT_REPORT_REVIEWED",
          actionUrl: `/audits/${auditId}/report`,
          payload: { auditId, reportId: report._id, decision, comments: comments || null },
        }).catch(() => {});
        if (decision === "APPROVED" && audit.supplier_id) {
          notifySupplier({
            tenantId, supplierUserId: audit.supplier_id, eventKey: "AUDIT_REPORT_APPROVED",
            actionUrl: `/audits/${auditId}/report`,
            payload: { auditId, reportId: report._id },
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("reviewReport notify failed:", e?.message);
    }

    return res.json({ success: true, data: report });
  } catch (error) {
    console.error("reviewReport error", error);
    return res.status(500).json({ success: false, error: "Failed to review report" });
  }
};

export const updateReportObservationLinks = async (req, res) => {
  try {
    const requestedAuditId = req.params?.auditId;
    const { observationId } = req.params;
    const auditId = await resolveAuditIdParam(requestedAuditId);
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
  const startedAt = Date.now();
  const actionKey = "capa_generation";
  try {
    const requestedAuditId = req.params?.auditId;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id tenantOrgId auditor_id supplier_id create_by_buyer_id")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    assertAuditTenantVisibility({ audit, req, allowAssignedAuditor: true });
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) {
      return res.status(404).json({ success: false, error: "Draft report not found. Generate report first." });
    }

    const observations = Array.isArray(report.observations) ? report.observations : [];
    if (!observations.length) {
      const payload = {
        success: true,
        data: {
          auditId,
          reportId: report._id,
          generatedCount: 0,
          reusedCount: 0,
          skippedCount: 0,
          capas: [],
        },
      };
      await recordAiActionMetric({
        tenantId: audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
        auditId,
        actionKey,
        userId: req.user?._id,
        userRole: req.user?.role,
        status: "success",
        inputCount: 0,
        outputCount: 0,
        durationMs: Date.now() - startedAt,
      });
      return res.json(payload);
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

    const payload = {
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
    };
    await recordAiActionMetric({
      tenantId: audit.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
      auditId,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "success",
      inputCount: Number(observations.length || 0),
      outputCount: Number(created.length || 0),
      durationMs: Date.now() - startedAt,
      metadata: {
        reusedCount: reused.length,
        skippedCount: skipped.length,
      },
    });
    return res.json(payload);
  } catch (error) {
    const status = error.status || 500;
    await recordAiActionMetric({
      tenantId: req.tenantId || req.user?.tenant_id || null,
      auditId: req.params?.auditId || null,
      actionKey,
      userId: req.user?._id,
      userRole: req.user?.role,
      status: "error",
      durationMs: Date.now() - startedAt,
      metadata: { error: error?.message || "capa generation failed" },
    });
    console.error("generateCapasFromReport error", error);
    return res.status(status).json({
      success: false,
      error: status === 403 ? "Forbidden" : "Failed to generate CAPAs",
    });
  }
};

/**
 * Tier-3c: Per-observation V1 audit observation → CAPA helper.
 *
 * Same field mapping as `generateCapasFromReport` but for ONE observation.
 * Idempotent — if a CAPA is already linked to this observation, returns the
 * existing one instead of creating a duplicate.
 *
 * POST /api/audits/:auditId/report/observations/:observationId/capa
 */
export const createCapaFromObservation = async (req, res) => {
  try {
    const requestedAuditId = req.params?.auditId;
    const { observationId } = req.params;
    const auditId = await resolveAuditIdParam(requestedAuditId);
    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id tenantOrgId auditor_id supplier_id create_by_buyer_id")
      .lean();
    if (!audit) return res.status(404).json({ success: false, error: "Audit not found" });
    assertAuditTenantVisibility({ audit, req, allowAssignedAuditor: true });
    await ensureAuditorCanAccessAudit({ audit, user: req.user });

    const report = await AuditReport.findOne({ auditRequestId: auditId });
    if (!report) return res.status(404).json({ success: false, error: "Report not found" });

    const observation = report.observations?.id(observationId);
    if (!observation) return res.status(404).json({ success: false, error: "Observation not found" });

    if (!shouldCreateCapaFromObservation(observation)) {
      return res.status(400).json({
        success: false,
        error: "Observation does not qualify for CAPA (severity / classification / followUp).",
      });
    }

    // Reuse existing CAPA if linked
    const existingLinks = Array.isArray(observation.linkedCapaIds) ? observation.linkedCapaIds : [];
    if (existingLinks.length) {
      const existing = await Capa.findById(existingLinks[0]).select("_id title severity status targetDate").lean();
      if (existing) {
        return res.json({ success: true, data: { capa: existing, reused: true } });
      }
    }

    // Otherwise create with the same shape as generateCapasFromReport
    const severity = observationToCapaSeverity(observation?.severity);
    const capaTenantId = audit.tenantOrgId || req.tenantId || req.user?.tenant_id || undefined;
    const capa = await Capa.create({
      tenantOrgId: capaTenantId,
      auditId: audit._id,
      title: `CAPA - ${String(observation?.title || "Observation").slice(0, 180)}`,
      description: [
        observation?.notes ? String(observation.notes).trim() : "",
        observation?.cfr ? `Reference: ${observation.cfr}` : "",
      ].filter(Boolean).join(" "),
      severity,
      status: "NEEDS_SUPPLIER",
      supplierId: audit.supplier_id || null,
      buyerId: audit.create_by_buyer_id || null,
      auditorId: audit.auditor_id || null,
      ownerId: audit.supplier_id || null,
      linkedQuestionIds: observation?.questionId ? [observation.questionId] : [],
      linkedObservationIds: [observation._id],
      targetDate: resolveCapaTargetDate(severity),
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
      metadata: {
        source: "AUTO_FROM_AUDIT_OBSERVATION",
        classification: String(observation?.classification || "None"),
        triggeredBy: "per_observation_endpoint",
      },
    });

    observation.linkedCapaIds = normalizeObjectIdArray([
      ...(Array.isArray(observation?.linkedCapaIds) ? observation.linkedCapaIds : []),
      capa._id,
    ]);
    report.updatedBy = req.user?._id;
    await report.save();

    return res.json({
      success: true,
      data: {
        capa: { _id: capa._id, title: capa.title, severity: capa.severity, status: capa.status, targetDate: capa.targetDate },
        reused: false,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("createCapaFromObservation error", error);
    return res.status(status).json({ success: false, error: status === 403 ? "Forbidden" : "Failed to create CAPA" });
  }
};
