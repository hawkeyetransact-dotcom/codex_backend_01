import mongoose from "mongoose";
import { Template } from "../models/templateModel.js";

export const MAX_ACTIVE_TEMPLATES_PER_SCOPE = 3;

const TEMPLATE_TYPE_TO_ARTIFACT = {
  INTIMATION_LETTER: "INTIMATION_LETTER",
  RFQ: "RFQ",
  SCOPE: "SCOPE",
  AGENDA: "AGENDA",
  PRE_AUDIT_Q: "PRE_AUDIT_QUESTIONNAIRE",
  EXECUTION_Q: "EXECUTION_QUESTIONNAIRE",
  CHECKLIST: "GMP_CHECKLIST",
  CAPA_NOTICE: "CAPA_PLAN",
  FINAL_REPORT: "FINAL_REPORT",
  VENDOR_REGISTRATION: "VENDOR_REGISTRATION",
};

export const normalizeTemplateType = (value) => String(value || "").toUpperCase().trim();
export const normalizeArtifactType = (value) => String(value || "").toUpperCase().trim();

export const resolveArtifactTypeForTemplate = ({ templateType, artifactType } = {}) => {
  const normalizedArtifact = normalizeArtifactType(artifactType);
  if (normalizedArtifact) return normalizedArtifact;
  const normalizedType = normalizeTemplateType(templateType);
  return TEMPLATE_TYPE_TO_ARTIFACT[normalizedType] || null;
};

const normalizeAssessmentTypeId = (assessmentTypeId) => {
  if (!assessmentTypeId) return null;
  if (typeof assessmentTypeId === "object" && assessmentTypeId?._id) {
    return normalizeAssessmentTypeId(assessmentTypeId._id);
  }
  if (mongoose.Types.ObjectId.isValid(assessmentTypeId)) {
    return new mongoose.Types.ObjectId(assessmentTypeId);
  }
  return assessmentTypeId;
};

const buildScopeFilter = (tenantId) => {
  if (!tenantId) {
    return { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] };
  }
  return { tenantId: String(tenantId) };
};

const buildAssessmentFilter = (assessmentTypeId) => {
  const normalized = normalizeAssessmentTypeId(assessmentTypeId);
  if (!normalized) {
    return { $or: [{ assessmentTypeId: null }, { assessmentTypeId: { $exists: false } }] };
  }
  return { assessmentTypeId: normalized };
};

export const resolveTemplateScopeTenantId = ({ templateScope, tenantId } = {}) => {
  const scope = String(templateScope || "").toUpperCase();
  if (scope === "TENANT" && tenantId) {
    return String(tenantId);
  }
  return null;
};

export const buildTemplateBucketFilter = ({ tenantId = null, artifactType, templateType, assessmentTypeId = null } = {}) => {
  const resolvedArtifactType = resolveArtifactTypeForTemplate({ artifactType, templateType });
  if (!resolvedArtifactType) return null;
  return {
    $and: [
      { artifactType: resolvedArtifactType },
      buildScopeFilter(tenantId),
      buildAssessmentFilter(assessmentTypeId),
    ],
  };
};

export const autoArchiveTemplatesForBucket = async ({
  tenantId = null,
  artifactType,
  templateType,
  assessmentTypeId = null,
  keepTemplateIds = [],
} = {}) => {
  const bucketFilter = buildTemplateBucketFilter({
    tenantId,
    artifactType,
    templateType,
    assessmentTypeId,
  });
  if (!bucketFilter) return { archivedTemplateIds: [] };

  const activeFilter = {
    $and: [bucketFilter, { archiveFlag: { $ne: true } }, { status: { $ne: "ARCHIVED" } }],
  };
  const activeTemplates = await Template.find(activeFilter)
    .select("_id templateId updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1, templateId: -1 })
    .lean();
  if (activeTemplates.length <= MAX_ACTIVE_TEMPLATES_PER_SCOPE) {
    return { archivedTemplateIds: [] };
  }

  const keepSet = new Set(
    (Array.isArray(keepTemplateIds) ? keepTemplateIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
  );
  const preferred = [];
  const remainder = [];
  activeTemplates.forEach((tpl) => {
    if (keepSet.has(Number(tpl.templateId))) preferred.push(tpl);
    else remainder.push(tpl);
  });

  const ordered = [...preferred, ...remainder];
  const survivors = ordered.slice(0, MAX_ACTIVE_TEMPLATES_PER_SCOPE);
  const survivorIdSet = new Set(survivors.map((tpl) => String(tpl._id)));
  const toArchive = activeTemplates.filter((tpl) => !survivorIdSet.has(String(tpl._id)));

  if (!toArchive.length) return { archivedTemplateIds: [] };

  const archiveIds = toArchive.map((tpl) => tpl._id);
  const archivedTemplateIds = toArchive.map((tpl) => Number(tpl.templateId)).filter((id) => Number.isFinite(id));
  await Template.updateMany(
    { _id: { $in: archiveIds } },
    {
      $set: {
        archiveFlag: true,
        status: "ARCHIVED",
        "extractionConfig.autoArchivedAt": new Date(),
      },
    }
  );
  return { archivedTemplateIds };
};
