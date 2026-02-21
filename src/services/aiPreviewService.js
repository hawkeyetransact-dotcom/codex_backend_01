import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { StandardRegistryService } from "./compliance/standardRegistryService.js";
import {
  evaluateQuestionCompliance,
  mapControlsForQuestion,
  normalizeYesNo,
  pickRegulatoryReference,
  summarizeVerdicts,
} from "./compliance/complianceRules.js";
import { DigiLockerService } from "./digilocker/digilockerService.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const splitDocUrls = (value = "") =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

const toLeanObject = (value) => {
  if (!value) return null;
  if (typeof value.toObject === "function") return value.toObject();
  return value;
};

const sanitizeSuggestions = (items = []) =>
  (Array.isArray(items) ? items : []).slice(0, 3).map((item) => ({
    documentId: String(item.documentId || ""),
    versionId: String(item.versionId || ""),
    title: String(item.title || ""),
    confidence: Number(item.confidence || 0),
    pageNumber: Number(item.pageNumber || 1),
    effectiveDate: item.effectiveDate || null,
    expiryDate: item.expiryDate || null,
  }));

const resolveQuestions = async ({ auditRequestId, templateId }) => {
  if (auditRequestId) {
    const questions = await AuditQuestions.find({ auditRequestId })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return { sourceType: "AUDIT", questions };
  }

  const numericTemplateId = Number(templateId);
  const query = Number.isFinite(numericTemplateId)
    ? { templateId: numericTemplateId }
    : { templateId };
  const questions = await TemplateQuestions.find(query)
    .sort({ order: 1, createdAt: 1 })
    .lean();
  return { sourceType: "TEMPLATE", questions };
};

export const AIPreviewService = {
  async run({
    tenantId,
    actorUserId,
    payload = {},
  }) {
    if (!tenantId) {
      const err = new Error("Tenant missing");
      err.status = 400;
      throw err;
    }

    const auditRequestId = payload.auditRequestId || payload.auditId || null;
    const templateId = payload.templateId || null;
    if (!auditRequestId && !templateId) {
      const err = new Error("auditRequestId or templateId is required");
      err.status = 400;
      throw err;
    }

    const standardKey = String(payload.standardKey || "ICH_Q7_CFR21").trim();
    const standardVersion = String(payload.standardVersion || "1.0.0").trim();
    const includeEvidenceSuggestions = toBool(payload.includeEvidenceSuggestions, true);
    const includeComplianceVerdict = toBool(payload.includeComplianceVerdict, true);
    const limitQuestions = clamp(Number(payload.limitQuestions || 25) || 25, 1, 200);

    await StandardRegistryService.ensureDefaults({ tenantId, actorUserId });
    const standard = await StandardRegistryService.getStandard({
      tenantId,
      standardKey,
      version: standardVersion,
      actorUserId,
    });
    if (!standard) {
      const err = new Error("Compliance standard/version not found");
      err.status = 404;
      throw err;
    }

    let audit = null;
    if (auditRequestId) {
      audit = await AuditRequestMaster.findById(auditRequestId).lean();
      if (!audit) {
        const err = new Error("Audit not found");
        err.status = 404;
        throw err;
      }
      if (audit?.tenantOrgId && String(audit.tenantOrgId) !== String(tenantId)) {
        const err = new Error("Not Found");
        err.status = 404;
        throw err;
      }
    }

    const { sourceType, questions } = await resolveQuestions({ auditRequestId, templateId });
    if (!questions.length) {
      const err = new Error("No questions found for preview");
      err.status = 404;
      throw err;
    }

    const scopedQuestions = questions.slice(0, limitQuestions);
    const supplierOrgId =
      payload.supplierOrgId ||
      payload.supplierId ||
      audit?.supplier_id ||
      null;
    const siteId = payload.siteId || audit?.site_id || null;
    const productId = payload.productId || audit?.supplier_product_id || null;

    const items = [];
    for (const question of scopedQuestions) {
      const questionId = String(question._id || question.questionId || "");
      const questionText = String(question.question || question.text || "").trim();
      const categoryName = String(question.categoryName || "").trim();
      const cfrReference = String(question.cfrReference || "").trim();
      const regulatoryReferences = Array.isArray(question.regulatoryReferences)
        ? question.regulatoryReferences
        : [];

      const mappedControls = mapControlsForQuestion(
        {
          questionText,
          categoryName,
          cfrReference,
          regulatoryReferences,
        },
        standard.controls || []
      );

      let evidenceSuggestions = [];
      if (includeEvidenceSuggestions) {
        try {
          const suggested = await DigiLockerService.suggestEvidence({
            tenantId,
            supplierOrgId,
            questionText,
            siteId,
            productId,
            limit: 3,
          });
          evidenceSuggestions = sanitizeSuggestions(suggested);
        } catch (_err) {
          evidenceSuggestions = [];
        }
      }

      const responseDetails =
        question?.responseDetails && typeof question.responseDetails === "object"
          ? question.responseDetails
          : {};
      const responseDocUrls = splitDocUrls(question?.docUrls || "");
      const hasLinkedEvidence = Array.isArray(question?.linkedEvidenceIds)
        ? question.linkedEvidenceIds.length > 0
        : false;
      const hasEvidence =
        hasLinkedEvidence ||
        responseDocUrls.length > 0 ||
        evidenceSuggestions.length > 0;

      const response = {
        yesNo: normalizeYesNo(question?.YesNoAnswers || ""),
        text: String(question?.textResponse || "").trim(),
        responseDetails,
        hasEvidence,
      };

      const evaluation = includeComplianceVerdict
        ? evaluateQuestionCompliance({ response, mappedControls })
        : null;

      items.push({
        questionId,
        questionCode: String(question.questionCode || ""),
        questionText,
        categoryName,
        regulatoryReference:
          cfrReference ||
          pickRegulatoryReference({ cfrReference, regulatoryReferences }),
        mappedControls: mappedControls.map((item) => ({
          controlId: item.controlId,
          title: item.title,
          clauseRef: item.clauseRef,
          standardRefs: item.standardRefs || [],
          score: item.score,
        })),
        responsePreview: {
          yesNo: response.yesNo || "",
          text: response.text || "",
          hasEvidence,
          evidenceSources: responseDocUrls.slice(0, 8),
        },
        evidenceSuggestions,
        evaluation,
      });
    }

    const summary = includeComplianceVerdict
      ? summarizeVerdicts(
          items.map((item) => ({ machineVerdict: item?.evaluation?.verdict || "INSUFFICIENT" }))
        )
      : {
          total: items.length,
          compliant: 0,
          nonCompliant: 0,
          insufficient: 0,
          notApplicable: 0,
        };

    return {
      source: {
        type: sourceType,
        auditRequestId: auditRequestId || null,
        templateId: templateId || null,
      },
      standard: {
        standardKey: standard.standardKey,
        version: standard.version,
        name: standard.name,
        controlsCount: Array.isArray(standard.controls) ? standard.controls.length : 0,
      },
      context: {
        tenantId: String(tenantId),
        supplierOrgId: supplierOrgId ? String(supplierOrgId) : null,
        siteId: siteId ? String(siteId) : null,
        productId: productId ? String(productId) : null,
        audit: toLeanObject(audit),
      },
      options: {
        includeEvidenceSuggestions,
        includeComplianceVerdict,
        limitQuestions,
      },
      questionsTotal: questions.length,
      evaluatedCount: items.length,
      summary,
      items,
      generatedAt: new Date().toISOString(),
    };
  },
};

