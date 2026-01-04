// Backfill tenantOrgId on audits and CAPAs using related user tenant_id
// Usage: node scripts/backfill_tenant_org.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { Capa } from "../src/models/capaModel.js";
import { User } from "../src/models/userModel.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URL || "mongodb://localhost:27017/hawkeye";

const userTenantCache = new Map();

const getTenantForUser = async (userId) => {
  if (!userId) return null;
  const key = String(userId);
  if (userTenantCache.has(key)) return userTenantCache.get(key);
  const user = await User.findById(userId).select("tenant_id");
  const tenant = user?.tenant_id ? String(user.tenant_id) : null;
  userTenantCache.set(key, tenant);
  return tenant;
};

const resolveTenant = async (...userIds) => {
  for (const uid of userIds) {
    const t = await getTenantForUser(uid);
    if (t) return t;
  }
  return null;
};

async function backfillAudits() {
  const audits = await AuditRequestMaster.find({ $or: [{ tenantOrgId: { $exists: false } }, { tenantOrgId: null }] });
  let updated = 0;
  for (const audit of audits) {
    const tenant = await resolveTenant(audit.create_by_buyer_id, audit.auditor_id, audit.supplier_id);
    if (!tenant) continue;
    audit.tenantOrgId = tenant;
    await audit.save();
    updated += 1;
  }
  console.log(`Backfilled audits: ${updated}/${audits.length}`);
}

async function backfillCapas() {
  const capas = await Capa.find({ $or: [{ tenantOrgId: { $exists: false } }, { tenantOrgId: null }] });
  let updated = 0;
  for (const capa of capas) {
    const tenant = await resolveTenant(capa.buyerId, capa.auditorId, capa.supplierId, capa.ownerId, capa.createdBy);
    if (!tenant) continue;
    capa.tenantOrgId = tenant;
    await capa.save();
    updated += 1;
  }
  console.log(`Backfilled CAPAs: ${updated}/${capas.length}`);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to Mongo");
  await backfillAudits();
  await backfillCapas();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect();
  process.exit(1);
});
