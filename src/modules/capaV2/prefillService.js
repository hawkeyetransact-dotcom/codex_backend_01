import mongoose from "mongoose";
import { AuditRequestMaster } from "../../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../../models/auditQuestionsModels.js";
import { AuditReport } from "../../models/auditReportModel.js";
import { Capa } from "../../models/capaModel.js";
import { CapaCandidate, CapaSimilarityLink, CapaV2 } from "../../models/capaV2Models.js";
import { resolveAuditRequestId } from "../../services/requestIdService.js";

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value) => new Set(normalizeText(value).split(" ").filter(Boolean));

const jaccard = (a, b) => {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  const intersection = Array.from(setA).filter((token) => setB.has(token)).length;
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
};

const parseDocUrls = (value = "") =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const deriveSeverity = ({ verdict = "", followUp = false, observationSeverity = "" }) => {
  const obs = String(observationSeverity || "").toUpperCase();
  if (obs === "CRITICAL") return "CRITICAL";
  if (obs === "MAJOR") return "HIGH";
  if (obs === "MINOR") return "MEDIUM";
  const verdictNorm = String(verdict || "").toUpperCase();
  if (verdictNorm === "NON_COMPLIANT") return "HIGH";
  if (verdictNorm === "INSUFFICIENT") return "MEDIUM";
  if (followUp) return "MEDIUM";
  return "LOW";
};

const dueDateFromSeverity = (severity = "MEDIUM") => {
  const now = Date.now();
  const level = String(severity || "").toUpperCase();
  if (level === "CRITICAL") return new Date(now + 14 * 24 * 60 * 60 * 1000);
  if (level === "HIGH") return new Date(now + 30 * 24 * 60 * 60 * 1000);
  if (level === "MEDIUM") return new Date(now + 45 * 24 * 60 * 60 * 1000);
  return new Date(now + 60 * 24 * 60 * 60 * 1000);
};

const sourceCategoryFromQuestion = (question = {}) => {
  const category = normalizeText(question.categoryName || "");
  if (category.includes("training")) return "TRAINING";
  if (category.includes("data integrity")) return "DATA_INTEGRITY";
  if (category.includes("equipment")) return "EQUIPMENT";
  if (category.includes("facility")) return "FACILITY";
  if (category.includes("validation")) return "VALIDATION";
  if (category.includes("supplier")) return "SUPPLIER";
  return "QUALITY_SYSTEM";
};

const buildQuestionCandidate = ({ audit, question }) => {
  const comments = String(question?.responseDetails?.auditorVerification?.comments || "").trim();
  const questionText = String(question?.question || "").trim();
  const followUpMsg = String(question?.messages || "").trim();
  const notes = String(question?.internalNotes || "").trim();
  const verdict =
    question?.responseDetails?.auditorVerification?.isCompliant === false ||
    question?.isComplient === "No"
      ? "NON_COMPLIANT"
      : "";
  const followUp = Boolean(
    question?.responseDetails?.auditorVerification?.followUp ||
      question?.flagStatus === "auditor_flagged" ||
      followUpMsg
  );
  if (!followUp && !comments && !notes && verdict !== "NON_COMPLIANT") return null;

  const severity = deriveSeverity({ verdict, followUp });
  const title = comments
    ? comments.split(".").map((part) => part.trim()).find(Boolean) || questionText
    : questionText;
  const descriptionBlocks = [
    comments ? `Auditor comment: ${comments}` : "",
    notes ? `Internal note: ${notes}` : "",
    followUpMsg ? `Follow-up: ${followUpMsg}` : "",
    questionText ? `Question: ${questionText}` : "",
  ].filter(Boolean);
  const docUrls = parseDocUrls(question.docUrls || "");
  const sourceReferences = [
    {
      sourceType: "QUESTIONNAIRE_REVIEW",
      auditId: audit._id,
      questionId: question._id,
      sourcePath: `auditQuestions/${question._id}`,
      snippet: comments || notes || followUpMsg || questionText,
      confidence: comments ? 0.88 : 0.76,
      autoFillStatus: comments ? "supported_inference" : "needs_human_review",
      evidenceDocumentName: docUrls[0] || "",
      generatedAt: new Date(),
    },
  ];

  return {
    tenantOrgId: audit.tenantOrgId || "",
    auditId: audit._id,
    supplierId: audit.supplier_id || null,
    buyerId: audit.create_by_buyer_id || null,
    auditorId: audit.auditor_id || null,
    siteId: audit.site_id || null,
    productId: audit.supplier_product_id || null,
    title: title.slice(0, 300),
    issueStatement: questionText,
    detailedDescription: descriptionBlocks.join(" "),
    observationCategory: sourceCategoryFromQuestion(question),
    severitySuggestion: severity,
    riskRationaleDraft:
      severity === "HIGH" || severity === "CRITICAL"
        ? "Potential GMP/compliance impact detected from auditor review signal."
        : "Review signal detected and requires triage confirmation.",
    classificationSuggestion:
      severity === "HIGH" || severity === "CRITICAL" ? "FULL_CAPA" : "CORRECTION_ONLY",
    dueDateSuggestion: dueDateFromSeverity(severity),
    sourceReferences,
    traceability: [
      {
        sourceRecordType: "audit_question",
        sourceRecordId: String(question._id),
        sourceLabel: questionText.slice(0, 180),
        section: question.categoryName || "",
        subsection: question.subCategoryName || "",
        snippet: comments || notes || followUpMsg || questionText,
        confidence: comments ? 0.88 : 0.76,
      },
    ],
    generatedByEngine: "CAPA_V2_PREFILL_V1",
    metadata: { source: "questionnaire_review", questionCode: question.questionCode || "" },
  };
};

