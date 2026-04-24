/**
 * Populate the remaining Novex EQMS list pages so every scene has visible data:
 *   - 5 risk items (FMEA with realistic RPN)
 *   - 2 management reviews (one scheduled, one completed)
 *   - 4 document-controlled SOPs (DRAFT / IN_REVIEW / PUBLISHED)
 *   - 3 training records
 *
 * Idempotent: each record uses a stable demo ID/number and is skipped
 * if already present.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import "../src/models/tenantModel.js";
import "../src/models/userModel.js";
import "../src/models/RiskItemModel.js";
import "../src/models/ManagementReviewModel.js";
import "../src/models/DocumentControlModel.js";
import "../src/models/TrainingRecordModel.js";

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db.databaseName;
console.log(`DB: ${db}`);

const Tenant = mongoose.model("Tenant");
const User = mongoose.model("users");
const tenant = await Tenant.findOne({ name: "novex-pharma-eqms" });
if (!tenant) { console.error("Novex tenant not found — run seed-eqms-full-users.mjs first"); process.exit(1); }
const tenantId = String(tenant._id);

const qaHead    = await User.findOne({ email: "qa.head@novex-pharma.demo", tenant_id: tenant._id });
const qaSpec    = await User.findOne({ email: "qa.specialist@novex-pharma.demo", tenant_id: tenant._id });
const docCtrl   = await User.findOne({ email: "doc.control@novex-pharma.demo", tenant_id: tenant._id });
const trainer   = await User.findOne({ email: "training.coord@novex-pharma.demo", tenant_id: tenant._id });
const vp        = await User.findOne({ email: "vp.quality@novex-pharma.demo", tenant_id: tenant._id });
const prodHead  = await User.findOne({ email: "production.head@novex-pharma.demo", tenant_id: tenant._id });

function rpn(s, o, d) { return s * o * d; }

// ── Risk items (FMEA) ────────────────────────────────────────────────────
const RISK_ITEMS = [
  { code: "RISK-DEMO-001", processStep: "Blending · Line 2", failureMode: "Blend time drift outside spec", failureEffect: "Content uniformity OOS → batch rejection", failureCause: "PLC timer bypass without verification step", severity: 8, occurrence: 5, detectability: 6, riskCategory: "QUALITY" },
  { code: "RISK-DEMO-002", processStep: "Tablet compression · Korsch XL-400", failureMode: "Compression force drift", failureEffect: "Hardness / dissolution variability", failureCause: "Firmware version mismatch with calibration table", severity: 7, occurrence: 4, detectability: 5, riskCategory: "QUALITY" },
  { code: "RISK-DEMO-003", processStep: "Environmental monitoring · Grade C airlock CA-2", failureMode: "Viable excursion > action limit", failureEffect: "Potential product contamination", failureCause: "Insufficient air-shower hold time after gowning", severity: 9, occurrence: 3, detectability: 7, riskCategory: "SAFETY" },
  { code: "RISK-DEMO-004", processStep: "Raw material receipt", failureMode: "Incoming material mislabelled by supplier", failureEffect: "Wrong API in batch → patient harm", failureCause: "Manual label verification only; no barcode scan", severity: 10, occurrence: 2, detectability: 8, riskCategory: "REGULATORY" },
  { code: "RISK-DEMO-005", processStep: "Stability testing", failureMode: "Missed pull at scheduled time-point", failureEffect: "Regulatory observation → Field Alert Report", failureCause: "Manual stability calendar not integrated with LIMS", severity: 6, occurrence: 4, detectability: 4, riskCategory: "REGULATORY" },
];
const RiskItem = mongoose.model("risk-items");
let riskCount = 0;
for (const r of RISK_ITEMS) {
  const existing = await RiskItem.findOne({ tenantId, processStep: r.processStep, failureMode: r.failureMode });
  if (existing) { console.log(`  ⏭ risk "${r.processStep}" exists`); continue; }
  const rpnVal = rpn(r.severity, r.occurrence, r.detectability);
  const band = rpnVal >= 200 ? "CRITICAL" : rpnVal >= 100 ? "HIGH" : rpnVal >= 40 ? "MEDIUM" : "LOW";
  await RiskItem.create({
    tenantId, ...r, rpn: rpnVal, riskBand: band, status: "OPEN",
    identifiedBy: qaSpec?._id || qaHead?._id,
    riskOwner: qaHead?._id || qaSpec?._id,
    identifiedDate: new Date(),
  });
  console.log(`  ✓ risk ${r.code} · RPN=${rpnVal} · ${band}`);
  riskCount++;
}

// ── Management reviews ──────────────────────────────────────────────────
const ManagementReview = mongoose.model("management-reviews");
const MRMS = [
  {
    reviewNumber: "MRM-DEMO-2026-Q1",
    title: "Q1 2026 Quality Management Review — Novex Pharma",
    status: "COMPLETED",
    plannedDate: new Date("2026-03-28"),
    completedDate: new Date("2026-03-28"),
    chairpersonId: vp?._id,
    inputs: [
      { topic: "Audit results", summary: "1 internal audit closed, 2 findings (one major on blend-uniformity).", trend: "STABLE" },
      { topic: "CAPA status", summary: "2 open CAPAs, 1 approved. No overdue.", trend: "IMPROVING" },
      { topic: "Deviation trends", summary: "3 open deviations Q1; all dissolution / equipment-related. Signal detector flagged cluster on NVX-PRESS-001.", trend: "DECLINING" },
      { topic: "Supplier quality", summary: "1 qualified supplier; Sun Pharma monitored via public FDA data (no active relationship).", trend: "STABLE" },
      { topic: "Customer complaints", summary: "0 complaints received Q1.", trend: "STABLE" },
    ],
    decisions: "Approve CAPA-DEMO-001; accelerate PLC-timer-health-check rollout; invite regulatory affairs to next MRM.",
    actionItems: [
      { description: "Deploy PLC-health-check SOP-PROD-041 rev 5 across all lines", priority: "HIGH", status: "IN_PROGRESS", dueDate: new Date("2026-05-15") },
      { description: "Complete blend-uniformity verification on next 3 batches", priority: "HIGH", status: "OPEN", dueDate: new Date("2026-06-01") },
    ],
  },
  {
    reviewNumber: "MRM-DEMO-2026-Q2",
    title: "Q2 2026 Quality Management Review — Novex Pharma",
    status: "PLANNED",
    plannedDate: new Date("2026-06-28"),
    chairpersonId: vp?._id,
    inputs: [],
    actionItems: [],
  },
];
let mrmCount = 0;
for (const m of MRMS) {
  const existing = await ManagementReview.findOne({ tenantId, reviewNumber: m.reviewNumber });
  if (existing) { console.log(`  ⏭ MRM ${m.reviewNumber} exists`); continue; }
  await ManagementReview.create({ tenantId, ...m, createdBy: vp?._id });
  console.log(`  ✓ MRM ${m.reviewNumber} · ${m.status}`);
  mrmCount++;
}

// ── Document controls (SOPs) ────────────────────────────────────────────
const DocumentControl = mongoose.model("document-controls");
const DOCS = [
  { documentNumber: "SOP-PROD-041", title: "Blend-time verification procedure (Line 2)", documentType: "SOP", version: "5.0", status: "UNDER_REVIEW", effectiveDate: null, description: "Adds PLC-health-check and shift-lead verification after timer maintenance." },
  { documentNumber: "SOP-QC-014", title: "Dissolution testing · USP <711>", documentType: "SOP", version: "7.2", status: "EFFECTIVE", effectiveDate: new Date("2025-11-15"), description: "Dissolution testing procedure for tablet release." },
  { documentNumber: "SOP-MB-003", title: "Environmental monitoring · Grade C", documentType: "SOP", version: "3.1", status: "EFFECTIVE", effectiveDate: new Date("2025-09-01"), description: "Weekly EM per annex-1 / USP <1116> for Grade C cleanrooms." },
  { documentNumber: "WI-ENG-021", title: "OQ validation · tablet press", documentType: "WORK_INSTRUCTION", version: "2.0", status: "DRAFT", effectiveDate: null, description: "Draft revision adding shift-change zero check." },
];
let docCount = 0;
for (const d of DOCS) {
  const existing = await DocumentControl.findOne({ tenantId, documentNumber: d.documentNumber });
  if (existing) { console.log(`  ⏭ doc ${d.documentNumber} exists`); continue; }
  await DocumentControl.create({
    tenantId, ...d,
    createdBy: docCtrl?._id || qaHead?._id,
    ownerId: docCtrl?._id || qaHead?._id,
  });
  console.log(`  ✓ doc ${d.documentNumber} · ${d.status}`);
  docCount++;
}

// ── Training records ───────────────────────────────────────────────────
const TrainingRecord = mongoose.model("training-records");
const TRAINING = [
  { trainingCode: "SOP-QC-014@v7.2", trainingTitle: "Dissolution testing · USP <711> · rev 7.2", trainingType: "SOP_READ_AND_UNDERSTAND", traineeId: qaSpec?._id, status: "COMPLETED", completedAt: new Date("2025-12-03"), dueDate: new Date("2025-12-15") },
  { trainingCode: "SOP-MB-003@v3.1", trainingTitle: "Environmental monitoring · Grade C", trainingType: "SOP_READ_AND_UNDERSTAND", traineeId: qaSpec?._id, status: "COMPLETED", completedAt: new Date("2025-10-10"), dueDate: new Date("2025-10-20") },
  { trainingCode: "SOP-PROD-041@v5.0", trainingTitle: "Blend-time verification · Line 2 · rev 5.0", trainingType: "SOP_READ_AND_UNDERSTAND", traineeId: prodHead?._id, status: "ASSIGNED", dueDate: new Date(Date.now() + 14 * 86400000) },
];
let trCount = 0;
for (const t of TRAINING) {
  if (!t.traineeId) continue;
  const existing = await TrainingRecord.findOne({ tenantId, trainingCode: t.trainingCode, traineeId: t.traineeId });
  if (existing) { console.log(`  ⏭ training ${t.trainingCode} for ${t.traineeId} exists`); continue; }
  await TrainingRecord.create({ tenantId, ...t, assignedByUserId: trainer?._id || qaHead?._id });
  console.log(`  ✓ training ${t.trainingCode}`);
  trCount++;
}

console.log(`\nseeded · risks=${riskCount} mrm=${mrmCount} docs=${docCount} training=${trCount}`);
await mongoose.disconnect();
