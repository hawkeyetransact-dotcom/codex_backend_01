/**
 * seed-fresh-transactions.mjs — adds NEW demo records (not idempotent).
 *
 * Different from seed-audit-only-users.mjs:
 *   - Always inserts new rows (RUN_TAG suffix on every title)
 *   - Designed to populate the demo with fresh transactions before each
 *     test run so personas see live data
 *
 * What it creates (each invocation):
 *   1. SupplierPreQualification (DRAFT → SUBMITTED → APPROVED in 3 transitions)
 *   2. Deviation (CRITICAL · supplier-traced · auto-FAR clock fires)
 *   3. Complaint (CRITICAL SAFETY · MDR clock auto · for-cause audit auto-fires)
 *   4. ChangeControl (SUPPLIER-type · triggersRequalification auto-true)
 *   5. BatchRecord (PENDING_QA_REVIEW · primarySupplierId set)
 *   6. Equipment (vendorSupplierId set · OVERDUE calibration)
 *   7. CAPA (NEEDS_SUPPLIER) attached to one of the seeded audits
 *   8. CAPA status flip APPROVED → fires scorecard-refresh hook
 *
 * Run:
 *   node scripts/seed-fresh-transactions.mjs           # default
 *   node scripts/seed-fresh-transactions.mjs --count 5 # 5 of each
 *
 * Output: prints counts + IDs for verification.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

const COUNT_MULTIPLIER = (() => {
  const i = process.argv.indexOf("--count");
  if (i > 0 && process.argv[i + 1]) return Math.max(1, parseInt(process.argv[i + 1], 10) || 1);
  return 1;
})();

const RUN_TAG = `fresh-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
console.log(`Run tag: ${RUN_TAG}`);
console.log(`Count multiplier: ${COUNT_MULTIPLIER}\n`);

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}\n`);

// ── Resolve personas + seed entities we'll reference ───────────────────
const { User } = await import("../src/models/userModel.js");
const Tenant = (await import("../src/models/tenantModel.js")).default;
const { SupplierMasterProducts } = await import("../src/models/supplierMasterProductModel.js");
const { SupplierSite } = await import("../src/models/supplierSiteDataModel.js");

const karan  = await User.findOne({ email: "buyer.purchase@acme-pharma.demo" });
const priya  = await User.findOne({ email: "audit.program@acme-pharma.demo" });
const elena  = await User.findOne({ email: "vp.quality@acme-pharma.demo" });
const maria  = await User.findOne({ email: "audit.lead@auditcorp.demo" });
const asha   = await User.findOne({ email: "qa.head@globalpharma.demo" });
const deepa  = await User.findOne({ email: "qc.lab@globalpharma.demo" });
const meera  = await User.findOne({ email: "regulatory@globalpharma.demo" });
const amit   = await User.findOne({ email: "production.mgr@globalpharma.demo" });

if (!priya || !asha || !maria) {
  console.error("Missing seeded personas. Run scripts/seed-audit-only-users.mjs first.");
  process.exit(1);
}

const tenantId = priya.tenant_id;
const tenant = await Tenant.findById(tenantId).select("name").lean();
const tenantOrgKey = tenant?.name || "acme-pharma-audit";

const product = await SupplierMasterProducts.findOne({ name: /atorvastatin/i }) || await SupplierMasterProducts.findOne({});
const site = await SupplierSite.findOne({ user_id: asha._id }) || await SupplierSite.findOne({});

console.log(`Tenant: ${tenantOrgKey}`);
console.log(`Supplier (Asha): ${asha._id}`);
console.log(`Product: ${product?.name} (${product?._id})`);
console.log(`Site: ${site?.site_name} (${site?._id})\n`);

const created = { pqs: [], deviations: [], complaints: [], changes: [], batches: [], equipment: [], capas: [], audits: [], snapshots: [] };

for (let i = 1; i <= COUNT_MULTIPLIER; i++) {
  const idx = COUNT_MULTIPLIER > 1 ? `-${i}` : "";

  // ── 1. SupplierPreQualification ────────────────────────────────────
  const { SupplierPreQualification } = await import("../src/models/SupplierPreQualificationModel.js");
  const validUntil = new Date(); validUntil.setFullYear(validUntil.getFullYear() + 2);
  const pq = await SupplierPreQualification.create({
    tenantId: tenantOrgKey,
    supplierId: asha._id,
    initiatedBy: karan._id,
    supplierName: `${RUN_TAG}${idx} · Global Pharma renewed`,
    scope: "Renewal pre-qualification for Atorvastatin Calcium · ICH Q7 + 21 CFR 211",
    initialRiskBand: "MEDIUM",
    regulatoryStandards: ["ICH Q7", "21 CFR 211", "EU GMP Part II"],
    productCategories: ["API"],
    status: "APPROVED",
    decision: "APPROVED",
    decisionBy: maria._id,
    decisionAt: new Date(),
    decisionNotes: `${RUN_TAG} fresh-data run · auto-approved for demo`,
    validUntil,
    submittedAt: new Date(Date.now() - 86400000),
  });
  created.pqs.push({ id: pq._id, number: pq.pqNumber });

  // ── 2. Deviation w/ supplierId ─────────────────────────────────────
  const { Deviation } = await import("../src/models/DeviationModel.js");
  const dev = await Deviation.create({
    tenantId,
    title: `${RUN_TAG}${idx} · OOS dissolution result`,
    description: "QC analyst (Deepa) detected out-of-spec dissolution result on Atorvastatin lot. Investigation triggered.",
    classification: "CRITICAL",
    category: "LABORATORY",
    status: "UNDER_INVESTIGATION",
    productName: product?.name || "Atorvastatin Calcium",
    batchNumbers: [`AT-${RUN_TAG}-LOT${idx}`],
    supplierId: asha._id,
    supplierLot: `GP-LOT-${RUN_TAG}${idx}`,
    reportedBy: deepa._id,
    impactAssessment: {
      patientSafetyImpact: "Potential — dissolution profile affects bioavailability",
      regulatoryImpact: "FDA notification under 21 CFR 314.81 may be required",
    },
  });
  created.deviations.push({ id: dev._id, number: dev.deviationNumber, supplier: !!dev.sourceFromSupplier });

  // ── 3. Complaint w/ regulatory + supplierId → fires for-cause audit ──
  const { Complaint } = await import("../src/models/ComplaintModel.js");
  const { triggerForCauseAudit } = await import("../src/services/crossModuleService.js");
  const complaint = await Complaint.create({
    tenantId,
    title: `${RUN_TAG}${idx} · adverse event report`,
    description: "Patient reports anaphylactic reaction tied to Atorvastatin lot. MDR clock active.",
    severity: "CRITICAL",
    complaintType: "SAFETY",
    source: "PATIENT",
    productName: product?.name || "Atorvastatin Calcium",
    isMedicalDevice: false,
    supplierId: asha._id,
    reportedBy: priya._id,
    status: "OPEN",
  });
  created.complaints.push({ id: complaint._id, number: complaint.complaintNumber, mdrDue: complaint.mdrDueDate });

  // Fire the for-cause audit hook
  if (product && site) {
    const trig = await triggerForCauseAudit({
      tenantId: tenantOrgKey,
      supplierId: asha._id,
      reason: `COMPLAINT_REGULATORY · ${complaint.complaintNumber} · ${RUN_TAG}`,
      triggeredBy: String(priya._id),
      createdByUserId: priya._id,
      sourceType: "COMPLAINT",
      sourceId: complaint._id,
    });
    if (trig?.created) {
      created.audits.push({ id: trig.auditId, type: "FOR_CAUSE", source: complaint.complaintNumber });
      await Complaint.updateOne({ _id: complaint._id }, { $set: { linkedAuditId: trig.auditId } });
    } else {
      created.audits.push({ id: trig?.existingId, type: "FOR_CAUSE", source: complaint.complaintNumber, reused: true });
    }
  }

  // ── 4. ChangeControl SUPPLIER-type ────────────────────────────────
  const ChangeControl = (await import("../src/models/ChangeControlModel.js")).default;
  const change = await ChangeControl.create({
    tenantId,
    title: `${RUN_TAG}${idx} · supplier route change request`,
    description: "Global Pharma requests synthesis route change for Atorvastatin Calcium step 3. Requires impact assessment + regulatory filing.",
    changeType: "SUPPLIER",
    riskLevel: "HIGH",
    requestedBy: meera._id,
    supplierId: asha._id,
  });
  created.changes.push({ id: change._id, number: change.changeNumber, requalif: change.triggersRequalification });

  // ── 5. BatchRecord with primarySupplierId + BOM line ──────────────
  const { BatchRecord } = await import("../src/models/BatchRecordModel.js");
  const batch = await BatchRecord.create({
    tenantId,
    batchNumber: `LOT-${RUN_TAG}${idx}`,
    productName: product?.name || "Atorvastatin Calcium",
    status: "PENDING_QA_REVIEW",
    manufacturingDate: new Date(),
    primarySupplierId: asha._id,
    billOfMaterials: [
      { materialName: "Atorvastatin API", lotNumber: `AT-RAW-${RUN_TAG}${idx}`, supplierId: asha._id },
      { materialName: "Microcrystalline cellulose", lotNumber: `MCC-${RUN_TAG}${idx}`, supplierId: null },
    ],
    createdBy: amit._id,
  });
  created.batches.push({ id: batch._id, number: batch.batchRecordNumber });

  // ── 6. Equipment with vendorSupplierId + OVERDUE calibration ──────
  const { Equipment } = await import("../src/models/EquipmentModel.js");
  const equip = await Equipment.create({
    tenantId: String(tenantId),
    name: `${RUN_TAG}${idx} · HPLC unit`,
    equipmentType: "ANALYTICAL_INSTRUMENT",
    manufacturer: "Agilent",
    model: "1290 Infinity II",
    serialNumber: `SN-${RUN_TAG}${idx}`,
    status: "ACTIVE",
    requiresCalibration: true,
    calibrationStatus: "OVERDUE",
    nextCalibrationDue: new Date(Date.now() - 7 * 86400000),
    vendorSupplierId: asha._id,
    createdBy: priya._id,
  });
  created.equipment.push({ id: equip._id, number: equip.equipmentNumber });

  // ── 7. CAPA in NEEDS_SUPPLIER on an existing seeded audit ─────────
  const { Capa } = await import("../src/models/capaModel.js");
  const { AuditRequestMaster } = await import("../src/models/auditRequestsMasterModel.js");
  const seedAudit = await AuditRequestMaster.findOne({ tenantOrgId: tenantOrgKey, supplier_id: asha._id }).lean();
  if (seedAudit) {
    const capa = await Capa.create({
      tenantOrgId: tenantOrgKey,
      auditId: seedAudit._id,
      title: `${RUN_TAG}${idx} · improve calibration scheduling`,
      description: "Establish a 6-month calibration schedule for high-precision HPLCs in QC Lab.",
      severity: "minor",
      status: "NEEDS_SUPPLIER",
      supplierId: asha._id,
      buyerId: priya._id,
      ownerId: asha._id,
      targetDate: new Date(Date.now() + 30 * 86400000),
      createdBy: maria._id,
    });
    created.capas.push({ id: capa._id, status: capa.status });

    // ── 8. Flip a CAPA to APPROVED → fires scorecard-refresh hook ─────
    capa.status = "APPROVED";
    capa.lastActivityAt = new Date();
    capa.updatedBy = maria._id;
    await capa.save();

    const { calculateSupplierScorecard } = await import("../src/services/crossModuleService.js");
    const { SupplierRiskSnapshot } = await import("../src/models/SupplierRiskSnapshot.js");
    const card = await calculateSupplierScorecard(asha._id, tenantOrgKey);
    const BAND = { LOW_RISK: "Low", MEDIUM_RISK: "Medium", HIGH_RISK: "High" };
    const snap = await SupplierRiskSnapshot.create({
      supplierId: asha._id,
      riskModelVersion: "fresh-data-run@1.0.0",
      finalScore: card.overallScore,
      finalScoreV2: card.overallScore,
      riskBand: BAND[card.band] || "Medium",
      breakdown: { regulatory: card.breakdown?.auditScore ?? 0, capa: card.breakdown?.capaScore ?? 0 },
      reasons: [`${RUN_TAG} · refreshed after CAPA ${capa._id} APPROVED`],
      debug: { source: "fresh-data-script", scorecard: card },
      calculatedAt: new Date(),
    });
    created.snapshots.push({ id: snap._id, score: card.overallScore, band: card.band });
  }
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log("CREATED FRESH TRANSACTIONS:");
console.log(`  Pre-Quals:            ${created.pqs.length} · numbers: ${created.pqs.map((p) => p.number).join(", ")}`);
console.log(`  Deviations:           ${created.deviations.length} · numbers: ${created.deviations.map((d) => d.number).join(", ")}`);
console.log(`  Complaints:           ${created.complaints.length} · numbers: ${created.complaints.map((c) => c.number).join(", ")}`);
console.log(`  Change Controls:      ${created.changes.length} · numbers: ${created.changes.map((c) => c.number).join(", ")}`);
console.log(`  Batches:              ${created.batches.length} · numbers: ${created.batches.map((b) => b.number).join(", ")}`);
console.log(`  Equipment:            ${created.equipment.length} · numbers: ${created.equipment.map((e) => e.number).join(", ")}`);
console.log(`  CAPAs (open + closed):${created.capas.length}`);
console.log(`  For-cause audits:     ${created.audits.length} · ${created.audits.map((a) => `${a.id}${a.reused ? " (reused)" : ""}`).join(", ")}`);
console.log(`  SupplierRiskSnapshots:${created.snapshots.length} · scores: ${created.snapshots.map((s) => `${s.score}/${s.band}`).join(", ")}`);
console.log(`${"=".repeat(60)}`);
console.log(`\n👉 All linked to supplierId=${asha._id} (Asha · Global Pharma)`);
console.log(`👉 Verify via: GET /api/suppliers/${asha._id}/quality-events?includeClosed=true`);

await mongoose.disconnect();
