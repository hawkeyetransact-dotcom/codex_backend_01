import mongoose from "mongoose";
import dotenv from "dotenv";
import { AuditArtifact } from "../src/models/auditArtifactModel.js";
import { AuditRequest } from "../src/models/auditRequestsMasterModel.js";
import { Template } from "../src/models/templateModel.js";
import { resolveDefaultTemplateId } from "../src/utils/templateDefaults.js";

dotenv.config();

const connection = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!connection) {
  console.error("Missing MONGODB_URI/MONGO_URI");
  process.exit(1);
}

const normalize = (value) => String(value || "").toUpperCase();

const loadPaqTemplateIds = async ({ tenantId, assessmentTypeId }) => {
  const query = {
    status: "PUBLISHED",
    $or: [{ templateType: "PRE_AUDIT_Q" }, { artifactType: "PRE_AUDIT_QUESTIONNAIRE" }],
  };
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
  const finalQuery = filters.length ? { $and: [query, ...filters] } : query;
  const templates = await Template.find(finalQuery)
    .sort({ "extractionConfig.defaultTemplate": -1, templateId: 1 })
    .select("templateId")
    .lean();
  return templates
    .map((tpl) => Number(tpl.templateId))
    .filter((id) => Number.isFinite(id));
};

const run = async () => {
  await mongoose.connect(connection);

  const hawkIds = process.argv.slice(2);
  const filter = hawkIds.length
    ? { internalRequestId: { $in: hawkIds } }
    : {};
  const audits = await AuditRequest.find(filter).select("_id tenantOrgId assessmentTypeId selectedTemplateId internalRequestId").lean();

  let updatedArtifacts = 0;
  let updatedExec = 0;

  for (const audit of audits) {
    const tenantId = audit.tenantOrgId || null;
    const assessmentTypeId = audit.assessmentTypeId || null;

    const paqTemplates = await loadPaqTemplateIds({ tenantId, assessmentTypeId });
    const paqDefault =
      paqTemplates[0] ||
      (await resolveDefaultTemplateId({
        artifactType: "PRE_AUDIT_QUESTIONNAIRE",
        tenantId,
        assessmentTypeId,
      }));

    const artifacts = await AuditArtifact.find({ auditId: audit._id }).lean();
    for (const artifact of artifacts) {
      const type = normalize(artifact.artifactType);
      if (type === "PRE_AUDIT_QUESTIONNAIRE") {
        const nextData = { ...(artifact.data || {}) };
        let changed = false;
        if (!artifact.templateId && paqDefault) {
          artifact.templateId = paqDefault;
          changed = true;
        }
        if (paqTemplates.length) {
          nextData.selectedTemplateIds = paqTemplates;
          changed = true;
        }
        if (changed) {
          await AuditArtifact.updateOne(
            { _id: artifact._id },
            { $set: { templateId: artifact.templateId || null, data: nextData } }
          );
          updatedArtifacts += 1;
        }
      }

      if (type === "EXECUTION_QUESTIONNAIRE") {
        let nextTemplateId = artifact.templateId || audit.selectedTemplateId || null;
        if (!nextTemplateId) {
          nextTemplateId = await resolveDefaultTemplateId({
            artifactType: "EXECUTION_QUESTIONNAIRE",
            tenantId,
            assessmentTypeId,
          });
        }
        if (nextTemplateId && nextTemplateId !== artifact.templateId) {
          await AuditArtifact.updateOne(
            { _id: artifact._id },
            { $set: { templateId: nextTemplateId } }
          );
          updatedExec += 1;
        }
        if (nextTemplateId && !audit.selectedTemplateId) {
          await AuditRequest.updateOne(
            { _id: audit._id },
            { $set: { selectedTemplateId: nextTemplateId, isTempleteUsed: true } }
          );
        }
      }
    }
  }

  console.log(
    `Backfill complete. Updated PAQ artifacts: ${updatedArtifacts}, Execution artifacts: ${updatedExec}`
  );
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
