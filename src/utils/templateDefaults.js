import { Template } from "../models/templateModel.js";

const TEMPLATE_TYPES_BY_ARTIFACT = {
  INTIMATION_LETTER: ["INTIMATION_LETTER"],
  RFQ: ["RFQ"],
  SCOPE: ["SCOPE", "AGENDA"],
  AGENDA: ["AGENDA"],
  PRE_AUDIT_QUESTIONNAIRE: ["PRE_AUDIT_Q"],
  EXECUTION_QUESTIONNAIRE: ["EXECUTION_Q"],
  GMP_CHECKLIST: ["CHECKLIST"],
  CAPA_PLAN: ["CAPA_NOTICE"],
  FINAL_REPORT: ["FINAL_REPORT"],
  VENDOR_REGISTRATION: ["VENDOR_REGISTRATION"],
};

const normalizeArtifactType = (artifactType) => String(artifactType || "").toUpperCase();

export const resolveTemplateTypesForArtifact = (artifactType) => {
  const normalized = normalizeArtifactType(artifactType);
  return TEMPLATE_TYPES_BY_ARTIFACT[normalized] || [];
};

export const resolveDefaultTemplateId = async ({ artifactType, tenantId, assessmentTypeId } = {}) => {
  const templateTypes = resolveTemplateTypesForArtifact(artifactType);
  if (!templateTypes.length) return null;

  const filters = [];
  if (tenantId) {
    filters.push({ $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] });
  }
  if (assessmentTypeId) {
    filters.push({
      $or: [
        { assessmentTypeId },
        { assessmentTypeId: null },
        { assessmentTypeId: { $exists: false } },
      ],
    });
  }

  const baseQuery = {
    status: "PUBLISHED",
    $or: [
      { templateType: { $in: templateTypes } },
      { artifactType: normalizeArtifactType(artifactType) },
    ],
  };
  const query = filters.length ? { $and: [baseQuery, ...filters] } : baseQuery;
  const templates = await Template.find(query)
    .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
    .select("templateId extractionConfig templateType artifactType")
    .lean();
  if (!templates.length) return null;
  if (templates.length === 1) return templates[0].templateId;
  const preferred = templates.find((t) => t?.extractionConfig?.defaultTemplate);
  return preferred ? preferred.templateId : null;
};