const buildObservationCandidate = ({ audit, report, observation }) => {
  const followUp = Boolean(observation?.followUp);
  const severity = deriveSeverity({
    followUp,
    observationSeverity: observation?.severity || "",
  });
  if (!followUp && severity === "LOW") return null;
  const title = String(observation?.title || "Audit observation").trim();
  const notes = String(observation?.notes || "").trim();
  const reference = String(observation?.cfr || "ICH Q7").trim();

  return {
    tenantOrgId: audit.tenantOrgId || "",
    auditId: audit._id,
    supplierId: audit.supplier_id || null,
    buyerId: audit.create_by_buyer_id || null,
    auditorId: audit.auditor_id || null,
    siteId: audit.site_id || null,
    productId: audit.supplier_product_id || null,
    title: title.slice(0, 300),
    issueStatement: title,
    detailedDescription: [notes, reference ? `Reference: ${reference}` : ""].filter(Boolean).join(" "),
    observationCategory: "QUALITY_SYSTEM",
    severitySuggestion: severity,
    riskRationaleDraft:
      followUp || severity === "HIGH" || severity === "CRITICAL"
        ? "Report observation requires corrective and preventive review."
        : "Observation requires triage confirmation.",
    classificationSuggestion:
      severity === "HIGH" || severity === "CRITICAL" || followUp ? "FULL_CAPA" : "CORRECTION_ONLY",
    dueDateSuggestion: dueDateFromSeverity(severity),
    sourceReferences: [
      {
        sourceType: "EXTERNAL_SUPPLIER_AUDIT",
        auditId: audit._id,
        reportId: report?._id || null,
        reportObservationId: observation?._id || null,
        sourcePath: `auditReport/${report?._id || ""}/observations/${observation?._id || ""}`,
        snippet: notes || title,
        confidence: 0.9,
        autoFillStatus: "supported_inference",
        generatedAt: new Date(),
      },
    ],
    traceability: [
      {
        sourceRecordType: "report_observation",
        sourceRecordId: String(observation?._id || ""),
        sourceLabel: title,
        section: "FINDINGS",
        subsection: observation?.classification || "",
        snippet: notes || title,
        confidence: 0.9,
      },
    ],
    generatedByEngine: "CAPA_V2_PREFILL_V1",
    metadata: {
      source: "report_observation",
      classification: observation?.classification || "",
      cfr: reference,
    },
  };
};

