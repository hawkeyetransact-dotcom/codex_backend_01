import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditReport } from "../models/auditReportModel.js";
import { AccessGrant } from "../models/accessGrantModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { ENABLE_AUDIT_EVENT_LOG } from "../config/featureFlags.js";
import { mergeReportTemplate } from "../utils/reportTemplateEngine.js";
import { renderReportHtml } from "../utils/reportHtmlRenderer.js";

const WHO_GMP_TEMPLATE = {
  name: "WHO-GMP Execution Questionnaire Report",
  blocks: [
    { id: "who-title", type: "title", content: "WHO-GMP Audit Report" },
    {
      id: "who-meta",
      type: "meta",
      heading: "Audit Overview",
      fields: [
        { label: "Audited Facility", placeholderPath: "auditee.name" },
        { label: "Site", placeholderPath: "auditee.siteName" },
        { label: "Address", placeholderPath: "auditee.address" },
        { label: "Product", placeholderPath: "productSummary" },
        { label: "Auditor", placeholderPath: "auditor.name" },
        { label: "Audit Date", placeholderPath: "audit.startDate" },
        { label: "Audit Type", placeholderPath: "audit.type" },
        { label: "Audit Scope", placeholderPath: "audit.scope" },
      ],
    },
    { id: "who-summary", type: "richText", heading: "Summary of Key Findings", content: "{{sections.summary}}" },
    { id: "who-intro", type: "richText", heading: "Introduction", content: "{{sections.introduction}}" },
    { id: "who-facility", type: "richText", heading: "Facility", content: "{{sections.facility}}" },
    { id: "who-manufacturing", type: "richText", heading: "Manufacturing", content: "{{sections.manufacturing}}" },
    { id: "who-qc", type: "richText", heading: "Quality Control", content: "{{sections.qcLab}}" },
    { id: "who-systems", type: "richText", heading: "Quality Assurance / Systems", content: "{{sections.systems}}" },
    { id: "who-docs", type: "bullets", heading: "Documents Reviewed", listPlaceholderPath: "documentsReviewed" },
    {
      id: "who-observations",
      type: "observations",
      heading: "Observations",
      observationMapping: {
        listPath: "observations",
        fields: {
          no: "no",
          severity: "severity",
          reference: "reference",
          description: "description",
          evidence: "evidence",
          recommendation: "recommendation",
        },
      },
    },
    { id: "who-conclusion", type: "richText", heading: "Conclusion", content: "{{sections.conclusion}}" },
    { id: "who-signoff", type: "signoff", heading: "Auditor Sign-off", content: "{{signoff.auditorName}} - {{signoff.date}}" },
  ],
};

const decodeSafe = (value = "") => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
};

const parseDocUrls = (value = "") =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const hasResponse = (question) => {
  if (!question) return false;
  if (question.YesNoAnswers) return true;
  if (question.textResponse && String(question.textResponse).trim()) return true;
  const details = question.responseDetails;
  if (details && typeof details === "object") {
    return Object.values(details).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(String(value || "").trim());
    });
  }
  return false;
};

const buildAuditorName = (audit = {}) => {
  const profile = audit?.auditor_id?.profile || {};
  const parts = [profile.title, profile.firstName, profile.lastName].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return audit?.auditor_id?.email || "Auditor";
};

