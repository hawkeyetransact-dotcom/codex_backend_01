import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { SupplierPublicSignal } from "../src/models/SupplierPublicSignal.js";
import { SupplierRiskMetrics } from "../src/models/SupplierRiskMetrics.js";
import { SupplierRiskSnapshot } from "../src/models/SupplierRiskSnapshot.js";
import { recalculateSupplierRisk } from "../src/services/risk/riskOrchestrator.js";

const argValue = (flag, fallback = undefined) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
};

const hasFlag = (flag) => process.argv.includes(flag);

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const dedupeIds = (values = []) => {
  const seen = new Set();
  const list = [];
  values.forEach((value) => {
    const objectId = toObjectId(value);
    if (!objectId) return;
    const key = String(objectId);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(objectId);
  });
  return list;
};

const closeAndExit = async (code = 0) => {
  try {
    await mongoose.connection.close();
  } catch (_error) {
    // no-op
  }
  process.exit(code);
};

const DEFAULT_PUBLIC_SIGNAL = {
  fda483CountRecent24m: 0,
  warningLetterRecent24m: false,
  importAlertActive: false,
  inspectionsOpenCount: 0,
  recalls: [],
  sources: [{ sourceType: "manual", reference: "risk_validate_and_backfill", capturedAt: new Date() }],
  regionFlags: [],
};

const DEFAULT_RISK_METRICS = {
  questionnaireOnTimeRate: 0.85,
  avgResponseHoursToFollowups: 48,
  capaOverdueCount: 0,
  capaReopenRate: 0.1,
  evidenceQualityScore: 75,
  docCompletenessScore: 75,
  computedFrom: "manual",
};

const resolveSupplierScope = async ({ tenantId, buyerId }) => {
  const scopeOr = [];
  if (tenantId) scopeOr.push({ tenantOrgId: String(tenantId) });
  if (buyerId) scopeOr.push({ create_by_buyer_id: buyerId });

  const baseQuery = { isArchived: { $ne: true } };
  const query = scopeOr.length ? { ...baseQuery, $or: scopeOr } : baseQuery;
  const supplierIds = await AuditRequestMaster.distinct("supplier_id", query);
  return dedupeIds(supplierIds);
};

const main = async () => {
  const apply = hasFlag("--apply");
  const dryRun = hasFlag("--dryRun") || !apply;
  const tenantId = argValue("--tenantId", null);
  const buyerId = argValue("--buyerId", null);

  const tenantObjectId = toObjectId(tenantId);
  const buyerObjectId = toObjectId(buyerId);

  await connectDatabase();
  console.log("risk_validate_and_backfill start", {
    mode: dryRun ? "dryRun" : "apply",
    tenantId: tenantObjectId ? String(tenantObjectId) : null,
    buyerId: buyerObjectId ? String(buyerObjectId) : null,
  });

  const supplierIds = await resolveSupplierScope({
    tenantId: tenantObjectId,
    buyerId: buyerObjectId,
  });

  if (!supplierIds.length) {
    console.log("No buyer-linked suppliers found for provided scope.");
    await closeAndExit(0);
    return;
  }

  const report = [];
  let insertedSignals = 0;
  let insertedMetrics = 0;
  let recalculated = 0;

  for (const supplierId of supplierIds) {
    const [profile, signal, metrics, latestSnapshot] = await Promise.all([
      SupplierProfile.findOne({ user_id: supplierId }).select("companyName tenant_id").lean(),
      SupplierPublicSignal.findOne({ supplierId }).lean(),
      SupplierRiskMetrics.findOne({ supplierId }).lean(),
      SupplierRiskSnapshot.findOne({ supplierId }).sort({ calculatedAt: -1 }).lean(),
    ]);

    const missingSignal = !signal;
    const missingMetrics = !metrics;
    const missingSnapshot = !latestSnapshot;

    if (apply) {
      if (missingSignal) {
        await SupplierPublicSignal.create({
          supplierId,
          ...DEFAULT_PUBLIC_SIGNAL,
        });
        insertedSignals += 1;
      }
      if (missingMetrics) {
        await SupplierRiskMetrics.create({
          supplierId,
          ...DEFAULT_RISK_METRICS,
        });
        insertedMetrics += 1;
      }

      if (missingSignal || missingMetrics || missingSnapshot) {
        await recalculateSupplierRisk({
          supplierId,
          eventType: "MANUAL_OVERRIDE",
          correlationId: `risk-backfill-${Date.now()}`,
        });
        recalculated += 1;
      }
    }

    report.push({
      supplierId: String(supplierId),
      companyName: profile?.companyName || "Unknown Supplier",
      profileTenantId: profile?.tenant_id ? String(profile.tenant_id) : null,
      hasPublicSignal: Boolean(signal),
      hasRiskMetrics: Boolean(metrics),
      hasRiskSnapshot: Boolean(latestSnapshot),
      latestSnapshotAt: latestSnapshot?.calculatedAt || null,
    });
  }

  console.table(report);
  console.log("risk_validate_and_backfill summary", {
    mode: dryRun ? "dryRun" : "apply",
    supplierCount: supplierIds.length,
    missingSignals: report.filter((item) => !item.hasPublicSignal).length,
    missingMetrics: report.filter((item) => !item.hasRiskMetrics).length,
    missingSnapshots: report.filter((item) => !item.hasRiskSnapshot).length,
    insertedSignals,
    insertedMetrics,
    recalculated,
  });

  await closeAndExit(0);
};

main().catch((error) => {
  console.error("risk_validate_and_backfill failed", error);
  closeAndExit(1);
});
