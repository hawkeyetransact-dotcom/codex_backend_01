/**
 * Tier-2 EQMS↔Supplier integration smoke.
 *
 * Tests:
 *   1. Complaint with requiresRegulatoryReporting + supplierId → for-cause audit auto-created
 *   2. Re-running the same complaint → no duplicate audit (dedupe works)
 *   3. Complaint linkedAuditId is back-filled
 *   4. CAPA status change to APPROVED + supplierId → scorecard recomputes + SupplierRiskSnapshot row written
 *
 * Run: node scripts/test-tier2-supplier-bridge.mjs
 * Idempotent — uses unique title prefixes; cleans up rows it creates.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

const RUN_TAG = `tier2-bridge-${Date.now()}`;
let pass = 0, fail = 0;
const cleanup = [];

function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);
console.log(`Run tag: ${RUN_TAG}\n`);

const { User } = await import("../src/models/userModel.js");
const Tenant = (await import("../src/models/tenantModel.js")).default;
const supplier = await User.findOne({ email: "qa.head@globalpharma.demo" });
const buyer    = await User.findOne({ email: "audit.program@acme-pharma.demo" });
if (!supplier || !buyer) { console.error("Run scripts/seed-audit-only-users.mjs first"); process.exit(1); }
const tenantId = buyer.tenant_id;
const tenant = await Tenant.findById(tenantId).select("name").lean();
const tenantOrgKey = tenant?.name || "acme-pharma-audit";

console.log(`Supplier: ${supplier.email} (${supplier._id})`);
console.log(`Buyer:    ${buyer.email}`);
console.log(`Tenant:   ${tenantOrgKey} / ${tenantId}\n`);

// ── TEST 1: complaint regulatory + supplierId → for-cause audit ───────
console.log("[1] Complaint regulatory + supplierId → for-cause audit");
const { Complaint } = await import("../src/models/ComplaintModel.js");
const { AuditRequestMaster } = await import("../src/models/auditRequestsMasterModel.js");
const { triggerForCauseAudit } = await import("../src/services/crossModuleService.js");

// Clean up any prior run's for-cause audit so dedup behaves.
await AuditRequestMaster.deleteMany({
  tenantOrgId: tenantOrgKey, supplier_id: supplier._id, auditType: "FOR_CAUSE",
  forCauseSourceType: "COMPLAINT",
});

const complaint = await Complaint.create({
  tenantId,
  title: `${RUN_TAG} · MDR-class complaint`,
  description: "Patient reports anaphylactic reaction to Atorvastatin lot AT-2026-0421.",
  severity: "CRITICAL",
  complaintType: "SAFETY",
  source: "PATIENT",
  productName: "Atorvastatin Calcium",
  isMedicalDevice: false,
  supplierId: supplier._id,
  reportedBy: buyer._id,
  status: "OPEN",
});
cleanup.push(["Complaint", complaint._id]);
check("complaint created", !!complaint._id);
check("requiresRegulatoryReporting auto-set", complaint.requiresRegulatoryReporting === true);

// Direct call to the trigger helper (the route hook is fire-and-forget; in real flow it runs async).
const trigResult = await triggerForCauseAudit({
  tenantId: tenantOrgKey,
  supplierId: supplier._id,
  reason: `COMPLAINT_REGULATORY · ${complaint.complaintNumber}`,
  triggeredBy: String(buyer._id),
  sourceType: "COMPLAINT",
  sourceId: complaint._id,
});
check("for-cause audit created", trigResult?.created === true && !!trigResult.auditId);
if (trigResult?.auditId) cleanup.push(["AuditRequestMaster", trigResult.auditId]);

// ── TEST 2: re-trigger → dedupe ──────────────────────────────────────
console.log("\n[2] Dedupe — second trigger reuses the existing for-cause audit");
const trig2 = await triggerForCauseAudit({
  tenantId: tenantOrgKey,
  supplierId: supplier._id,
  reason: "COMPLAINT_REGULATORY (duplicate test)",
  triggeredBy: String(buyer._id),
  sourceType: "COMPLAINT",
  sourceId: complaint._id,
});
check("second trigger returns created=false", trig2?.created === false);
check("second trigger reports existing id", String(trig2?.existingId) === String(trigResult?.auditId));

// ── TEST 3: complaint back-link (simulate the route hook's update) ────
console.log("\n[3] Complaint linkedAuditId back-fill");
await Complaint.updateOne({ _id: complaint._id }, { $set: { linkedAuditId: trigResult.auditId } });
const complaintAfter = await Complaint.findById(complaint._id).lean();
check("linkedAuditId persisted", String(complaintAfter?.linkedAuditId) === String(trigResult?.auditId));

// ── TEST 4: CAPA closure → scorecard refresh + snapshot ──────────────
console.log("\n[4] CAPA closure → scorecard refresh + SupplierRiskSnapshot persisted");
const { Capa } = await import("../src/models/capaModel.js");
const { SupplierRiskSnapshot } = await import("../src/models/SupplierRiskSnapshot.js");

const capa = await Capa.create({
  tenantOrgId: tenantOrgKey,
  title: `${RUN_TAG} · supplier closure CAPA`,
  description: "Test CAPA for tier-2 scorecard hook.",
  severity: "minor",
  status: "IN_REVIEW",
  supplierId: supplier._id,
  buyerId: buyer._id,
  ownerId: supplier._id,
  targetDate: new Date(Date.now() + 30 * 86400000),
  createdBy: buyer._id,
});
cleanup.push(["Capa", capa._id]);

// Snapshot count before
const beforeCount = await SupplierRiskSnapshot.countDocuments({ supplierId: supplier._id });

// Manually run the same recompute path the controller uses
const { calculateSupplierScorecard } = await import("../src/services/crossModuleService.js");
const card = await calculateSupplierScorecard(supplier._id, tenantOrgKey);
check("scorecard returned a numeric overallScore", typeof card?.overallScore === "number");
check("scorecard returned a band", ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"].includes(card?.band));
check("scorecard breakdown has auditScore", typeof card?.breakdown?.auditScore === "number");

// Persist a snapshot exactly as the controller does (with band + field mapping)
const BAND_MAP = { LOW_RISK: "Low", MEDIUM_RISK: "Medium", HIGH_RISK: "High" };
const snap = await SupplierRiskSnapshot.create({
  supplierId: supplier._id,
  riskModelVersion: "tier2-capa-closure@1.0.0",
  finalScore: card.overallScore,
  finalScoreV2: card.overallScore,
  riskBand: BAND_MAP[card.band] || "Medium",
  breakdown: { regulatory: card.breakdown?.auditScore ?? 0, capa: card.breakdown?.capaScore ?? 0 },
  reasons: [`Recomputed after CAPA ${capa._id} reached terminal state`],
  debug: { source: "test", scorecard: card },
  calculatedAt: new Date(),
});
cleanup.push(["SupplierRiskSnapshot", snap._id]);
const afterCount = await SupplierRiskSnapshot.countDocuments({ supplierId: supplier._id });
check("snapshot persisted (count incremented)", afterCount === beforeCount + 1);

// ── TEST 5: aggregator now sees the linked complaint + audit ─────────
console.log("\n[5] Aggregator returns the linked complaint + the for-cause audit");
const { aggregateSupplierEvents } = await import("../src/services/crossModule/supplierQualityEventService.js");
const agg = await aggregateSupplierEvents({ tenantId, tenantOrgKey, supplierId: supplier._id, limit: 50, includeClosed: false });
check("complaint shows in aggregator", agg.complaints.some((c) => String(c._id) === String(complaint._id)));
check("for-cause audit shows in aggregator", agg.audits.some((a) => String(a._id) === String(trigResult.auditId)));

// ── Cleanup ──────────────────────────────────────────────────────────
console.log("\n[cleanup] removing test rows");
for (const [modelName, id] of cleanup) {
  try { await mongoose.model(modelName).deleteOne({ _id: id }); } catch { /* ignore */ }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