const buildAddress = (site = {}) => {
  const parts = [
    site.addressline1,
    site.addressline2,
    site.addressline3,
    site.city,
    site.state,
    site.country,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.join(", ");
};

const extractDocumentsReviewed = (questions = []) => {
  const docs = new Set();
  questions.forEach((question) => {
    parseDocUrls(question.docUrls || "").forEach((url) => {
      const name = decodeSafe(url.split("/").pop() || "").trim();
      docs.add(name || url);
    });
  });
  return Array.from(docs);
};

const buildObservations = (questions = []) => {
  const filtered = questions.filter(
    (question) =>
      question.flagStatus === "auditor_flagged" ||
      String(question.YesNoAnswers || "").toLowerCase() === "no" ||
      !hasResponse(question)
  );
  if (!filtered.length) {
    return [
      {
        questionId: null,
        title: "No critical observations identified from execution questionnaire responses.",
        severity: "Info",
        classification: "None",
        followUp: false,
        cfr: "WHO-GMP",
        notes: "Evidence references are aligned with answered questionnaire responses.",
        linkedEvidenceIds: [],
        linkedCapaIds: [],
        linkedFindingId: null,
      },
    ];
  }

  return filtered.slice(0, 50).map((question, index) => ({
    questionId: question._id,
    title: question.question,
    severity: String(question.YesNoAnswers || "").toLowerCase() === "no" ? "Major" : question.severity || "Minor",
    classification: question.actionClass || "None",
    followUp: question.flagStatus === "auditor_flagged" || !!question.followUp,
    cfr: "WHO-GMP",
    notes: question.textResponse || "",
    no: index + 1,
    reference: question.questionCode || question.categoryName || "Execution questionnaire",
    description: question.question || "",
    evidence: parseDocUrls(question.docUrls || "").join(", ") || "No explicit linked evidence",
    recommendation:
      question.flagStatus === "auditor_flagged" || String(question.YesNoAnswers || "").toLowerCase() === "no"
        ? "Provide additional evidence and CAPA details."
        : "Maintain current documented controls.",
    linkedEvidenceIds: question.linkedEvidenceIds || [],
    linkedCapaIds: question.linkedCapaIds || [],
    linkedFindingId: question.linkedFindingId || null,
  }));
};

const buildWhoGmpSections = (questions = [], docs = []) => {
  const answered = questions.filter((question) => hasResponse(question));
  const total = questions.length || 0;
  const answeredCount = answered.length;
  const missingCount = Math.max(total - answeredCount, 0);

  const pickNarrative = (matcher, fallback) => {
    const snippets = answered
      .filter((question) => matcher.test(String(question.categoryName || "")) || matcher.test(String(question.question || "")))
      .slice(0, 3)
      .map((question) => question.textResponse || question.YesNoAnswers || "")
      .filter(Boolean);
    return snippets.length ? snippets.join(" ") : fallback;
  };

  return {
    summary: `Execution questionnaire review completed. ${answeredCount} of ${total} questions were answered with linked evidence references. ${missingCount} items require follow-up confirmation.`,
    introduction:
      "This WHO-GMP report is generated from execution questionnaire responses and linked evidence attachments submitted for this audit request.",
    facility: pickNarrative(/facility|site|warehouse/i, "Facility controls and site documentation were reviewed against execution questionnaire responses."),
    manufacturing: pickNarrative(
      /manufacturing|production|process|pfd/i,
      "Manufacturing process controls were assessed using process flow diagrams and supporting SOP indices."
    ),
    qcLab: pickNarrative(
      /quality control|qc|laboratory|testing/i,
      "Quality control coverage was assessed from available questionnaire responses and documentary evidence."
    ),
    systems: pickNarrative(
      /qa|quality assurance|system|deviation|change|capa|training|sop/i,
      "Quality systems (SOP, QA, CAPA, and compliance controls) were reviewed against provided evidence."
    ),
    conclusion: docs.length
      ? "Based on the provided evidence set, the site demonstrates broad WHO-GMP alignment, subject to closure of follow-up items."
      : "Conclusion is limited due to missing evidence links. Additional documents are required for full WHO-GMP assessment.",
  };
};

export const buildWhoGmpDraftReport = async ({ auditId, tenantId, actorUserId } = {}) => {
  if (!auditId) {
    const err = new Error("auditId is required");
    err.status = 400;
    throw err;
  }
  const audit = await AuditRequestMaster.findById(auditId)
    .populate("supplier_product_id", "name casNumber dosageForm apiTechnology")
    .populate("site_id", "site_name city state country addressline1 addressline2 addressline3")
    .populate("auditor_id", "email profile")
    .populate("supplier_id", "email profile")
    .lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }

  const qs = await AuditQuestions.find({ auditRequestId: auditId }).lean();
  const observations = buildObservations(qs);
  const productName = audit?.supplier_product_id?.name || "N/A";
  const siteName = audit?.site_id?.site_name || "N/A";
  const supplierName = audit?.supplier_id?.profile?.companyName || audit?.supplier_id?.email || "Auditee";
  const auditorName = buildAuditorName(audit);
  const documentsReviewed = extractDocumentsReviewed(qs);
  const sections = buildWhoGmpSections(qs, documentsReviewed);
  const summary = `${WHO_GMP_TEMPLATE.name} generated for ${supplierName} (${siteName}) with ${observations.length} observations.`;

  const reportData = {
    auditee: {
      name: supplierName,
      siteName,
      address: buildAddress(audit?.site_id || {}),
    },
    productSummary: productName,
    auditor: {
      name: auditorName,
    },
    audit: {
      startDate: audit?.complianceDate || new Date(),
      type: "Execution Questionnaire Review",
      scope: "WHO-GMP execution questionnaire and linked evidence review.",
    },
    products: audit?.supplier_product_id
      ? [
          {
            name: audit.supplier_product_id.name || "",
            casNumber: audit.supplier_product_id.casNumber || "",
            dosageForm: audit.supplier_product_id.dosageForm || "",
            apiTechnology: audit.supplier_product_id.apiTechnology || "",
          },
        ]
      : [],
    documentsReviewed,
    sections,
    observations: observations.map((observation, index) => ({
      no: observation.no || index + 1,
      severity: observation.severity || "Info",
      reference: observation.reference || "Execution questionnaire",
      description: observation.description || observation.title || "",
      evidence: observation.evidence || "No explicit linked evidence",
      recommendation: observation.recommendation || "Provide supporting evidence where required.",
    })),
    signoff: {
      auditorName,
      date: new Date(),
    },
  };
  const merged = mergeReportTemplate(WHO_GMP_TEMPLATE, reportData);
  const html = renderReportHtml({ renderedBlocks: merged.renderedBlocks });

  const report = await AuditReport.findOneAndUpdate(
    { auditRequestId: auditId },
    {
      $set: {
        auditRequestId: auditId,
        tenantOrgId: audit.tenantOrgId || tenantId || null,
        summary,
        reportFormat: "WHO_GMP",
        templateName: WHO_GMP_TEMPLATE.name,
        generatedAt: new Date(),
        html,
        renderedBlocks: merged.renderedBlocks,
        reportData,
        documentsReviewed,
        observations,
        status: "DRAFT",
        updatedBy: actorUserId || undefined,
      },
      $setOnInsert: {
        createdBy: actorUserId || undefined,
      },
    },
    { new: true, upsert: true }
  );

  return { report, audit };
};

export const generateDraftReport = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { report, audit } = await buildWhoGmpDraftReport({
      auditId,
      tenantId: req.tenantId || req.user?.tenant_id || null,
      actorUserId: req.user?._id,
    });

    if (ENABLE_AUDIT_EVENT_LOG) {
      await writeAuditEvent({
        tenantId: report.tenantOrgId || req.tenantId || req.user?.tenant_id || null,
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
