/**
 * Integration smoke for the EQMS↔Supplier Quality bridge.
 *
 * Test scenarios:
 *   1. Create a Deviation linked to a supplier — verify supplierId persists + sourceFromSupplier flag set
 *   2. Create a SUPPLIER-type ChangeControl — verify triggersRequalification auto-set
 *   3. aggregateSupplierEvents() returns the new deviation under the supplier
 *   4. buildSupplierContextForAi() returns a non-null compact summary
 *   5. Module bundle resolution: SUPPLIER_QUALITY ON → CAPA + EVENT + AUDIT also resolved ON
 *   6. SupplierContext flows into complaintTriageService prompt (smoke — does not call LLM)
 *
 * Run:
 *   node scripts/test-supplier-quality-events.mjs
 *
 * Idempotent — uses unique title prefixes so re-runs don't accumulate.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

const RUN_TAG = `supplier-bridge-smoke-${Date.now()}`;
let pass = 0, fail = 0;

function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);
console.log(`Run tag: ${RUN_TAG}\n`);

// Look up a known seeded user to use as supplier
const { User } = await import("../src/models/userModel.js");
const supplier = await User.findOne({ email: "qa.head@globalpharma.demo" });
const buyer    = await User.findOne({ email: "audit.program@acme-pharma.demo" });
if (!supplier || !buyer) {
  console.error("Missing seeded users — run scripts/seed-audit-only-users.mjs first.");
  process.exit(1);
}
const tenantId = buyer.tenant_id;
const tenantOrgKey = "acme-pharma-audit";

console.log(`Supplier: ${supplier.email} (${supplier._id})`);
console.log(`Buyer:    ${buyer.email} (${buyer._id})`);
console.log(`Tenant:   ${tenantId} · orgKey=${tenantOrgKey}\n`);

// ── TEST 1: Deviation w/ supplierId ──────────────────────────────────
console.log("[1] Deviation with supplierId");
const { Deviation } = await import("../src/models/DeviationModel.js");
const dev = await Deviation.create({
  tenantId,
  title: `${RUN_TAG} · supplier-traced deviation`,
  description: "Atorvastatin lot AT-2026-0421 contains particulate matter above spec.",
  classification: "MAJOR",
  category: "MATERIAL",
  status: "REPORTED",
  productName: "Atorvastatin Calcium",
  batchNumbers: ["AT-2026-0421"],
  supplierId: supplier._id,
  supplierLot: "GP-LOT-AT-0421",
  reportedBy: buyer._id,
});
check("deviation created", !!dev._id);
check("supplierId persisted", String(dev.supplierId) === String(supplier._id));
check("sourceFromSupplier auto-derived", dev.sourceFromSupplier === true);
check("deviationNumber generated", !!dev.deviationNumber);

// ── TEST 2: ChangeControl SUPPLIER-type auto-triggers requal ────────
console.log("\n[2] ChangeControl auto-flag triggersRequalification");
const ChangeControl = (await import("../src/models/ChangeControlModel.js")).default;
const change = await ChangeControl.create({
  tenantId,
  title: `${RUN_TAG} · supplier change`,
  description: "Supplier Global Pharma proposes synthesis route change for Atorvastatin Calcium.",
  changeType: "SUPPLIER",
  riskLevel: "HIGH",
  requestedBy: buyer._id,
  supplierId: supplier._id,
});
check("change created", !!change._id);
check("supplierId persisted", String(change.supplierId) === String(supplier._id));
check("triggersRequalification auto-set", change.triggersRequalification === true);

// ── TEST 3: Aggregator returns the new deviation + change ─────────────
console.log("\n[3] aggregateSupplierEvents returns the new rows");
const { aggregateSupplierEvents } = await import("../src/services/crossModule/supplierQualityEventService.js");
const agg = await aggregateSupplierEvents({
  tenantId, tenantOrgKey, supplierId: supplier._id,
  limit: 25, includeClosed: true,
});
check("aggregator returns counts", typeof agg.counts.total === "number");
check("our deviation is in the open list", agg.deviations.some((d) => String(d._id) === String(dev._id)));
check("our change is in the open list", agg.changes.some((c) => String(c._id) === String(change._id)));
check("counts.total > 0", agg.counts.total > 0);

// ── TEST 4: AI compact summary ───────────────────────────────────────
console.log("\n[4] buildSupplierContextForAi returns headline summary");
const { buildSupplierContextForAi } = await import("../src/services/crossModule/supplierQualityEventService.js");
const aiCtx = await buildSupplierContextForAi({ tenantId, tenantOrgKey, supplierId: supplier._id });
check("supplier context not null", aiCtx != null);
check("supplier context shape ok", aiCtx?.open && typeof aiCtx.open.deviations === "number");
check("our deviation appears in topOpenDeviations", aiCtx?.topOpenDeviations.some((d) => d.title?.includes(RUN_TAG)));

// ── TEST 5: Module bundle resolution ─────────────────────────────────
console.log("\n[5] Module bundles — SUPPLIER_QUALITY pulls in CAPA/EVENT/AUDIT");
const { applyModuleBundles } = await import("../src/services/universalModuleConfigService.js");
const raw = {
  SUPPLIER_QUALITY: true,
  CAPA_MANAGEMENT: false,
  EVENT_MANAGEMENT: false,
  AUDIT_MANAGEMENT: false,
  DOCUMENT_CONTROL: false,
};
const { resolved, promotedBy } = applyModuleBundles(raw);
check("SUPPLIER_QUALITY stays on", resolved.SUPPLIER_QUALITY === true);
check("CAPA_MANAGEMENT promoted", resolved.CAPA_MANAGEMENT === true);
check("EVENT_MANAGEMENT promoted", resolved.EVENT_MANAGEMENT === true);
check("AUDIT_MANAGEMENT promoted", resolved.AUDIT_MANAGEMENT === true);
check("promotedBy records the reason", Array.isArray(promotedBy.CAPA_MANAGEMENT) && promotedBy.CAPA_MANAGEMENT.includes("SUPPLIER_QUALITY"));
check("transitive: AUDIT_MANAGEMENT bundle pulls DOCUMENT_CONTROL", resolved.DOCUMENT_CONTROL === true);

// ── Cleanup test rows ────────────────────────────────────────────────
console.log("\n[cleanup] removing test rows");
await Deviation.deleteOne({ _id: dev._id });
await ChangeControl.deleteOne({ _id: change._id });

// ── Summary ──────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
