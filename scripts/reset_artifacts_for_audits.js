import "dotenv/config";
import mongoose from "mongoose";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditArtifact } from "../src/models/auditArtifactModel.js";
import { Template } from "../src/models/templateModel.js";

const TARGET_ARTIFACTS = [
  { artifactType: "INTIMATION_LETTER", phaseKey: "INITIATED", ownerRole: "buyer", templateType: "INTIMATION_LETTER" },
  { artifactType: "PRE_AUDIT_QUESTIONNAIRE", phaseKey: "PREP", ownerRole: "supplier", templateType: "PRE_AUDIT_Q" },
  { artifactType: "SCOPE", phaseKey: "PLANNING", ownerRole: "auditor", templateType: "SCOPE" },
];

const resolveTemplateIds = async ({ templateType, tenantId }) => {
  const baseScope = {
    templateType,
    $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
  };
  let templates = await Template.find({ ...baseScope, status: "PUBLISHED" })
    .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
    .lean();
  if (!templates.length) {
    templates = await Template.find(baseScope)
      .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
      .lean();
  }
  if (!templates.length) return [];
  if (templateType === "PRE_AUDIT_Q") {
    return templates.slice(0, 2).map((t) => t.templateId);
  }
  return [templates[0].templateId];
};

const resetArtifact = async ({ audit, artifactType, phaseKey, ownerRole, templateType }) => {
  const tenantId = audit.tenantOrgId ?? null;
  const templateIds = await resolveTemplateIds({ templateType, tenantId });
  const [primaryTemplateId] = templateIds;

  const baseData = { responses: [] };
  if (artifactType === "PRE_AUDIT_QUESTIONNAIRE" && templateIds.length) {
    baseData.selectedTemplateIds = templateIds;
  }

  const update = {
    $set: {
      phaseKey,
      ownerRole,
      templateId: primaryTemplateId || null,
      status: "draft",
      data: baseData,
      updatedBy: audit.create_by_buyer_id,
    },
  };

  const existing = await AuditArtifact.findOne({ auditId: audit._id, artifactType }).lean();
  if (existing) {
    await AuditArtifact.updateOne({ _id: existing._id }, update);
    return { artifactType, action: "updated", templateId: primaryTemplateId || null };
  }

  const created = await AuditArtifact.create({
    tenantId,
    auditId: audit._id,
    phaseKey,
    artifactType,
    templateId: primaryTemplateId || null,
    ownerRole,
    permissions: artifactType === "INTIMATION_LETTER" ? ["supplier"] : [],
    status: "draft",
    data: baseData,
    createdBy: audit.create_by_buyer_id,
    updatedBy: audit.create_by_buyer_id,
  });
  return { artifactType, action: "created", templateId: created.templateId || null };
};

const run = async () => {
  const ids = process.argv.slice(2).filter(Boolean);
  if (!ids.length) {
    console.error("Usage: node scripts/reset_artifacts_for_audits.js HAWK0000000023 HAWK0000000024");
    process.exit(1);
  }
  const mongoUri =
    process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("Missing Mongo connection string in env (MONGO_URI / MONGODB_URI).");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const audits = await AuditRequestMaster.find({
    $or: [{ internalRequestId: { $in: ids } }, { supplierRequestId: { $in: ids } }],
  });
  if (!audits.length) {
    console.error("No audits found for:", ids.join(", "));
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const audit of audits) {
    console.log(`Resetting artifacts for ${audit.internalRequestId || audit.supplierRequestId || audit._id}`);
    for (const artifactSpec of TARGET_ARTIFACTS) {
      const result = await resetArtifact({ audit, ...artifactSpec });
      console.log(` - ${result.artifactType}: ${result.action} (templateId=${result.templateId ?? "none"})`);
    }
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
