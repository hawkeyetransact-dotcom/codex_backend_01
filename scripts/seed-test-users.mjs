/**
 * seed-test-users.mjs
 *
 * Creates / updates all test users (buyer1-5, supplier1-5, auditor1-5,
 * tenant_admin1-5, superadmin1-5) plus their profiles and a shared
 * test tenant. Also backfills existing AuditRequestMaster records so
 * that records without tenantOrgId become visible to the test tenant's
 * admin users.
 *
 * Run: node --experimental-vm-modules scripts/seed-test-users.mjs
 * Password for all users: Test@2026
 */

import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/userModel.js";
import Tenant from "../src/models/tenantModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";

const PASSWORD = "Test@2026";

// ── helpers ───────────────────────────────────────────────────────────────────

const hash = await bcrypt.hash(PASSWORD, 10);

const ensureTenant = async ({ name, displayName, type }) => {
  const existing = await Tenant.findOne({ name });
  if (existing) return existing;
  return Tenant.create({ name, displayName, type, status: "ACTIVE" });
};

const ensureUser = async ({ email, role, tenant_id, adminScope = "NONE" }) => {
  let user = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        password: hash,
        role,
        tenant_id,
        adminScope,
        status: "ACTIVE",
        isEmailVerified: true,
      },
    },
    { upsert: true, new: true }
  );
  return user;
};

const ensureBuyerProfile = async (user) => {
  const [n] = user.email.split("@");
  const [first, ...rest] = n.split(/[._]/);
  const last = rest.join(" ") || "Test";
  const firstName = first[0].toUpperCase() + first.slice(1);
  const lastName = last[0].toUpperCase() + last.slice(1);
  if (!(await BuyerProfile.findOne({ user_id: user._id }))) {
    await BuyerProfile.create({
      user_id: user._id,
      tenant_id: user.tenant_id,
      title: "Mr",
      firstName,
      lastName,
      countryCode: "+1",
      phone: 1000000000,
      companyName: `${firstName} Corp`,
      addressline1: "123 Test Street",
      zipcode: "00001",
      isProfileCompleted: true,
    });
  }
};

const ensureSupplierProfile = async (user) => {
  const [n] = user.email.split("@");
  const [first, ...rest] = n.split(/[._]/);
  const last = rest.join(" ") || "Test";
  const firstName = first[0].toUpperCase() + first.slice(1);
  const lastName = last[0].toUpperCase() + last.slice(1);
  if (!(await SupplierProfile.findOne({ user_id: user._id }))) {
    await SupplierProfile.create({
      user_id: user._id,
      tenant_id: user.tenant_id,
      title: "Mr",
      firstName,
      lastName,
      countryCode: "+1",
      phone: 2000000000,
      companyName: `${firstName} Pharma Ltd`,
      addressline1: "456 Supply Lane",
      zipcode: "00002",
      isProfileCompleted: true,
    });
  }
};

const ensureAuditorProfile = async (user) => {
  const [n] = user.email.split("@");
  const [first, ...rest] = n.split(/[._]/);
  const last = rest.join(" ") || "Test";
  const firstName = first[0].toUpperCase() + first.slice(1);
  const lastName = last[0].toUpperCase() + last.slice(1);
  if (!(await AuditorProfile.findOne({ user_id: user._id }))) {
    await AuditorProfile.create({
      user_id: user._id,
      tenant_id: user.tenant_id,
      title: "Mr",
      firstName,
      lastName,
      countryCode: "+1",
      phone: 3000000000,
      companyName: `${firstName} Audit Services`,
      addressline1: "789 Audit Ave",
      zipcode: "00003",
      isProfileCompleted: true,
      workExperiences: [{
        companyName: "Audit Firm",
        role: "Senior Auditor",
        experience: 5,
        skills: ["GMP", "ISO"],
      }],
      certifications: [],
      identityDocuments: [],
    });
  }
};

// ── run ───────────────────────────────────────────────────────────────────────

await mongoose.connect(process.env.MONGO_URI);
console.log("Connected to DB");

// One primary buyer tenant shared by all test roles
const testTenant = await ensureTenant({
  name: "test-tenant",
  displayName: "Test Organisation",
  type: "BUYER",
});
console.log("Test tenant:", testTenant._id.toString(), testTenant.name);

const createdUsers = {};

// buyers
for (let i = 1; i <= 5; i++) {
  const email = `buyer${i}@test.com`;
  const user = await ensureUser({ email, role: "buyer", tenant_id: testTenant._id });
  await ensureBuyerProfile(user);
  createdUsers[email] = user._id;
}

// suppliers
for (let i = 1; i <= 5; i++) {
  const email = `supplier${i}@test.com`;
  const user = await ensureUser({ email, role: "supplier", tenant_id: testTenant._id });
  await ensureSupplierProfile(user);
  createdUsers[email] = user._id;
}

// auditors
for (let i = 1; i <= 5; i++) {
  const email = `auditor${i}@test.com`;
  const user = await ensureUser({ email, role: "auditor", tenant_id: testTenant._id });
  await ensureAuditorProfile(user);
  createdUsers[email] = user._id;
}

// tenant admins
for (let i = 1; i <= 5; i++) {
  const email = `tenant_admin${i}@test.com`;
  const user = await ensureUser({ email, role: "tenant_admin", tenant_id: testTenant._id, adminScope: "TENANT" });
  await ensureBuyerProfile(user);
  createdUsers[email] = user._id;
}

// superadmins
for (let i = 1; i <= 5; i++) {
  const email = `superadmin${i}@test.com`;
  const user = await ensureUser({ email, role: "superadmin", tenant_id: testTenant._id, adminScope: "PLATFORM" });
  createdUsers[email] = user._id;
}

console.log("\nUsers created/updated:");
for (const [email, id] of Object.entries(createdUsers)) {
  console.log(`  ${email}  →  ${id}`);
}

// ── backfill existing audit records ──────────────────────────────────────────
// Set tenantOrgId on all audit records that have none, so tenant_admin/admin
// users in the test tenant can see them via the $or null-fallback query.
// Also assign buyer1@test.com as the creator for records missing a buyer.

const buyer1Id = createdUsers["buyer1@test.com"];
const supplier1Id = createdUsers["supplier1@test.com"];
const auditor1Id = createdUsers["auditor1@test.com"];
const tenantIdStr = testTenant._id.toString();

const backfillResult = await AuditRequestMaster.updateMany(
  { $or: [{ tenantOrgId: null }, { tenantOrgId: { $exists: false } }] },
  { $set: { tenantOrgId: tenantIdStr } }
);
console.log(`\nBackfilled tenantOrgId on ${backfillResult.modifiedCount} audit records → test tenant`);

// For records that have no create_by_buyer_id, assign buyer1 so they show
// in the buyer1@test.com list view.
const buyerBackfill = await AuditRequestMaster.updateMany(
  {
    tenantOrgId: tenantIdStr,
    $or: [{ create_by_buyer_id: null }, { create_by_buyer_id: { $exists: false } }],
  },
  { $set: { create_by_buyer_id: buyer1Id } }
);
console.log(`Assigned buyer1@test.com as creator on ${buyerBackfill.modifiedCount} records with no buyer`);

const totalAudits = await AuditRequestMaster.countDocuments({ tenantOrgId: tenantIdStr });
const totalUsers = await User.countDocuments();
console.log(`\nTotal audits in test tenant: ${totalAudits}`);
console.log(`Total users in DB: ${totalUsers}`);
console.log(`\nAll users password: ${PASSWORD}`);
console.log("Done.");

await mongoose.disconnect();
