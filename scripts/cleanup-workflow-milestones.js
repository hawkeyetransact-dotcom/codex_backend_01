import "dotenv/config";
import mongoose from "mongoose";
import { WorkflowMilestoneInstance } from "../src/models/workflowMilestoneInstanceModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { User } from "../src/models/userModel.js";

const run = async () => {
  const dryRun = process.argv.includes("--dryRun");
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(mongoUri);

  const auditIds = await WorkflowMilestoneInstance.distinct("workflowEntityId", {
    workflowEntityType: "AuditRequest",
  });
  if (!auditIds.length) {
    console.log("No workflow milestones found.");
    await mongoose.disconnect();
    return;
  }

  const audits = await AuditRequestMaster.find({ _id: { $in: auditIds } })
    .select("_id create_by_buyer_id")
    .lean();
  const buyerIds = audits.map((a) => a.create_by_buyer_id).filter(Boolean);
  const buyers = await User.find({ _id: { $in: buyerIds } })
    .select("_id tenant_id")
    .lean();

  const buyerTenantMap = new Map(buyers.map((b) => [String(b._id), b.tenant_id]));

  let removed = 0;
  let skipped = 0;

  for (const audit of audits) {
    const tenantId = buyerTenantMap.get(String(audit.create_by_buyer_id));
    if (!tenantId) {
      skipped += 1;
      continue;
    }
    const filter = {
      workflowEntityType: "AuditRequest",
      workflowEntityId: audit._id,
      tenantId: { $ne: tenantId },
    };
    const count = await WorkflowMilestoneInstance.countDocuments(filter);
    if (!count) continue;
    if (!dryRun) {
      const result = await WorkflowMilestoneInstance.deleteMany(filter);
      removed += result.deletedCount || 0;
    } else {
      removed += count;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        auditsChecked: audits.length,
        removed,
        skipped,
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
