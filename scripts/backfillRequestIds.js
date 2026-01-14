import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditRequestAlias } from "../src/models/auditRequestAliasModel.js";
import { User } from "../src/models/userModel.js";
import { ensureAuditRequestIds } from "../src/services/requestIdService.js";

const argValue = (flag, fallback) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dryRun = process.argv.includes("--dryRun");
const limit = toNumber(argValue("--limit", undefined), undefined);
const batchSize = toNumber(argValue("--batchSize", 200), 200);
const startAfter = argValue("--startAfter", undefined);

const normalizeId = (value) => (mongoose.Types.ObjectId.isValid(value) ? String(value) : undefined);

const run = async () => {
  await connectDatabase();
  console.log("Starting backfillRequestIds", { dryRun, limit, batchSize, startAfter });

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let lastId = startAfter;

  while (true) {
    if (limit && processed >= limit) break;
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const audits = await AuditRequestMaster.find(query).sort({ _id: 1 }).limit(batchSize).lean();
    if (!audits.length) break;

    const auditIds = audits.map((a) => a._id);
    const aliases = await AuditRequestAlias.find({ requestObjectId: { $in: auditIds } }).lean();
    const aliasMap = new Map();
    aliases.forEach((alias) => {
      const key = String(alias.requestObjectId);
      const entry = aliasMap.get(key) || { buyer: false, supplier: false };
      if (alias.scopeType === "BUYER_TENANT") entry.buyer = true;
      if (alias.scopeType === "SUPPLIER_TENANT") entry.supplier = true;
      aliasMap.set(key, entry);
    });

    const supplierUserIds = audits.map((a) => normalizeId(a.supplier_id)).filter(Boolean);
    const buyerUserIds = audits.map((a) => normalizeId(a.create_by_buyer_id)).filter(Boolean);
    const userIds = Array.from(new Set([...supplierUserIds, ...buyerUserIds]));

    const users = await User.find({ _id: { $in: userIds } }).select("_id tenant_id").lean();
    const userTenantMap = new Map(users.map((u) => [String(u._id), u.tenant_id]));

    for (const audit of audits) {
      if (limit && processed >= limit) break;
      processed += 1;
      lastId = String(audit._id);

      const aliasState = aliasMap.get(String(audit._id)) || { buyer: false, supplier: false };
      const needsHawk = !audit.hawkeyeRequestId;
      const buyerTenantId = audit.tenantOrgId || userTenantMap.get(String(audit.create_by_buyer_id)) || null;
      const supplierTenantId = userTenantMap.get(String(audit.supplier_id)) || null;
      const needsBuyerAlias = Boolean(buyerTenantId) && !aliasState.buyer;
      const needsSupplierAlias = Boolean(supplierTenantId) && !aliasState.supplier;

      if (!needsHawk && !needsBuyerAlias && !needsSupplierAlias) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        updated += 1;
        continue;
      }

      try {
        const auditDoc = await AuditRequestMaster.findById(audit._id);
        if (!auditDoc) {
          skipped += 1;
          continue;
        }
        await ensureAuditRequestIds({
          auditRequest: auditDoc,
          buyerTenantId,
          supplierTenantId,
        });
        updated += 1;
      } catch (err) {
        errors += 1;
        console.error("Failed to backfill audit", audit._id, err.message);
      }
    }
  }

  console.log("Backfill complete", { processed, updated, skipped, errors, lastId });
  await mongoose.connection.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
