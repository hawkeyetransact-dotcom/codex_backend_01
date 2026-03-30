/**
 * backfill-old-audits-tenant.mjs
 *
 * Updates the 53 old audit records in audit-requests-masters to use
 * the test tenant's ID so that test users can see them.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to:", mongoose.connection.db.databaseName);

const testTenant = await Tenant.findOne({ name: "test-tenant" });
if (!testTenant) {
  console.error("test-tenant not found — run seed-test-users.mjs first");
  process.exit(1);
}
console.log("Test tenant:", testTenant._id.toString());

const buyer1 = await User.findOne({ email: "buyer1@test.com" });
console.log("buyer1:", buyer1?._id.toString());

const totalBefore = await AuditRequestMaster.countDocuments();
console.log("\nTotal audit records (before):", totalBefore);

// Backfill tenantOrgId on ALL records (including those with old tenant IDs)
const r1 = await AuditRequestMaster.updateMany(
  {},
  { $set: { tenantOrgId: testTenant._id.toString() } }
);
console.log(`Updated tenantOrgId on ${r1.modifiedCount} records`);

// Assign buyer1 as creator for records with no buyer
if (buyer1) {
  const r2 = await AuditRequestMaster.updateMany(
    { $or: [{ create_by_buyer_id: null }, { create_by_buyer_id: { $exists: false } }] },
    { $set: { create_by_buyer_id: buyer1._id } }
  );
  console.log(`Assigned buyer1 as creator on ${r2.modifiedCount} records`);
}

const totalAfter = await AuditRequestMaster.countDocuments({ tenantOrgId: testTenant._id.toString() });
console.log("\nTotal audits visible to test tenant:", totalAfter);
console.log("Done.");

await mongoose.disconnect();
