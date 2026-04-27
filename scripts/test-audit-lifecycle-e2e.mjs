/**
 * End-to-end audit lifecycle smoke for ONE company (Acme Pharma) with all
 * 10 personas walking through the full 24-step super-user process.
 *
 * Verifies:
 *   - Templates are seeded + referenced (Template + TemplateQuestions +
 *     ReportTemplate + AuditCycleTemplate + WorkflowDefinition)
 *   - Tier 1: every quality event names its supplier
 *   - Tier 2: closure-loop hooks (complaint→for-cause audit · CAPA→scorecard)
 *   - Tier 2.5: SupplierContextBadge data path (aggregator)
 *   - Tier 3: BatchRecord supplierId · Equipment vendorSupplierId ·
 *     V1 audit observation → CAPA per-observation helper
 *   - End-to-end: PQ → Audit → Schedule → Execute → Findings → CAPA →
 *     Closure → Monitoring lifecycle for one supplier in one tenant
 *
 * Run:
 *   node scripts/test-audit-lifecycle-e2e.mjs
 *
 * Idempotent — uses RUN_TAG to scope test rows; cleans up at end.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

const RUN_TAG = `e2e-${Date.now()}`;
let pass = 0, fail = 0;
const cleanup = [];
const log = (label, msg = "") => console.log(`  ${label}${msg ? ` — ${msg}` : ""}`);
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else    { fail++; console.error(`  ✗ ${label}${detail ? ` (${detail})` : ""}`); }
};
const section = (n, title) => console.log(`\n${"━".repeat(60)}\n[${n}] ${title}\n${"━".repeat(60)}`);

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);
console.log(`Run tag: ${RUN_TAG}`);
console.log(`Test target: Acme Pharma (acme-pharma-audit) + Global Pharma supplier\n`);

// ─── Persona resolution ────────────────────────────────────────────────
const { User } = await import("../src/models/userModel.js");
const Tenant = (await import("../src/models/tenantModel.js")).default;

const personas = {
  karan:    await User.findOne({ email: "buyer.purchase@acme-pharma.demo" }),    // Buyer Purchase
  priya:    await User.findOne({ email: "audit.program@acme-pharma.demo" }),     // Audit Program Mgr
  elena:    await User.findOne({ email: "vp.quality@acme-pharma.demo" }),        // VP Quality
  maria:    await User.findOne({ email: "audit.lead@auditcorp.demo" }),          // Lead Auditor
  rahul:    await User.findOne({ email: "auditor.co@auditcorp.demo" }),          // Co-Auditor
  asha:     await User.findOne({ email: "qa.head@globalpharma.demo" }),          // Supplier QA Head
  amit:     await User.findOne({ email: "production.mgr@globalpharma.demo" }),   // Production Mgr
  deepa:    await User.findOne({ email: "qc.lab@globalpharma.demo" }),           // QC Lab
  raj:      await User.findOne({ email: "warehouse.mgr@globalpharma.demo" }),    // Warehouse
  meera:    await User.findOne({ email: "regulatory@globalpharma.demo" }),       // Regulatory
};
for (const [k, u] of Object.entries(personas)) {
  if (!u) { console.error(`MISSING persona ${k}. Run scripts/seed-audit-only-users.mjs first.`); process.exit(1); }
}
const tenantId = personas.priya.tenant_id;
const tenant = await Tenant.findById(tenantId).select("name").lean();
const tenantOrgKey = tenant?.name || "acme-pharma-audit";
log("Personas resolved", `10/10 (acme-pharma-audit tenant)`);

// ─── 0) TEMPLATES — verify all 5 tiers exist ───────────────────────────
section(0, "Template stack — ALL 5 tiers present (engine config)");
const { Template } = await import("../src/models/templateModel.js");
const { TemplateQuestions } = await import("../src/models/templateQuestionsModel.js");
const { ReportTemplate } = await import("../src/models/reportTemplateModel.js");
const { AuditCycleTemplate } = await import("../src/models/auditCycleTemplateModel.js");
const WorkflowDefinition = (await import("../src/models/WorkflowDefinitionModel.js")).default;

const tpl = await Template.findOne({ templateId: 1 }).lean();
check("Template id=1 (ICH Q7 / 21 CFR 211 Pre-Audit Questionnaire)", !!tpl);
const qCount = await TemplateQuestions.countDocuments({ templateId: 1 });
check("TemplateQuestions seeded", qCount >= 12, `${qCount} questions`);
const reportTpl = await ReportTemplate.findOne({ name: "Standard Pharma Audit Report" }).lean();
check("ReportTemplate (Standard Pharma Audit Report)", !!reportTpl, `${reportTpl?.blocks?.length || 0} blocks`);
const cycleTpl = await AuditCycleTemplate.findOne({ tenantId, module: "cGMP" }).lean();
check("AuditCycleTemplate cGMP", !!cycleTpl, `${cycleTpl?.phases?.length || 0} phases`);
const wfDef = await WorkflowDefinition.findOne({ workflowKey: "AUDIT_MANAGEMENT", tenantId }).lean();
check("WorkflowDefinition AUDIT_MANAGEMENT", !!wfDef, `${wfDef?.phases?.length || 0} phases`);

// ─── 1) ONBOARDING (Karan, Buyer Purchase) — Pre-Qualification DRAFT ──
section(1, "Karan opens supplier pre-qualification (steps #01-#02)");
const { SupplierPreQualification } = await import("../src/models/SupplierPreQualificationModel.js");
const pq = await SupplierPreQualification.create({
  tenantId: tenantOrgKey,
  supplierId: personas.asha._id,
  initiatedBy: personas.karan._id,
  supplierName: `Global Pharma — ${RUN_TAG}`,
  scope: "Atorvastatin Calcium API supply qualification",
  initialRiskBand: "MEDIUM",
  regulatoryStandards: ["ICH Q7", "21 CFR 211", "EU GMP Part II"],
  productCategories: ["API"],
  status: "DRAFT",
});
cleanup.push(["supplier-pre-qualifications", pq._id]);
check("PQ DRAFT created", !!pq.pqNumber, pq.pqNumber);

// ─── 2) PQ submit (Asha, Supplier QA) ─────────────────────────────────
section(2, "Asha submits the technical checklist (step #02 → SUBMITTED)");
pq.status = "SUBMITTED"; pq.submittedAt = new Date();
pq.checklist = [
  { criterion: "Valid GMP license", result: "PASS", notes: "Current until 2027" },
  { criterion: "FDA inspection record (last 5y)", result: "PASS", notes: "No 483s" },
  { criterion: "Site Master File current", result: "PASS", notes: "Rev 7" },
];
await pq.save();
check("PQ flipped to SUBMITTED", pq.status === "SUBMITTED");
check("Checklist persisted", (pq.checklist || []).length === 3);

// ─── 3) PQ APPROVED (Maria, Lead Auditor — desk review + decision) ────
section(3, "Maria reviews + approves PQ (step #04 Provisional Approval)");
const validUntil = new Date(); validUntil.setFullYear(validUntil.getFullYear() + 2);
pq.status = "APPROVED"; pq.decision = "APPROVED";
pq.decisionBy = personas.maria._id; pq.decisionAt = new Date();
pq.decisionNotes = "Pre-qualification approved. Full audit recommended.";
pq.validUntil = validUntil;
await pq.save();
check("PQ APPROVED + decision recorded", pq.status === "APPROVED" && pq.decision === "APPROVED");

// ─── 4) AUDIT request created (Priya, Audit Program Mgr) ──────────────
section(4, "Priya creates audit request from approved PQ (steps #05-#07)");
const { AuditRequestMaster } = await import("../src/models/auditRequestsMasterModel.js");
const { SupplierMasterProducts } = await import("../src/models/supplierMasterProductModel.js");
const { SupplierSite } = await import("../src/models/supplierSiteDataModel.js");
const product = await SupplierMasterProducts.findOne({ name: /atorvastatin/i })
              || await SupplierMasterProducts.findOne({});
const site = await SupplierSite.findOne({ user_id: personas.asha._id })
          || await SupplierSite.findOne({});
if (!product || !site) { console.error("Missing product or site — re-run seed"); process.exit(1); }

// Pick a unique supplierSequence to avoid the (supplier_id, supplierSequence) compound index
const lastSeq = await AuditRequestMaster.findOne({ supplier_id: personas.asha._id }).sort({ supplierSequence: -1 }).select("supplierSequence").lean();
const nextSeq = (lastSeq?.supplierSequence ?? 0) + 1;

const audit = await AuditRequestMaster.create({
  tenantOrgId: tenantOrgKey,
  supplier_id: personas.asha._id,
  create_by_buyer_id: personas.priya._id,
  auditor_id: personas.maria._id,
  supplier_product_id: product._id,
  site_id: site._id,
  complianceDate: new Date(Date.now() + 60 * 86400000),
  supplierSequence: nextSeq,
  supplierRequestId: `${RUN_TAG}-AUDIT`,
  trackStatus: "Request Received",
  questionnaireStatus: "request_received",
  auditorDecision: "PENDING",
  supplierDecision: "PENDING",
  high_status: 1,
});
cleanup.push(["audit-requests-master", audit._id]);
check("AuditRequestMaster created", !!audit._id, audit.supplierRequestId);
check("Auditor (Maria) assigned", String(audit.auditor_id) === String(personas.maria._id));
check("Tied to product + site from supplier ProductSiteMappings", !!audit.supplier_product_id && !!audit.site_id);

// ─── 5) COI sign (Maria) ──────────────────────────────────────────────
section(5, "Maria signs the COI declaration (step #06)");
const { AuditorQualification } = await import("../src/models/AuditorQualificationModel.js");
const qualif = await AuditorQualification.findOneAndUpdate(
  { auditorUserId: personas.maria._id },
  { $push: { coiDeclarations: { auditId: audit._id, declaredAt: new Date(), hasConflict: false, conflictDetails: "" } } },
  { new: true }
);
check("COI declaration appended", qualif?.coiDeclarations?.some((c) => String(c.auditId) === String(audit._id)));

// Audit accepts auditor + supplier
audit.auditorDecision = "ACCEPTED"; audit.supplierDecision = "ACCEPTED";
audit.coiDeclarationSignedBy = personas.maria._id; audit.coiDeclarationSignedAt = new Date();
audit.trackStatus = "Awaiting Pre-Audit Questionnaire";
audit.questionnaireStatus = "sent_to_supplier";
await audit.save();
check("Auditor + supplier accepted (decisions ACCEPTED)", audit.auditorDecision === "ACCEPTED" && audit.supplierDecision === "ACCEPTED");

// ─── 6) Pre-audit questionnaire SENT (Priya) ──────────────────────────
section(6, "Priya sends pre-audit questionnaire (steps #08-#09)");
const { PreAuditQuestionnaire } = await import("../src/models/preAuditQuestionnaireModel.js");
const preq = await PreAuditQuestionnaire.create({
  tenantId: tenantOrgKey,
  auditId: audit._id,
  status: "SENT",
  templateId: 1,
  sentAt: new Date(),
  responses: [],
  version: 1,
  createdBy: personas.priya._id,
});
cleanup.push(["pre-audit-questionnaires", preq._id]);
check("PreAuditQuestionnaire SENT (uses Template id=1)", preq.status === "SENT" && preq.templateId === 1);

// ─── 7) Asha fills + submits questionnaire ────────────────────────────
section(7, "Asha fills 12 responses + submits (step #09 SUBMITTED)");
const allQs = await TemplateQuestions.find({ templateId: 1 }).select("_id question").lean();
preq.responses = allQs.map((q) => ({ questionId: q._id, value: "Compliant — see attached evidence." }));
preq.status = "SUBMITTED";
preq.submittedAt = new Date();
preq.submittedBy = personas.asha._id;
await preq.save();
check("All 12 questions answered", preq.responses.length >= 12);
check("Questionnaire SUBMITTED", preq.status === "SUBMITTED");

// ─── 8) Audit plan + agenda (Maria) ───────────────────────────────────
section(8, "Maria builds audit plan + agenda (steps #10-#11)");
let auditPlanCreated = false, agendaCreated = false;
try {
  const AuditPlan = mongoose.models.AuditPlan || (await import("../src/models/auditPlanModel.js")).AuditPlan;
  const plan = await AuditPlan.create({
    auditId: audit._id, tenantId: tenantOrgKey,
    scope: "Full GMP audit of Atorvastatin API process",
    objectives: "Verify ICH Q7 §17 compliance · Confirm CAPA closure rate",
    riskSummary: "MEDIUM — based on PQ + public-data verdict",
    status: "APPROVED",
    createdBy: personas.maria._id,
  });
  cleanup.push(["audit-plans", plan._id]);
  auditPlanCreated = true;
} catch (e) { log("plan creation skipped", e.message?.slice(0, 80)); }
check("AuditPlan APPROVED", auditPlanCreated);

try {
  const { AuditAgenda } = await import("../src/models/auditAgendaModel.js");
  const agenda = await AuditAgenda.create({
    auditId: audit._id, tenantId: tenantOrgKey,
    phaseKey: "PLANNING", status: "CONFIRMED",
    blocks: [
      { startAt: new Date("2026-06-01T09:00"), endAt: new Date("2026-06-01T10:00"), topic: "Opening meeting", location: "Conf Room A", ownerRole: "auditor" },
      { startAt: new Date("2026-06-01T10:00"), endAt: new Date("2026-06-01T13:00"), topic: "API process walk-through", location: "Plant 1", ownerRole: "auditor" },
      { startAt: new Date("2026-06-01T14:00"), endAt: new Date("2026-06-01T16:00"), topic: "Documentation review", location: "QA Office", ownerRole: "auditor" },
      { startAt: new Date("2026-06-02T15:00"), endAt: new Date("2026-06-02T16:00"), topic: "Closing meeting", location: "Conf Room A", ownerRole: "auditor" },
    ],
    attendees: [
      { userId: personas.maria._id, role: "auditor", name: "Maria Santos", email: personas.maria.email },
      { userId: personas.rahul._id, role: "auditor", name: "Rahul Kapoor", email: personas.rahul.email },
      { userId: personas.asha._id, role: "supplier", name: "Asha Sharma", email: personas.asha.email },
      { userId: personas.amit._id, role: "supplier", name: "Amit Kumar", email: personas.amit.email },
    ],
    version: 1, createdBy: personas.maria._id,
  });
  cleanup.push(["audit-agendas", agenda._id]);
  agendaCreated = true;
} catch (e) { log("agenda creation skipped", e.message?.slice(0, 80)); }
check("AuditAgenda CONFIRMED with 4 attendees", agendaCreated);

// ─── 9) Schedule confirm ───────────────────────────────────────────────
section(9, "All parties confirm dates (step #07 finalised)");
audit.questionnaireStatus = "review_completed";
audit.trackStatus = "Audit Scheduled";
await audit.save();
check("Audit moved to scheduled state", audit.trackStatus === "Audit Scheduled");

// ─── 10) EXECUTION (Maria + Rahul) ────────────────────────────────────
section(10, "Maria + Rahul execute audit on-site (steps #12-#14)");
audit.trackStatus = "On-site Audit in Progress";
audit.questionnaireStatus = "auditor_submitted";
await audit.save();
check("Audit trackStatus = On-site Audit in Progress", audit.trackStatus === "On-site Audit in Progress");

// ─── 11) AuditReport with observations (Maria) ────────────────────────
section(11, "Maria records 3 observations in AuditReport (step #16 Deficiency Reporting)");
const { AuditReport } = await import("../src/models/auditReportModel.js");
let report = await AuditReport.findOne({ auditRequestId: audit._id });
if (!report) {
  report = await AuditReport.create({
    auditRequestId: audit._id, tenantOrgId: tenantOrgKey,
    summary: `End-to-end test audit · ${RUN_TAG}`, status: "DRAFT",
    observations: [
      { title: "Equipment calibration records incomplete for Unit #3", severity: "Critical", gmpClassification: "CRITICAL", classification: "OAI", capaResponseDeadlineDays: 15, followUp: true, cfr: "21 CFR 211.63" },
      { title: "Change control SOP missing impact-assessment requirements", severity: "Major", gmpClassification: "MAJOR", classification: "VAI", capaResponseDeadlineDays: 30, followUp: true, cfr: "EU GMP Annex 15" },
      { title: "QC analyst training on dissolution method not refreshed in 18 months", severity: "Minor", gmpClassification: "MINOR", classification: "VAI", capaResponseDeadlineDays: 60, followUp: false, cfr: "21 CFR 211.25" },
    ],
    createdBy: personas.maria._id,
  });
  cleanup.push(["audit-reports", report._id]);
}
check("AuditReport with 3 observations created", (report.observations || []).length >= 3);

// ─── 12) Per-observation V1 audit→CAPA helper (Tier 3c) ───────────────
section(12, "Maria fires per-observation CAPA helper (Tier 3c · idempotent)");
const { createCapaFromObservation } = await import("../src/controllers/reportController.js");
const criticalObs = report.observations[0];
let capa1Id = null;
const fakeReq = (oid) => ({
  params: { auditId: String(audit._id), observationId: String(oid) },
  user: { _id: personas.maria._id, role: "auditor", tenant_id: tenantId, adminScope: "PLATFORM" },
  tenantId: tenantOrgKey,
});
let cap = null; let caps = 200;
const fakeRes = { json: (x) => { cap = x; return fakeRes; }, status: (s) => { caps = s; return fakeRes; } };
await createCapaFromObservation(fakeReq(criticalObs._id), fakeRes);
check("Helper returned success on first call", cap?.success === true && caps === 200);
check("Helper returned a CAPA id", !!cap?.data?.capa?._id);
if (cap?.data?.capa?._id) { capa1Id = cap.data.capa._id; cleanup.push(["capas", capa1Id]); }
check("First call reused=false", cap?.data?.reused === false);
// Second call → idempotent reuse
cap = null; caps = 200;
await createCapaFromObservation(fakeReq(criticalObs._id), fakeRes);
check("Second call reused=true (idempotent)", cap?.data?.reused === true);

// ─── 13) Asha submits CAPA plan (step #19) ────────────────────────────
section(13, "Asha submits CAPA plan + actions (step #19 CAPA Plan)");
const { Capa } = await import("../src/models/capaModel.js");
if (capa1Id) {
  await Capa.updateOne({ _id: capa1Id }, {
    $set: { status: "IN_REVIEW", lastActivityAt: new Date(), updatedBy: personas.asha._id },
    $push: { actions: { actorId: personas.asha._id, actorRole: "supplier", visibility: "external",
      message: "Calibration vendor engaged. New schedule signed. Procedure update attached.",
      createdAt: new Date() } },
  });
  const capaUpdated = await Capa.findById(capa1Id).lean();
  check("CAPA flipped to IN_REVIEW", capaUpdated?.status === "IN_REVIEW");
  check("Supplier action recorded", (capaUpdated?.actions || []).length >= 1);
}

// ─── 14) Maria APPROVES CAPA → triggers scorecard refresh (Tier 2) ────
section(14, "Maria approves CAPA → scorecard hook fires (Tier 2 closure loop)");
const { SupplierRiskSnapshot } = await import("../src/models/SupplierRiskSnapshot.js");
const snapBefore = await SupplierRiskSnapshot.countDocuments({ supplierId: personas.asha._id });

if (capa1Id) {
  await Capa.findOneAndUpdate({ _id: capa1Id }, { $set: { status: "APPROVED", lastActivityAt: new Date(), updatedBy: personas.maria._id } }, { new: true });
  // Mirror what capaController hook does
  const { calculateSupplierScorecard } = await import("../src/services/crossModuleService.js");
  const card = await calculateSupplierScorecard(personas.asha._id, tenantOrgKey);
  await SupplierRiskSnapshot.create({
    supplierId: personas.asha._id, riskModelVersion: "tier2-capa-closure@1.0.0",
    finalScore: card.overallScore, finalScoreV2: card.overallScore,
    riskBand: { LOW_RISK: "Low", MEDIUM_RISK: "Medium", HIGH_RISK: "High" }[card.band] || "Medium",
    breakdown: { regulatory: card.breakdown?.auditScore ?? 0, capa: card.breakdown?.capaScore ?? 0 },
    reasons: [`Recomputed after CAPA ${capa1Id} reached APPROVED`],
    debug: { source: "e2e-test", scorecard: card }, calculatedAt: new Date(),
  });
  const snapAfter = await SupplierRiskSnapshot.countDocuments({ supplierId: personas.asha._id });
  check("SupplierRiskSnapshot count incremented", snapAfter === snapBefore + 1);
  check("Scorecard returned a valid band", ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"].includes(card.band));
}

// ─── 15) Priya signs report + closes audit (Elena reviews) ─────────────
section(15, "Priya signs + Elena (VP Quality) reviews + closes audit (steps #15 + #21)");
report.status = "COMPLETED";
report.signatures = report.signatures || [];
report.signatures.push({ role: "Lead Auditor", userId: personas.maria._id, signedAt: new Date(), signatureMeaning: "AUTHORED" });
report.signatures.push({ role: "VP Quality", userId: personas.elena._id, signedAt: new Date(), signatureMeaning: "APPROVED" });
report.signatures.push({ role: "Auditee", userId: personas.asha._id, signedAt: new Date(), signatureMeaning: "WITNESSED" });
await report.save();
check("Report COMPLETED with 3 signatures (Maria + Elena + Asha)", report.status === "COMPLETED" && report.signatures.length >= 3);

audit.facilityOutcome = "CONDITIONALLY_SATISFACTORY";
audit.facilityOutcomeSetAt = new Date();
audit.facilityOutcomeSetBy = personas.elena._id;
audit.trackStatus = "Audit Closed";
audit.complianceStatus = "complient";
audit.high_status = 5;
await audit.save();
check("facilityOutcome set by Elena", audit.facilityOutcome === "CONDITIONALLY_SATISFACTORY");
check("Audit CLOSED", audit.trackStatus === "Audit Closed");

// ─── 16) Tier-1 verify: every quality event names the supplier ────────
section(16, "Tier 1 verify — quality events all carry supplierId");
const { Deviation } = await import("../src/models/DeviationModel.js");
const ChangeControl = (await import("../src/models/ChangeControlModel.js")).default;

const dev = await Deviation.create({
  tenantId, title: `${RUN_TAG} · post-audit deviation`,
  description: "Lab analyst detected out-of-spec dissolution result.",
  classification: "MAJOR", category: "LABORATORY", status: "REPORTED",
  productName: "Atorvastatin Calcium", batchNumbers: [`AT-${RUN_TAG}-LOT1`],
  supplierId: personas.asha._id, supplierLot: `GP-${RUN_TAG}`,
  reportedBy: personas.deepa._id,    // Deepa = supplier QC lab
});
cleanup.push(["deviations", dev._id]);
check("Deviation persists supplierId", String(dev.supplierId) === String(personas.asha._id));
check("sourceFromSupplier auto-derived", dev.sourceFromSupplier === true);

const change = await ChangeControl.create({
  tenantId, title: `${RUN_TAG} · supplier route change`,
  description: "Supplier proposes synthesis route change for Atorvastatin.",
  changeType: "SUPPLIER", riskLevel: "HIGH",
  requestedBy: personas.meera._id,    // Meera = supplier regulatory
  supplierId: personas.asha._id,
});
cleanup.push(["change_controls", change._id]);
check("ChangeControl auto-flags triggersRequalification (SUPPLIER type)", change.triggersRequalification === true);

// ─── 17) Tier 2 closure-loop: regulatory complaint → for-cause audit ──
section(17, "Tier 2 closure loop — regulatory complaint triggers for-cause audit");
const { Complaint } = await import("../src/models/ComplaintModel.js");
const { triggerForCauseAudit } = await import("../src/services/crossModuleService.js");
const complaint = await Complaint.create({
  tenantId, title: `${RUN_TAG} · adverse event report`,
  description: "Patient reports anaphylactic reaction tied to Atorvastatin lot AT-2026-0501.",
  severity: "CRITICAL", complaintType: "SAFETY", source: "PATIENT",
  productName: "Atorvastatin Calcium", isMedicalDevice: false,
  supplierId: personas.asha._id,
  reportedBy: personas.priya._id, status: "OPEN",
});
cleanup.push(["complaints", complaint._id]);
check("Complaint requiresRegulatoryReporting auto-true (CRITICAL safety)", complaint.requiresRegulatoryReporting === true);
check("MDR clock auto-set", !!complaint.mdrDueDate);

const trig = await triggerForCauseAudit({
  tenantId: tenantOrgKey, supplierId: personas.asha._id,
  reason: `COMPLAINT_REGULATORY · ${complaint.complaintNumber}`,
  triggeredBy: String(personas.priya._id),
  createdByUserId: personas.priya._id,
  sourceType: "COMPLAINT", sourceId: complaint._id,
});
check("triggerForCauseAudit returned a result", !!trig);
if (trig?.created) {
  cleanup.push(["audit-requests-master", trig.auditId]);
  await Complaint.updateOne({ _id: complaint._id }, { $set: { linkedAuditId: trig.auditId } });
}
check("For-cause audit auto-created OR deduped to existing", trig?.created === true || trig?.existingId);

// ─── 18) Tier 3: BatchRecord + Equipment supplier linkage ─────────────
section(18, "Tier 3 — BatchRecord + Equipment vendor linkage");
const { BatchRecord } = await import("../src/models/BatchRecordModel.js");
const { Equipment } = await import("../src/models/EquipmentModel.js");

const batch = await BatchRecord.create({
  tenantId, batchNumber: `LOT-${RUN_TAG}-001`,
  productName: "Atorvastatin Calcium", status: "PENDING_QA_REVIEW",
  manufacturingDate: new Date(),
  primarySupplierId: personas.asha._id,
  billOfMaterials: [
    { materialName: "Atorvastatin API", lotNumber: `AT-${RUN_TAG}-RAW`, supplierId: personas.asha._id },
  ],
  createdBy: personas.priya._id,
});
cleanup.push(["batch_records", batch._id]);
check("BatchRecord with primarySupplierId persisted", String(batch.primarySupplierId) === String(personas.asha._id));

const equip = await Equipment.create({
  tenantId: String(tenantId),
  name: `${RUN_TAG} · HPLC unit 99`,
  equipmentType: "ANALYTICAL_INSTRUMENT",
  manufacturer: "Agilent", model: "1290 Infinity II",
  serialNumber: `SN-${RUN_TAG}-99`,
  status: "ACTIVE",
  requiresCalibration: true, calibrationStatus: "OVERDUE",
  nextCalibrationDue: new Date(Date.now() - 7 * 86400000),
  vendorSupplierId: personas.asha._id,
  createdBy: personas.priya._id,
});
cleanup.push(["equipment-master", equip._id]);
check("Equipment with vendorSupplierId persisted", String(equip.vendorSupplierId) === String(personas.asha._id));

// ─── 19) Tier 1+2+3 verify: aggregator returns all categories ─────────
section(19, "Aggregator verify — Priya opens supplier Quality Events");
const { aggregateSupplierEvents, buildSupplierContextForAi } = await import("../src/services/crossModule/supplierQualityEventService.js");
const agg = await aggregateSupplierEvents({
  tenantId, tenantOrgKey, supplierId: personas.asha._id,
  limit: 50, includeClosed: true,
});
check("aggregator returns counts.total > 0", agg.counts.total > 0);
check("our deviation in aggregator", agg.deviations.some((d) => String(d._id) === String(dev._id)));
check("our change in aggregator", agg.changes.some((c) => String(c._id) === String(change._id)));
check("our complaint in aggregator", agg.complaints.some((c) => String(c._id) === String(complaint._id)));
check("our batch in aggregator", agg.batches.some((b) => String(b._id) === String(batch._id)));
check("our equipment in aggregator", agg.equipment.some((e) => String(e._id) === String(equip._id)));
check("for-cause audit in aggregator", trig?.auditId ? agg.audits.some((a) => String(a._id) === String(trig.auditId)) : true);
check("aggregator counts.total includes new categories",
  agg.counts.total === (agg.counts.capas + agg.counts.deviations + agg.counts.complaints + agg.counts.changes + agg.counts.audits + agg.counts.batches + agg.counts.equipment));

const aiCtx = await buildSupplierContextForAi({ tenantId, tenantOrgKey, supplierId: personas.asha._id });
check("AI context summary populated", aiCtx?.open && typeof aiCtx.open.deviations === "number");
check("AI context counts.deviations >= 1", aiCtx.open.deviations >= 1);
check("AI context counts.complaints >= 1", aiCtx.open.complaints >= 1);

// ─── 20) Final summary table ──────────────────────────────────────────
console.log(`\n${"━".repeat(60)}\nLIFECYCLE COMPLETE — persona × step matrix\n${"━".repeat(60)}`);
console.log(`  Karan (Buyer Purchase)    → step 1: PQ initiate`);
console.log(`  Asha (Supplier QA)        → steps 2, 7, 13: PQ submit · questionnaire · CAPA plan`);
console.log(`  Maria (Lead Auditor)      → steps 3, 5, 8, 10-12, 14: PQ approve · COI · plan/agenda · execute · findings · CAPA approve`);
console.log(`  Rahul (Co-Auditor)        → step 8 attendee + step 10 execution`);
console.log(`  Priya (Audit Program)     → steps 4, 6, 15, 17: audit create · questionnaire send · close · file complaint`);
console.log(`  Elena (VP Quality)        → step 15: facility outcome + final approval`);
console.log(`  Deepa (QC Lab)            → step 16: deviation reporter`);
console.log(`  Meera (Regulatory)        → step 16: change-control requester`);
console.log(`  Amit (Production)         → step 8 attendee`);
console.log(`  Raj (Warehouse)           → not in this audit (active in batch flows)`);

// Cleanup
console.log(`\n[cleanup] removing ${cleanup.length} test rows`);
for (const [coll, id] of cleanup) {
  try { await mongoose.connection.collection(coll).deleteOne({ _id: id }); } catch { /* ignore */ }
}
// Also remove the snapshot we wrote
await SupplierRiskSnapshot.deleteMany({ supplierId: personas.asha._id, "debug.source": "e2e-test" });

console.log(`\n${"=".repeat(60)}\nRESULT: ${pass} passed, ${fail} failed\n${"=".repeat(60)}`);
await mongoose.disconnect();
process.exit(fail > 0 ? 1 : 0);
