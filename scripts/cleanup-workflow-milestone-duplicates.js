import "dotenv/config";
import mongoose from "mongoose";
import { WorkflowMilestoneDefinition } from "../src/models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../src/models/workflowMilestoneInstanceModel.js";

const LEGACY_CODES = [
  "REQUEST_REVIEW_IN_PROGRESS",
  "REQUEST_REVIEW_COMPLETED",
  "QUESTIONNAIRE_SENT",
  "QUESTIONNAIRE_RECEIVED",
  "RESPONSE_IN_PROGRESS",
  "RESPONSE_COMPLETED",
  "RESPONSE_RECEIVED",
  "RESPONSE_REVIEW_IN_PROGRESS",
  "RESPONSE_REVIEW_COMPLETED",
];

const run = async () => {
  const dryRun = process.argv.includes("--dryRun");
  const pruneLegacy = process.argv.includes("--pruneLegacy");
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(mongoUri);

  let legacyRemoved = { definitions: 0, instances: 0 };
  if (pruneLegacy) {
    const legacyDefQuery = { code: { $in: LEGACY_CODES } };
    const legacyInstQuery = { milestoneCode: { $in: LEGACY_CODES } };
    if (!dryRun) {
      const defResult = await WorkflowMilestoneDefinition.deleteMany(legacyDefQuery);
      const instResult = await WorkflowMilestoneInstance.deleteMany(legacyInstQuery);
      legacyRemoved = {
        definitions: defResult.deletedCount || 0,
        instances: instResult.deletedCount || 0,
      };
    } else {
      legacyRemoved = {
        definitions: await WorkflowMilestoneDefinition.countDocuments(legacyDefQuery),
        instances: await WorkflowMilestoneInstance.countDocuments(legacyInstQuery),
      };
    }
  }

  const dedupe = async (model, groupId, label) => {
    const groups = await model.aggregate([
      { $group: { _id: groupId, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    let removed = 0;
    let kept = 0;

    for (const group of groups) {
      const docs = await model
        .find({ _id: { $in: group.ids } })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      const keep = docs[0];
      const removeIds = docs.slice(1).map((d) => d._id);
      if (!removeIds.length) {
        kept += 1;
        continue;
      }
      if (!dryRun) {
        const result = await model.deleteMany({ _id: { $in: removeIds } });
        removed += result.deletedCount || 0;
      } else {
        removed += removeIds.length;
      }
      kept += 1;
      if (keep?._id) {
        console.log(`${label}: kept ${keep._id.toString()} removed ${removeIds.length}`);
      }
    }

    return { duplicates: groups.length, removed, kept };
  };

  const defStats = await dedupe(
    WorkflowMilestoneDefinition,
    { tenantId: "$tenantId", workflowType: "$workflowType", code: "$code" },
    "definition"
  );
  const instStats = await dedupe(
    WorkflowMilestoneInstance,
    {
      tenantId: "$tenantId",
      workflowEntityType: "$workflowEntityType",
      workflowEntityId: "$workflowEntityId",
      milestoneCode: "$milestoneCode",
    },
    "instance"
  );

  console.log(
    JSON.stringify(
      {
        dryRun,
        pruneLegacy,
        legacyRemoved,
        definitions: defStats,
        instances: instStats,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("cleanup failed", err);
  process.exit(1);
});
