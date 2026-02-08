import "dotenv/config";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { AuditArtifact } from "../src/models/auditArtifactModel.js";
import {
  MAX_ACTIVE_TEMPLATES_PER_SCOPE,
  resolveArtifactTypeForTemplate,
} from "../src/utils/templateLifecycle.js";

const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  process.env.DATABASE_URL;

if (!mongoUri) {
  console.error("Missing Mongo connection string (MONGO_URI / MONGODB_URI).");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const toTs = (value) => {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const main = async () => {
  await mongoose.connect(mongoUri);

  let normalizedArchiveFlagCount = 0;
  if (!dryRun) {
    const normalizedRes = await Template.updateMany(
      { archiveFlag: { $exists: false } },
      { $set: { archiveFlag: false } }
    );
    normalizedArchiveFlagCount = normalizedRes.modifiedCount || 0;
  } else {
    normalizedArchiveFlagCount = await Template.countDocuments({ archiveFlag: { $exists: false } });
  }

  const templates = await Template.find({})
    .select("templateId tenantId templateType artifactType assessmentTypeId status archiveFlag updatedAt createdAt")
    .lean();
  const activeTemplates = templates.filter((tpl) => {
    const artifact = resolveArtifactTypeForTemplate({
      artifactType: tpl.artifactType,
      templateType: tpl.templateType,
    });
    if (!artifact) return false;
    if (tpl.archiveFlag) return false;
    if (String(tpl.status || "").toUpperCase() === "ARCHIVED") return false;
    return true;
  });

  const buckets = new Map();
  activeTemplates.forEach((tpl) => {
    const artifact = resolveArtifactTypeForTemplate({
      artifactType: tpl.artifactType,
      templateType: tpl.templateType,
    });
    const scopeKey = tpl.tenantId ? String(tpl.tenantId) : "GLOBAL";
    const assessmentKey = tpl.assessmentTypeId ? String(tpl.assessmentTypeId) : "NONE";
    const bucketKey = `${scopeKey}|${artifact}|${assessmentKey}`;
    const list = buckets.get(bucketKey) || [];
    list.push({ ...tpl, resolvedArtifactType: artifact });
    buckets.set(bucketKey, list);
  });

  const toArchiveTemplateIds = [];
  buckets.forEach((items) => {
    const ordered = [...items].sort((a, b) => {
      const deltaUpdated = toTs(b.updatedAt) - toTs(a.updatedAt);
      if (deltaUpdated !== 0) return deltaUpdated;
      const deltaCreated = toTs(b.createdAt) - toTs(a.createdAt);
      if (deltaCreated !== 0) return deltaCreated;
      return Number(b.templateId || 0) - Number(a.templateId || 0);
    });
    const overflow = ordered.slice(MAX_ACTIVE_TEMPLATES_PER_SCOPE);
    overflow.forEach((tpl) => {
      if (Number.isFinite(Number(tpl.templateId))) {
        toArchiveTemplateIds.push(Number(tpl.templateId));
      }
    });
  });

  let archivedTemplateCount = 0;
  if (toArchiveTemplateIds.length) {
    if (!dryRun) {
      const res = await Template.updateMany(
        { templateId: { $in: toArchiveTemplateIds } },
        {
          $set: {
            archiveFlag: true,
            status: "ARCHIVED",
            "extractionConfig.autoArchivedAt": new Date(),
          },
        }
      );
      archivedTemplateCount = res.modifiedCount || 0;
    } else {
      archivedTemplateCount = toArchiveTemplateIds.length;
    }
  }

  const paqArtifacts = await AuditArtifact.find({ artifactType: "PRE_AUDIT_QUESTIONNAIRE" })
    .select("_id templateId data")
    .lean();
  let updatedPaqArtifacts = 0;
  for (const artifact of paqArtifacts) {
    const nextData = artifact.data && typeof artifact.data === "object" ? { ...artifact.data } : {};
    let changed = false;
    const selectedTemplateIds = Array.isArray(nextData.selectedTemplateIds)
      ? nextData.selectedTemplateIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      : [];

    if (!selectedTemplateIds.length) {
      const templateId = Number(artifact.templateId);
      if (Number.isFinite(templateId)) {
        nextData.selectedTemplateIds = [templateId];
        changed = true;
      }
    } else {
      nextData.selectedTemplateIds = Array.from(new Set(selectedTemplateIds));
      changed = true;
    }

    const selectedCount = Array.isArray(nextData.selectedTemplateIds) ? nextData.selectedTemplateIds.length : 0;
    if (selectedCount <= 1) {
      if (nextData.templateSelectionLocked !== true) {
        nextData.templateSelectionLocked = true;
        changed = true;
      }
      if (nextData.templateSelectionPending !== false) {
        nextData.templateSelectionPending = false;
        changed = true;
      }
    } else if (nextData.templateSelectionLocked !== true && nextData.templateSelectionPending === undefined) {
      nextData.templateSelectionPending = true;
      changed = true;
    }

    if (!changed) continue;
    updatedPaqArtifacts += 1;
    if (!dryRun) {
      await AuditArtifact.updateOne({ _id: artifact._id }, { $set: { data: nextData } });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        normalizedArchiveFlagCount,
        archivedTemplateCount,
        updatedPaqArtifacts,
      },
      null,
      2
    )
  );

  await mongoose.connection.close();
};

main().catch((err) => {
  console.error("backfill_template_archive_and_paq_selection failed:", err);
  process.exit(1);
});
