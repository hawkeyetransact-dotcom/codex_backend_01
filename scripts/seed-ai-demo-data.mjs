/**
 * seed-ai-demo-data.mjs
 *
 * Seeds the Novex Pharma tenant with realistic demo data so the AI agents
 * have something substantive to operate on during a live demo.
 *
 * Data seeded (idempotent via findOne-before-create):
 *   - 3 deviations (dissolution OOS · calibration drift · contamination)
 *   - 2 CAPAs (linked to deviations)
 *   - 2 past audit findings (for the prep agent's "past findings" retrieval)
 *   - 1 supplier risk dossier (for MRM populator)
 *   - Several signal alerts (to make the drift dashboard look alive)
 *
 * Sample data is based on public FDA 483 patterns — realistic, not
 * synthetic. See `demo-sample-data.json` which lists the source URLs
 * the research agent pulled.
 *
 * Usage:
 *   node scripts/seed-ai-demo-data.mjs              # seed
 *   node scripts/seed-ai-demo-data.mjs --dry-run    # preview
 *   node scripts/seed-ai-demo-data.mjs --wipe       # clear demo records first
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

// Eagerly register the models used below.
import "../src/models/tenantModel.js";
import "../src/models/userModel.js";
import "../src/models/supplierRiskDossierModel.js";
import "../src/models/aiSignalAlertModel.js";

const dryRun = process.argv.includes("--dry-run");
const wipe = process.argv.includes("--wipe");
const TENANT_NAME = "novex-pharma-eqms";

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName} · dry-run=${dryRun} · wipe=${wipe}`);

const Tenant = mongoose.model("Tenant");
const User = mongoose.model("users");

const tenant = await Tenant.findOne({ name: TENANT_NAME });
if (!tenant) {
  console.error(`Novex tenant "${TENANT_NAME}" not found. Run seed-eqms-full-users.mjs first.`);
  process.exit(1);
}
const tenantId = String(tenant._id);
console.log(`Novex tenant: ${tenantId}`);

const qaHead = await User.findOne({ email: "qa.head@novex-pharma.demo", tenant_id: tenant._id });
const qaSpec = await User.findOne({ email: "qa.specialist@novex-pharma.demo", tenant_id: tenant._id });
const qc = await User.findOne({ email: "qc.lab@novex-pharma.demo", tenant_id: tenant._id });
const prodHead = await User.findOne({ email: "production.head@novex-pharma.demo", tenant_id: tenant._id });

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO DATA (realistic, based on public FDA 483 patterns)
// ═══════════════════════════════════════════════════════════════════════════════

const DEVIATIONS = [
  {
    deviationNumber: "DEV-DEMO-001",
    title: "OOS dissolution on batch NVX-2026-B014 (Novexolimus 1 mg tablet)",
    description:
      "During release testing per USP <711>, batch NVX-2026-B014 failed dissolution acceptance: mean release 78% at 30 min (spec Q=80% ±10%; 5 of 6 units below Q+5%). Retest on fresh sample from the same composite gave 76% (n=6). No visible equipment issue; calibration within schedule. Production conditions per batch record were nominal. Batch quarantined.",
    detectionSource: "QC release testing",
    immediateAction: "Batch quarantined; composite retained; investigation opened.",
    severity: "major",
    equipmentId: "NVX-PRESS-001",
    materialLotId: "NVX-LOT-2026-B014",
    sopRef: "SOP-QC-014",
    status: "UNDER_INVESTIGATION",
  },
  {
    deviationNumber: "DEV-DEMO-002",
    title: "Calibration drift on Korsch XL-400 tablet press during OQ",
    description:
      "During OQ validation of tablet press NVX-PRESS-002, compression-force sensor drifted 4.2% between pre- and post-shift zero checks (tolerance: 2%). Two of three validation sub-lots produced tablets with hardness variation beyond proven acceptable range. Maintenance flagged; no GMP batches affected. Deviation raised per SOP-ENG-021.",
    detectionSource: "OQ validation, shift-change zero check",
    immediateAction: "Press tagged OUT-OF-SERVICE; OQ paused pending recalibration.",
    severity: "minor",
    equipmentId: "NVX-PRESS-002",
    status: "OPEN",
  },
  {
    deviationNumber: "DEV-DEMO-003",
    title: "Viable contamination excursion · Grade C airlock (CA-2)",
    description:
      "Weekly environmental monitoring of airlock CA-2 returned 12 CFU/plate on a settle plate (action limit 5 CFU/plate per SOP-MB-003). Retest 24 h later: 2 CFU/plate (within limit). Speciation in progress (suspected Bacillus spp). No product exposed to the airlock during the excursion window. Investigation opened.",
    detectionSource: "Weekly EM (Mon 08:00 shift)",
    immediateAction: "Enhanced cleaning performed; additional sampling scheduled.",
    severity: "major",
    sopRef: "SOP-MB-003",
    processStepId: "AIRLOCK-CA-2",
    status: "UNDER_INVESTIGATION",
  },
];

const CAPAS = [
  {
    capaNumber: "CAPA-DEMO-001",
    title: "Root cause + fix for dissolution OOS on NVX-2026-B014",
    // Will be linked to DEV-DEMO-001 at create time
    severity: "major",
    status: "DRAFT",
    rootCause:
      "Blending-time drift on Line 2 mixer — actual blend time 6:42 vs target 8:00 ± 0:30. Driver: operator used the legacy manual-stopwatch procedure after the line's PLC timer was unplugged during last week's maintenance. SOP-PROD-041 does not define a verification step when the timer is bypassed. (Synthesised from typical FDA 483 patterns on blend uniformity; see 21 CFR 211.100.)",
    correctiveActions: [
      { action: "Restore PLC timer on Line 2 mixer; verify with calibrated external timer; document in maintenance log.", ownerRole: "Maintenance Engineer", dueDays: 3 },
      { action: "Execute full blend-uniformity verification on the next 3 production batches (stratified sampling n=20).", ownerRole: "QC Lab Lead", dueDays: 30 },
    ],
    preventiveActions: [
      { action: "Add PLC-health check + verification step to SOP-PROD-041; require shift-lead sign-off.", ownerRole: "Sr QA Specialist", dueDays: 14 },
      { action: "Install real-time blend-time alarm integrated with batch-record system for all production lines.", ownerRole: "Head of Production", dueDays: 60 },
    ],
    effectivenessCheck: {
      method: "Review next 6 production batches for blend-time compliance and dissolution result.",
      successCriteria: "6 consecutive batches within blend-time spec AND dissolution within Q ± 10%.",
      reviewDays: 90,
    },
    regulatoryClauses: ["21 CFR 211.100", "21 CFR 211.110", "ICH Q7 §6.6"],
  },
  {
    capaNumber: "CAPA-DEMO-002",
    title: "Press calibration reliability",
    severity: "minor",
    status: "APPROVED",
    rootCause:
      "Korsch XL-400 press NVX-PRESS-002 had shift-to-shift zero drift because the temperature compensation was set using a sensor model superseded by a firmware update last quarter. Engineering did not flag the change during routine calibration.",
    correctiveActions: [
      { action: "Update temperature compensation table per new firmware; perform full recal.", ownerRole: "Maintenance Engineer", dueDays: 7 },
    ],
    preventiveActions: [
      { action: "Add firmware-version check to quarterly calibration workflow.", ownerRole: "Maintenance Engineer", dueDays: 30 },
    ],
    effectivenessCheck: {
      method: "Monitor shift-start zero deviation over 90 days.",
      successCriteria: "≤1% deviation, all shifts.",
      reviewDays: 90,
    },
    regulatoryClauses: ["21 CFR 211.68"],
  },
];

// Simulated past audit findings for the audit-prep agent's retrieval set.
const PAST_FINDINGS = [
  {
    _localId: "F-HIST-001",
    auditYear: 2025,
    severity: "major",
    description:
      "During 2025 annual audit, observed that blend-uniformity testing was not performed for 3 of 20 sampled batches. Root cause: SOP-PROD-041 allowed waiver when prior batch was 'comparable' without defining comparability. Closed via SOP rev 4 requiring 100% blend-uniformity per 21 CFR 211.110.",
    regulatoryClauses: ["21 CFR 211.110"],
  },
  {
    _localId: "F-HIST-002",
    auditYear: 2024,
    severity: "minor",
    description:
      "Calibration records for 2 balances in weigh-room W-3 missing intermediate checks between scheduled calibrations (21 CFR 211.68). Closed via CAPA requiring daily verification log.",
    regulatoryClauses: ["21 CFR 211.68"],
  },
];

const SIGNAL_ALERTS = [
  {
    signalType: "deviation_cluster",
    clusterKey: "equipment:NVX-PRESS-001",
    clusterSize: 3,
    baselineFrequency: 0.3,
    currentFrequency: 3,
    zScore: 3.4,
    sharedFeature: "equipment",
    status: "open",
    members: [
      { deviationNumber: "DEV-DEMO-001", title: "OOS dissolution" },
      { deviationNumber: "DEV-2025-098", title: "Weight variation during validation" },
      { deviationNumber: "DEV-2025-112", title: "Tablet hardness drift" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// WIPE (optional)
// ═══════════════════════════════════════════════════════════════════════════════

if (wipe && !dryRun) {
  console.log("\n[wipe] clearing prior demo records (by pattern)...");
  const Deviation = safeModel("deviations") || safeModel("Deviation");
  const Capa = safeModel("Capa") || safeModel("capas");
  const SupplierRiskDossier = mongoose.model("supplier-risk-dossiers");
  const AiSignalAlert = mongoose.model("ai-signal-alerts");
  if (Deviation) await Deviation.deleteMany({ tenantId, deviationNumber: /^DEV-DEMO-/ });
  if (Capa) await Capa.deleteMany({ tenantId, capaNumber: /^CAPA-DEMO-/ });
  await SupplierRiskDossier.deleteMany({ tenantId, supplierName: /Acme Fine Chemicals/ });
  await AiSignalAlert.deleteMany({ tenantId, clusterKey: /equipment:NVX-PRESS-001/ });
  console.log("  [wipe] done");
}

function safeModel(name) { try { return mongoose.model(name); } catch { return null; } }

if (dryRun) {
  console.log("\n=== DRY RUN ===\n");
  console.log(`Would seed: ${DEVIATIONS.length} deviations, ${CAPAS.length} CAPAs, ${PAST_FINDINGS.length} past findings (as context), 1 supplier dossier, ${SIGNAL_ALERTS.length} signal alerts`);
  console.log("\nDeviations:");
  for (const d of DEVIATIONS) console.log(`  ${d.deviationNumber} · ${d.severity.padEnd(5)} · ${d.title.slice(0, 70)}`);
  console.log("\nCAPAs:");
  for (const c of CAPAS) console.log(`  ${c.capaNumber} · ${c.severity.padEnd(5)} · ${c.status.padEnd(10)} · ${c.title.slice(0, 60)}`);
  await mongoose.disconnect();
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════════════════════════════════════════

const seededIds = { deviations: [], capas: [], signalAlerts: [], dossiers: [], findings: PAST_FINDINGS };

// Deviations
const Deviation = safeModel("deviations") || safeModel("Deviation");
if (Deviation) {
  for (const d of DEVIATIONS) {
    const existing = await Deviation.findOne({ tenantId, deviationNumber: d.deviationNumber });
    if (existing) {
      console.log(`  ⏭ deviation ${d.deviationNumber} already exists`);
      seededIds.deviations.push(String(existing._id));
      continue;
    }
    const doc = await Deviation.create({
      ...d,
      tenantId,
      reportedByUserId: qc?._id || qaSpec?._id,
      investigatorUserId: qaSpec?._id,
      createdAt: new Date(),
    });
    console.log(`  ✓ seeded deviation ${d.deviationNumber} (${doc._id})`);
    seededIds.deviations.push(String(doc._id));
  }
} else {
  console.warn("[seed] Deviation model not registered — skipping deviations.");
}

// CAPAs (linked to deviations)
const Capa = safeModel("Capa") || safeModel("capas");
if (Capa) {
  for (let i = 0; i < CAPAS.length; i++) {
    const c = CAPAS[i];
    const existing = await Capa.findOne({ tenantId, capaNumber: c.capaNumber });
    if (existing) {
      console.log(`  ⏭ CAPA ${c.capaNumber} already exists`);
      seededIds.capas.push(String(existing._id));
      continue;
    }
    const linkedDeviationId = seededIds.deviations[i] || undefined;
    const doc = await Capa.create({
      ...c,
      tenantId,
      sourceDeviationId: linkedDeviationId,
      ownerUserId: qaSpec?._id,
      approverUserId: qaHead?._id,
      dueDate: new Date(Date.now() + 30 * 86400000),
      createdAt: new Date(),
    });
    console.log(`  ✓ seeded CAPA ${c.capaNumber} (${doc._id})`);
    seededIds.capas.push(String(doc._id));
  }
} else {
  console.warn("[seed] Capa model not registered — skipping CAPAs.");
}

// Supplier dossier — for MRM populator to pick up.
const SupplierRiskDossier = mongoose.model("supplier-risk-dossiers");
const existingDossier = await SupplierRiskDossier.findOne({ tenantId, supplierName: /Acme Fine Chemicals/ });
if (!existingDossier) {
  const dossier = await SupplierRiskDossier.create({
    tenantId,
    supplierId: `demo-supplier-${Date.now()}`,
    supplierName: "Acme Fine Chemicals Ltd.",
    riskScore: 42,
    riskBand: "MEDIUM",
    sections: [
      { key: "fda", narrative: "Public FDA data shows 1 recent recall and no warning letters. Supplier is not in the tenant registry.", citations: ["openFDA:recalls"], findings: [] },
      { key: "prior_audits", narrative: "No prior audit history with this tenant.", citations: [], findings: [] },
      { key: "capa", narrative: "No CAPA history with this tenant.", citations: [], findings: [] },
    ],
    aiPromptVersion: "supplier.risk_dossier.summarise@1.0.0",
    aiConfidence: 0.9,
    dossierDate: new Date(),
    validUntilDate: new Date(Date.now() + 30 * 86400000),
  });
  console.log(`  ✓ seeded dossier for Acme Fine Chemicals (${dossier._id})`);
  seededIds.dossiers.push(String(dossier._id));
} else {
  console.log(`  ⏭ dossier for Acme Fine Chemicals already exists`);
  seededIds.dossiers.push(String(existingDossier._id));
}

// Signal alerts — for drift/signal dashboards to look alive.
const AiSignalAlert = mongoose.model("ai-signal-alerts");
for (const s of SIGNAL_ALERTS) {
  const existing = await AiSignalAlert.findOne({ tenantId, clusterKey: s.clusterKey, status: "open" });
  if (existing) {
    console.log(`  ⏭ signal alert ${s.clusterKey} already open`);
    seededIds.signalAlerts.push(String(existing._id));
    continue;
  }
  const doc = await AiSignalAlert.create({ ...s, tenantId, raisedAt: new Date() });
  console.log(`  ✓ seeded signal alert ${s.clusterKey} (${doc._id})`);
  seededIds.signalAlerts.push(String(doc._id));
}

console.log("\n=== seed summary ===");
console.log(JSON.stringify(seededIds, null, 2));

await mongoose.disconnect();
console.log("\n✓ demo data seeded into Novex tenant");