const computeRecurrence = async ({ tenantOrgId, supplierId, siteId, title }) => {
  const filters = { tenantOrgId };
  if (supplierId) filters.supplierId = supplierId;
  if (siteId) filters.siteId = siteId;
  const [legacyMatches, v2Matches] = await Promise.all([
    Capa.find(filters).select("title").limit(100).lean(),
    CapaV2.find(filters).select("title _id").limit(100).lean(),
  ]);
  const allTitles = [
    ...legacyMatches.map((item) => ({ title: item.title, id: null })),
    ...v2Matches.map((item) => ({ title: item.title, id: item._id })),
  ];
  const similar = allTitles
    .map((item) => ({ ...item, score: jaccard(item.title, title) }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  return {
    recurrenceFlag: similar.length > 0,
    similarCapaIds: similar.map((item) => item.id).filter(Boolean).slice(0, 5),
  };
};

const dedupeCandidates = (candidates = []) => {
  const map = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.auditId || ""}|${normalizeText(candidate.title)}|${normalizeText(
      candidate.observationCategory
    )}`;
    if (!map.has(key)) {
      map.set(key, candidate);
      continue;
    }
    const existing = map.get(key);
    if ((candidate.sourceReferences || []).length > (existing.sourceReferences || []).length) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
};

export const resolveAuditIdForCapaV2 = async (auditIdOrAlias) => {
  const resolved = await resolveAuditRequestId({
    requestId: auditIdOrAlias,
    AuditRequestModel: AuditRequestMaster,
  });
  if (!resolved) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  return resolved;
};

export const generateCandidatePrefillsFromAudit = async ({ auditIdOrAlias, tenantId }) => {
  const auditId = await resolveAuditIdForCapaV2(auditIdOrAlias);
  const audit = await AuditRequestMaster.findById(auditId)
    .select("_id tenantOrgId supplier_id create_by_buyer_id auditor_id site_id supplier_product_id")
    .lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  if (tenantId && audit.tenantOrgId && String(tenantId) !== String(audit.tenantOrgId)) {
    const err = new Error("Not Found");
    err.status = 404;
    throw err;
  }

  const [questions, report] = await Promise.all([
    AuditQuestions.find({ auditRequestId: audit._id }).lean(),
    AuditReport.findOne({ auditRequestId: audit._id }).lean(),
  ]);

  const questionCandidates = questions
    .map((question) => buildQuestionCandidate({ audit, question }))
    .filter(Boolean);
  const reportCandidates = (Array.isArray(report?.observations) ? report.observations : [])
    .map((observation) => buildObservationCandidate({ audit, report, observation }))
    .filter(Boolean);

  const merged = dedupeCandidates([...questionCandidates, ...reportCandidates]);
  const withRecurrence = [];
  for (const item of merged) {
    const recurrence = await computeRecurrence({
      tenantOrgId: item.tenantOrgId,
      supplierId: item.supplierId,
      siteId: item.siteId,
      title: item.title,
    });
    withRecurrence.push({
      ...item,
      recurrenceFlag: recurrence.recurrenceFlag,
      similarCapaIds: recurrence.similarCapaIds,
    });
  }

  return {
    audit,
    prefills: withRecurrence,
    sourceStats: {
      fromQuestions: questionCandidates.length,
      fromReportObservations: reportCandidates.length,
      dedupedCount: withRecurrence.length,
    },
  };
};

export const persistCandidatePrefills = async ({ prefills = [], actorId }) => {
  if (!Array.isArray(prefills) || !prefills.length) return [];
  const results = [];
  for (const payload of prefills) {
    const existing = await CapaCandidate.findOne({
      tenantOrgId: payload.tenantOrgId,
      auditId: payload.auditId,
      title: payload.title,
      status: { $in: ["NEW", "IN_REVIEW"] },
    });
    if (existing) {
      results.push(existing);
      continue;
    }
    const created = await CapaCandidate.create({
      ...payload,
      createdBy: actorId || null,
      updatedBy: actorId || null,
    });
    results.push(created);
  }
  return results;
};

export const attachSimilarityLinksForCapa = async ({ capa }) => {
  if (!capa?._id || !capa?.tenantOrgId) return [];
  const peers = await CapaV2.find({
    tenantOrgId: capa.tenantOrgId,
    supplierId: capa.supplierId || null,
    siteId: capa.siteId || null,
    _id: { $ne: capa._id },
  })
    .select("_id title")
    .limit(100)
    .lean();
  const links = [];
  for (const peer of peers) {
    const score = jaccard(peer.title, capa.title);
    if (score < 0.65) continue;
    const link = await CapaSimilarityLink.findOneAndUpdate(
      {
        tenantOrgId: capa.tenantOrgId,
        capaId: capa._id,
        relatedCapaId: peer._id,
      },
      {
        tenantOrgId: capa.tenantOrgId,
        capaId: capa._id,
        relatedCapaId: peer._id,
        linkType: "SIMILAR",
        similarityScore: score,
        rationale: "Semantic title similarity",
      },
      { upsert: true, new: true }
    ).lean();
    links.push(link);
  }
  return links;
};

export const nextCapaNumber = async ({ tenantOrgId }) => {
  const prefix = `CAPA-${new Date().getFullYear()}`;
  const count = await CapaV2.countDocuments({ tenantOrgId, capaNumber: { $regex: `^${prefix}-` } });
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
};

export const toObjectId = (value) =>
  value && mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
