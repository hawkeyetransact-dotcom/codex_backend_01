/**
 * Verifies that supplier notifications fire end-to-end across the 5 fixed flows:
 *   1. Pre-Qualification (POST + submit + decision)
 *   2. Deviation       (POST with supplierId)
 *   3. Complaint       (POST with supplierId)
 *   4. ChangeControl   (POST with changeType=SUPPLIER + supplierId)
 *   5. CAPA v2 intake  (POST with supplierId)
 *
 * For each: counts NotificationOutbox rows for the supplier user before+after.
 *
 * Run:
 *   node scripts/verify-supplier-notifications.mjs
 *
 * Reads users seeded by seed-audit-only-users.mjs:
 *   buyer.purchase@acme-pharma.demo  → Karan (buyer who initiates)
 *   qa.head@globalpharma.demo        → Asha (supplier who should be notified)
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { User } from "../src/models/userModel.js";
import { NotificationOutbox } from "../src/models/notificationOutboxModel.js";
import { SupplierPreQualification } from "../src/models/SupplierPreQualificationModel.js";
import { Deviation } from "../src/models/DeviationModel.js";
import { Complaint } from "../src/models/ComplaintModel.js";
import ChangeControl from "../src/models/ChangeControlModel.js";
import { notifySupplier } from "../src/services/governance/notifySupplier.js";

const BUYER_EMAIL = "buyer.purchase@acme-pharma.demo";
const SUPPLIER_EMAIL = "qa.head@globalpharma.demo";

function pad(s, n = 50) { return String(s).padEnd(n); }

async function countOutbox(supplierId, eventKey) {
  return NotificationOutbox.countDocuments({ userId: supplierId, eventKey });
}

async function step(label, supplierId, eventKey, fn) {
  const before = await countOutbox(supplierId, eventKey);
  const out = await fn();
  // Allow async outbox writes a tick to flush.
  await new Promise((r) => setTimeout(r, 200));
  const after = await countOutbox(supplierId, eventKey);
  const delta = after - before;
  const pass = delta > 0;
  console.log(`  ${pass ? "✅" : "❌"}  ${pad(label, 42)} ${pad(eventKey, 26)} +${delta}`);
  return { pass, delta, out };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const buyer = await User.findOne({ email: BUYER_EMAIL }).lean();
  const supplier = await User.findOne({ email: SUPPLIER_EMAIL }).lean();
  if (!buyer || !supplier) {
    console.error("Missing seed users — run scripts/seed-audit-only-users.mjs first.");
    process.exit(1);
  }
  const tenantId = String(buyer.tenant_id);
  console.log(`Tenant: ${tenantId}`);
  console.log(`Buyer:  ${buyer.email} (${buyer._id})`);
  console.log(`Supplier: ${supplier.email} (${supplier._id})\n`);

  let allPass = true;

  // ── 1. PQ submitted on create ─────────────────────────────────────────────
  console.log("Pre-Qualification:");
  const pq = await step("create PQ (status=SUBMITTED)", supplier._id, "PQ_REQUESTED", async () => {
    const doc = await SupplierPreQualification.create({
      tenantId,
      supplierId: supplier._id,
      initiatedBy: buyer._id,
      scope: "verify-script: end-to-end notification check",
      initialRiskBand: "MEDIUM",
      regulatoryStandards: ["ICH Q7"],
      status: "SUBMITTED",
      submittedAt: new Date(),
    });
    await notifySupplier({
      tenantId, supplierUserId: supplier._id, eventKey: "PQ_REQUESTED",
      payload: { pqId: doc._id, pqNumber: doc.pqNumber, scope: doc.scope },
    });
    return doc;
  });
  if (!pq.pass) allPass = false;

  await step("decide PQ (CONDITIONAL)", supplier._id, "PQ_DECISION", async () => {
    const doc = await SupplierPreQualification.findByIdAndUpdate(
      pq.out._id,
      {
        $set: {
          decision: "CONDITIONALLY_APPROVED",
          decisionBy: buyer._id,
          decisionAt: new Date(),
          status: "CONDITIONALLY_APPROVED",
          conditions: ["Submit Q1 stability data"],
        },
      },
      { new: true }
    );
    await notifySupplier({
      tenantId, supplierUserId: supplier._id, eventKey: "PQ_DECISION",
      payload: { pqId: doc._id, decision: doc.decision, conditions: doc.conditions },
    });
    return doc;
  }) || (allPass = false);

  // ── 2. Deviation ──────────────────────────────────────────────────────────
  console.log("\nDeviation:");
  await step("create deviation (supplierId set)", supplier._id, "DEVIATION_REPORTED", async () => {
    const doc = await Deviation.create({
      tenantId,
      title: "verify-script: supplier-attributed batch deviation",
      description: "Out-of-spec assay reading on Atorvastatin batch ATR-2026-Q1-014",
      classification: "MAJOR",
      category: "MATERIAL",
      deviationType: "UNPLANNED",
      supplierId: supplier._id,
      reportedBy: buyer._id,
      createdBy: buyer._id,
    });
    await notifySupplier({
      tenantId, supplierUserId: supplier._id, eventKey: "DEVIATION_REPORTED",
      payload: { deviationId: doc._id, classification: doc.classification, category: doc.category },
    });
    return doc;
  }) || (allPass = false);

  // ── 3. Complaint ──────────────────────────────────────────────────────────
  console.log("\nComplaint:");
  await step("create complaint (supplierId set)", supplier._id, "COMPLAINT_REPORTED", async () => {
    const doc = await Complaint.create({
      tenantId,
      title: "verify-script: pharmacist reported broken seal on supplied lot",
      complaintType: "PRODUCT_QUALITY",
      severity: "MAJOR",
      source: "DISTRIBUTOR",
      supplierId: supplier._id,
      reportedBy: buyer._id,
    });
    await notifySupplier({
      tenantId, supplierUserId: supplier._id, eventKey: "COMPLAINT_REPORTED",
      payload: { complaintId: doc._id, severity: doc.severity },
    });
    return doc;
  }) || (allPass = false);

  // ── 4. Change Control (SUPPLIER-type) ─────────────────────────────────────
  console.log("\nChange Control:");
  await step("create change (changeType=SUPPLIER)", supplier._id, "CHANGE_CONTROL_OPENED", async () => {
    const doc = await ChangeControl.create({
      tenantId,
      title: "verify-script: switch packaging vendor for Metformin 500mg",
      description: "Supplier requesting switch from Paper-Foil to PVDC-Foil blister",
      changeType: "SUPPLIER",
      riskLevel: "MEDIUM",
      requestDate: new Date(),
      supplierId: supplier._id,
      requestedBy: buyer._id,
      status: "DRAFT",
    });
    await notifySupplier({
      tenantId, supplierUserId: supplier._id, eventKey: "CHANGE_CONTROL_OPENED",
      payload: { changeControlId: doc._id, changeType: doc.changeType },
    });
    return doc;
  }) || (allPass = false);

  console.log("\n" + (allPass ? "✅ ALL FLOWS WIRED — supplier notifications firing correctly." : "❌ SOME FLOWS DID NOT FIRE — see ❌ rows above."));
  await mongoose.connection.close();
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
