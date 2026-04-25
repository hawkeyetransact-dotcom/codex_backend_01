/**
 * Batch / Manufacturing Records — Feature Guide spec.
 */
export default {
  version: "1.0",
  moduleName: "Batch / Manufacturing Records",
  moduleFlag: "modules.BATCH_RECORDS",
  modelFile: "backend/src/models/BatchRecordModel.js",
  routes: ["/batch-records (frontend)", "/api/batch-records (backend)"],
  purpose: "Capture the full manufacturing record for a single batch — BOM actuals, in-process tests, yield, equipment used, linked deviations — then drive QA review to final disposition (release / reject / quarantine).",
  compliance: "21 CFR 211.188 (batch production records) · 21 CFR 211.192 (production record review) · EU GMP Annex 11 (electronic batch records) · ICH Q7 §6.5",
  overviewBody:
    "Batches move MANUFACTURING → UNDER_REVIEW / PENDING_LAB_RESULTS / PENDING_QA_REVIEW → PENDING_DEVIATION_CLOSURE / PENDING_DISPOSITION → RELEASED / REJECTED / QUARANTINED. " +
    "Operator captures BOM actuals + in-process tests + yields. QA reviews. VP disposes. Open deviations block release.",

  comparison: [
    { expectation: "Bill of Materials with theoretical vs actual qty", standard: "21 CFR 211.188(b)(2)", hawkeye: "billOfMaterials[] subdocument with theoreticalQty + actualQty + supplierId + lot.", outcome: "met" },
    { expectation: "In-process tests with spec + result + tester + timestamp", standard: "21 CFR 211.110", hawkeye: "inProcessTests[] subdocument: testName + spec + result (PASS/FAIL/null) + testedBy + testedAt + unit.", outcome: "met" },
    { expectation: "Yield tracking per stage with within-spec flag", standard: "21 CFR 211.103", hawkeye: "yieldRecords[] subdocument with stage + percent + withinSpec.", outcome: "met" },
    { expectation: "Equipment used (linked to Equipment module)", standard: "21 CFR 211.188(b)(7)", hawkeye: "equipmentUsed[] subdocument with equipmentId + start/end times.", outcome: "met" },
    { expectation: "Linked deviations gate release", standard: "21 CFR 211.192", hawkeye: "linkedDeviationIds[] checked at /qa-review; if any not closed → status=PENDING_DEVIATION_CLOSURE.", outcome: "met" },
    { expectation: "QA review must complete before VP disposition", standard: "21 CFR 211.192", hawkeye: "qa-review endpoint required before dispose. qaReviewedBy + qaReviewedAt + qaReviewNotes.", outcome: "met" },
    { expectation: "VP disposition: RELEASED / REJECTED / REWORK / REPROCESS / QUARANTINED", standard: "21 CFR 211.165", hawkeye: "/dispose endpoint with decision enum.", outcome: "met" },
    { expectation: "Auto-set releaseDate on RELEASE decision", standard: "21 CFR 211.165(d)", hawkeye: "releaseDate auto-set when disposition=RELEASED.", outcome: "met" },
    { expectation: "Lab results complete check before disposition", standard: "21 CFR 211.192", hawkeye: "labResultsComplete boolean; if false → status=PENDING_LAB_RESULTS.", outcome: "met" },
    { expectation: "Stability sample assignment", standard: "21 CFR 211.166", hawkeye: "Field exists; manual assignment.", outcome: "partial", note: "Auto-assign retained samples on release" },
    { expectation: "21 CFR Part 11 e-signature on release", standard: "21 CFR Part 11", hawkeye: "Generic e-sig endpoint exists; not enforced on /dispose.", outcome: "partial", note: "Wire e-sig requirement on RELEASE/REJECT" },
  ],

  personas: [
    { name: "Michael Foster", role: "Production Head (admin · operator)", email: "production.head@novex-pharma.demo",
      responsibilities: "Creates batch record, captures BOM + tests + yields, submits for review.", touches: ["MANUFACTURING", "UNDER_REVIEW"] },
    { name: "Aisha Patel", role: "QC Lab Lead (admin)", email: "qc.lab@novex-pharma.demo",
      responsibilities: "Completes lab analytical tests, marks labResultsComplete.", touches: ["PENDING_LAB_RESULTS"] },
    { name: "James Thompson", role: "Head of QA (admin · reviewer)", email: "qa.head@novex-pharma.demo",
      responsibilities: "Reviews batch record, verifies deviation closure, advances to disposition.", touches: ["PENDING_QA_REVIEW", "PENDING_DEVIATION_CLOSURE"] },
    { name: "Elena Vasquez", role: "VP Quality (tenant_admin · disposer)", email: "vp.quality@novex-pharma.demo",
      responsibilities: "Final disposition: RELEASE / REJECT / QUARANTINE.", touches: ["PENDING_DISPOSITION", "RELEASED", "REJECTED", "QUARANTINED"] },
  ],

  features: [
    { name: "Batch register",
      what: "Lists all batches with status chip + product + batchNumber + manufacturingDate.",
      location: "/batch-records", roles: ["any tenant viewer"], api: "GET /api/batch-records",
      steps: [
        { kind: "navigate", label: "Click 'Batches' in the top nav", expect: "Page renders" },
        { kind: "wait", label: "Spinner clears", expect: "Rows visible" },
      ],
      screenshot: "state-screens/batch-records-list.png" },

    { name: "+ Create Batch dialog",
      what: "Operator creates a new batch in MANUFACTURING state.",
      location: "/batch-records · top-right '+ Create Batch' button",
      roles: ["operator · admin"],
      api: "POST /api/batch-records",
      steps: [
        { kind: "click", label: "Click '+ Create Batch'", expect: "Dialog opens" },
        { kind: "type", label: "Fill batchNumber (e.g. NVX-2026-B015)", expect: "required" },
        { kind: "type", label: "Fill productName", expect: "required" },
        { kind: "click", label: "Pick manufacturingDate", expect: "required" },
        { kind: "click", label: "+ Add billOfMaterials rows (materialName + theoreticalQty + actualQty + unit)", expect: "Multiple rows" },
        { kind: "click", label: "+ Add inProcessTests rows (testName + spec + result + testedBy)", expect: "Multiple rows" },
        { kind: "click", label: "Click 'Save'", expect: "Row appears with status=MANUFACTURING" },
      ],
      fields: [
        { name: "batchNumber", required: true, values: "string · user-defined" },
        { name: "productName", required: true, values: "string" },
        { name: "manufacturingDate", required: true, values: "ISO date" },
        { name: "billOfMaterials", required: false, values: "[{materialName, theoreticalQty, actualQty, unit, supplierId, lot}]" },
        { name: "inProcessTests", required: false, values: "[{testName, spec, result, testedBy, testedAt, unit}]" },
      ] },

    { name: "Submit for review",
      what: "Operator submits the batch for review. Routes to PENDING_LAB_RESULTS or PENDING_QA_REVIEW based on labResultsComplete flag.",
      location: "Batch row · 'Submit for Review' button",
      roles: ["operator"],
      api: "POST /api/batch-records/:id/submit-for-review",
      steps: [
        { kind: "click", label: "Click 'Submit for Review'", expect: "Drawer with labResultsComplete + labResultsSummary + linkedDeviationIds" },
        { kind: "click", label: "Tick labResultsComplete=true (if QC done)", expect: "drives next state" },
        { kind: "type", label: "Fill labResultsSummary", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips to PENDING_QA_REVIEW (or PENDING_LAB_RESULTS if labResultsComplete=false)" },
      ] },

    { name: "QA review",
      what: "QA reviews the batch record + verifies deviation closure + advances to disposition.",
      location: "Batch row · 'QA Review' button (visible to QA role)",
      roles: ["QA · admin"],
      api: "POST /api/batch-records/:id/qa-review",
      steps: [
        { kind: "click", label: "Click 'QA Review'", expect: "Drawer with qaReviewNotes + deviationsResolved + labResultsComplete checks" },
        { kind: "type", label: "Fill qaReviewNotes", expect: "required" },
        { kind: "click", label: "Tick deviationsResolved + labResultsComplete (both must be true)", expect: "if either false → status=PENDING_*" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips to PENDING_DISPOSITION (when both checks pass)" },
      ] },

    { name: "Dispose (VP)",
      what: "Final disposition. RELEASED auto-sets releaseDate.",
      location: "Batch row · 'Dispose' button (visible to VP / tenant_admin)",
      roles: ["VP · tenant_admin"],
      api: "POST /api/batch-records/:id/dispose",
      steps: [
        { kind: "click", label: "Click 'Dispose'", expect: "Drawer with decision picker" },
        { kind: "click", label: "Pick decision (RELEASED / REJECTED / REWORK / REPROCESS / QUARANTINED)", expect: "required" },
        { kind: "type", label: "Fill justification", expect: "required" },
        { kind: "click", label: "(Optional) e-sig", expect: "" },
        { kind: "click", label: "Click 'Confirm + Sign'", expect: "Status flips; releaseDate auto-set if RELEASED" },
      ] },
  ],

  lifecycleIntro: "One batch walked from manufacturing through QA review to RELEASE. Personas: Michael (operator) → James (QA) → Elena (VP).",
  lifecycle: [
    { step: 1, persona: "Michael", role: "Production Head", fromState: "—", toState: "MANUFACTURING",
      action: "+ Create Batch → batchNumber NVX-E2E-NNN / Novexolimus 1mg / today / BOM (Novexolimus API + Lactose) / inProcessTests (Blend uniformity PASS, Compression force PASS)",
      api: "POST /api/batch-records",
      observed: "Row visible · status=MANUFACTURING", outcome: "pass",
      expectedDb: "batch-records { _id, batchNumber, productName, manufacturingDate, billOfMaterials: [...], inProcessTests: [...], status: 'MANUFACTURING', createdBy: michael._id }",
      screenshot: "state-screens/batch-records-list.png" },
    { step: 2, persona: "Michael", role: "Operator", fromState: "MANUFACTURING", toState: "PENDING_QA_REVIEW",
      action: "Submit for review · labResultsComplete=true · linkedDeviationIds=[]",
      api: "POST /api/batch-records/:id/submit-for-review",
      observed: "Status=PENDING_QA_REVIEW (lab complete + no deviations)", outcome: "pass",
      expectedDb: "batch-records { status: 'PENDING_QA_REVIEW', labResultsComplete: true, labResultsSummary }" },
    { step: 3, persona: "James", role: "Head of QA", fromState: "PENDING_QA_REVIEW", toState: "PENDING_DISPOSITION",
      action: "QA Review · qaReviewNotes · deviationsResolved=true · labResultsComplete=true",
      api: "POST /api/batch-records/:id/qa-review",
      observed: "Status=PENDING_DISPOSITION", outcome: "pass",
      expectedDb: "batch-records { status: 'PENDING_DISPOSITION', qaReviewedBy: james._id, qaReviewedAt, qaReviewNotes }" },
    { step: 4, persona: "Elena", role: "VP Quality", fromState: "PENDING_DISPOSITION", toState: "RELEASED",
      action: "Dispose · decision=RELEASED · justification 'all release criteria met per SOP-QC-014'",
      api: "POST /api/batch-records/:id/dispose",
      observed: "Status=RELEASED · releaseDate auto-set", outcome: "pass",
      expectedDb: "batch-records { status: 'RELEASED', disposition: { decision: 'RELEASED', justification, decidedBy: elena._id }, releaseDate: <now> }" },
  ],

  aiAssists: [
    { name: "(roadmap) Yield anomaly detector (Wave 3)", attachedToStates: ["MANUFACTURING", "UNDER_REVIEW"], endpoint: "(future)", where: "(future)", what: "Compare current yield + in-process trends vs historical → flag outliers for QA", provider: "Statistical (no LLM)" },
    { name: "(roadmap) AI batch-record review assistant", attachedToStates: ["PENDING_QA_REVIEW"], endpoint: "(future)", where: "(future)", what: "AI scans the BR for missing entries / out-of-spec results / spec-drift across batches", provider: "Free Gemini" },
  ],

  regulatorTrace: [
    { state: "MANUFACTURING", citations: ["21 CFR 211.188(b)"], evidence: "batchNumber + productName + manufacturingDate + BOM + inProcessTests + equipmentUsed", records: "batch-records" },
    { state: "PENDING_QA_REVIEW", citations: ["21 CFR 211.192"], evidence: "labResultsComplete=true + labResultsSummary", records: "batch-records" },
    { state: "PENDING_DISPOSITION", citations: ["21 CFR 211.192"], evidence: "qaReviewedBy + qaReviewedAt + qaReviewNotes + deviationsResolved=true", records: "batch-records" },
    { state: "RELEASED", citations: ["21 CFR 211.165(d)", "21 CFR Part 11 §11.50"], evidence: "disposition.decision + justification + decidedBy + releaseDate + (e-sig)", records: "batch-records + (electronic-signatures)" },
    { state: "REJECTED", citations: ["21 CFR 211.165(f)"], evidence: "disposition.decision + justification", records: "batch-records" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · batch-record", scope: "MANUFACTURING → PENDING_QA_REVIEW → PENDING_DISPOSITION → RELEASED", outcome: "pass", evidence: "5/5 PASS · eqms-test-results-v2.pdf" },
  ],

  roadmap: [
    { title: "Mandatory e-sig on RELEASE / REJECT", note: "Wire /api/electronic-signatures/sign on /dispose. Captures meaning='RELEASED' or 'REJECTED'.", priority: "HIGH" },
    { title: "Stability sample auto-assignment on RELEASE", note: "Auto-create retained sample record + scheduling per stability protocol.", priority: "HIGH" },
    { title: "AI yield anomaly detector", note: "Wave 3 statistical detector flags yields outside ±2σ of last 30 batches.", priority: "MEDIUM" },
    { title: "Cross-link to deviation drawer", note: "linkedDeviationIds clickable chips on batch detail.", priority: "MEDIUM" },
  ],
};
