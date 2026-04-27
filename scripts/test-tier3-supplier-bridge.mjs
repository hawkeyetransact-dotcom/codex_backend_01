/**
 * Tier-2.5 + Tier-3 EQMS↔Supplier integration smoke.
 *
 * Tests:
 *   1. BatchRecord with primarySupplierId → aggregator picks it up
 *   2. BatchRecord with BOM line-item supplier → aggregator picks it up via $or
 *   3. Equipment with vendorSupplierId + overdue calibration → aggregator picks it up
 *   4. Aggregator counts.batches + counts.equipment populated
 *   5. createCapaFromObservation helper — creates CAPA + back-links observation
 *      (helper called directly; full HTTP path is integration-tested elsewhere)
 *
 * Run: node scripts/test-tier3-supplier-bridge.mjs
 * Idempotent — uses RUN_TAG; cleans up at the end.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

const RUN_TAG = `tier3-bridge-${Date.now()}`;
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

// ── TEST 1: BatchRecord primarySupplierId → aggregator ───────────────
console.log("[1] BatchRecord primarySupplierId routes through aggregator");
const { BatchRecord } = await import("../src/models/BatchRecordModel.js");
const batch1 = await BatchRecord.create({
  tenantId,
  batchNumber: `LOT-${RUN_TAG}-001`,
  productName: "Atorvastatin Calcium",
  status: "PENDING_QA_REVIEW",
  manufacturingDate: new Date(),
  primarySupplierId: supplier._id,
  createdBy: buyer._id,
});
cleanup.push(["BatchRecord", batch1._id]);
check("batch with primarySupplierId created", !!batch1._id);
check("batchRecordNumber auto-generated", !!batch1.batchRecordNumber);

// ── TEST 2: BatchRecord with BOM line-item supplier ──────────────────
console.log("\n[2] BatchRecord with BOM line-item supplier picked up via $or");
const batch2 = await BatchRecord.create({
  tenantId,
  batchNumber: `LOT-${RUN_TAG}-002`,
  productName: "Metformin HCl",
  status: "MANUFACTURING",
  manufacturingDate: new Date(),
  // primarySupplierId NOT set — only BOM supplier
  billOfMaterials: [
    { materialName: "Metformin API", lotNumber: `MET-${RUN_TAG}`, supplierId: supplier._id },
    { materialName: "Microcrystalline Cellulose", lotNumber: "MCC-001", supplierId: null },
  ],
  createdBy: buyer._id,
});
cleanup.push(["BatchRecord", batch2._id]);
check("batch w/ BOM supplier created", !!batch2._id);

// ── TEST 3: Equipment vendorSupplierId + overdue calibration ─────────
console.log("\n[3] Equipment vendorSupplierId + DUE_SOON calibration picked up");
const { Equipment } = await import("../src/models/EquipmentModel.js");
const equipment = await Equipment.create({
  tenantId: String(tenantId),
  name: `${RUN_TAG} · HPLC unit 7`,
  equipmentType: "ANALYTICAL_INSTRUMENT",
  manufacturer: "Agilent",
  model: "1290 Infinity II",
  serialNumber: `SN-${RUN_TAG}`,
  status: "ACTIVE",
  requiresCalibration: true,
  calibrationStatus: "OVERDUE",
  nextCalibrationDue: new Date(Date.now() - 5 * 86400000), // 5 days ago
  vendorSupplierId: supplier._id,
  createdBy: buyer._id,
});
cleanup.push(["equipment-master", equipment._id]);
check("equipment with vendorSupplierId created", !!equipment._id);
check("equipment vendorSupplierId persists", String(equipment.vendorSupplierId) === String(supplier._id));

// ── TEST 4: Aggregator returns batches + equipment ───────────────────
console.log("\n[4] aggregateSupplierEvents includes batches + equipment");
const { aggregateSupplierEvents } = await import("../src/services/crossModule/supplierQualityEventService.js");
const agg = await aggregateSupplierEvents({ tenantId, tenantOrgKey, supplierId: supplier._id, limit: 50, includeClosed: true });

check("counts.batches >= 2 (primary + BOM)", (agg.counts.batches ?? 0) >= 2);
check("counts.equipment >= 1", (agg.counts.equipment ?? 0) >= 1);
check("counts.total includes new categories", agg.counts.total === (agg.counts.capas + agg.counts.deviations + agg.counts.complaints + agg.counts.changes + agg.counts.audits + agg.counts.batches + agg.counts.equipment));
check("our primary-supplier batch in list", agg.batches.some((b) => String(b._id) === String(batch1._id)));
check("our BOM-supplier batch in list", agg.batches.some((b) => String(b._id) === String(batch2._id)));
check("our equipment in list", agg.equipment.some((e) => String(e._id) === String(equipment._id)));

// ── TEST 5: createCapaFromObservation helper ─────────────────────────
console.log("\n[5] createCapaFromObservation per-observation helper");
const { AuditReport } = await import("../src/models/auditReportModel.js");
const { Capa } = await import("../src/models/capaModel.js");
const { AuditRequestMaster } = await import("../src/models/auditRequestsMasterModel.js");

// Find any existing audit for this supplier (seed creates 4 with various requestIds)
const seededAudit = await AuditRequestMaster.findOne({
  tenantOrgId: tenantOrgKey, supplier_id: supplier._id,
}).lean();

if (!seededAudit) {
  console.log("  (skipping — seed audit AUDIT-DEMO-9001 not found; run seed first)");
} else {
  // Reuse or create the report for this audit (one per audit due to unique index)
  const obsTitle = `${RUN_TAG} · critical particulate finding`;
  let report = await AuditReport.findOne({ auditRequestId: seededAudit._id });
  if (!report) {
    report = await AuditReport.create({
      auditRequestId: seededAudit._id,
      tenantOrgId: tenantOrgKey,
      summary: "Tier-3 test report",
      status: "DRAFT",
      observations: [],
      createdBy: buyer._id,
    });
    cleanup.push(["AuditReport", report._id]);
  }
  // Push a tagged observation
  report.observations.push({
    title: obsTitle, severity: "Critical", gmpClassification: "CRITICAL",
    classification: "OAI", capaResponseDeadlineDays: 15, followUp: true,
    cfr: "ICH Q7 §17", notes: "Particulate matter found in sterile filling area.",
  });
  await report.save();
  const newObs = report.observations[report.observations.length - 1];
  const observationId = newObs._id;
  // Cleanup just the observation we added — leave the rest of the report intact
  cleanup.push([null, async () => {
    const r = await AuditReport.findById(report._id);
    if (r) {
      r.observations = r.observations.filter((o) => String(o._id) !== String(observationId));
      await r.save();
    }
  }]);
  check("test observation pushed to report", !!observationId);

  // Call the helper directly (bypass HTTP). Use the audit's assigned auditor
  // so the auditor-access guard passes.
  const auditorUser = await User.findOne({ email: "audit.lead@auditcorp.demo" });
  const { createCapaFromObservation } = await import("../src/controllers/reportController.js");
  // Mock req/res
  let capturedJson = null; let capturedStatus = 200;
  const fakeReq = {
    params: { auditId: String(seededAudit._id), observationId: String(observationId) },
    user: { _id: auditorUser?._id || buyer._id, role: "auditor", tenant_id: tenantId, adminScope: "PLATFORM" },
    tenantId: tenantOrgKey,
  };
  const fakeRes = {
    json: (x) => { capturedJson = x; return fakeRes; },
    status: (s) => { capturedStatus = s; return fakeRes; },
  };
  await createCapaFromObservation(fakeReq, fakeRes);

  check("helper returned success", capturedJson?.success === true && capturedStatus === 200);
  check("helper returned a capa id", !!capturedJson?.data?.capa?._id);
  if (capturedJson?.data?.capa?._id) cleanup.push(["Capa", capturedJson.data.capa._id]);
  check("helper status not reused on first call", capturedJson?.data?.reused === false);

  // Idempotency: call again — should reuse
  capturedJson = null;
  // Re-fetch report so the linkedCapaIds change is reflected
  await createCapaFromObservation(fakeReq, fakeRes);
  check("idempotent — second call returns reused=true", capturedJson?.data?.reused === true);
}

// ── Cleanup ──────────────────────────────────────────────────────────
console.log("\n[cleanup] removing test rows");
for (const [modelName, idOrFn] of cleanup) {
  try {
    if (modelName === null && typeof idOrFn === "function") await idOrFn();
    else await mongoose.model(modelName).deleteOne({ _id: idOrFn });
  } catch { /* ignore */ }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
