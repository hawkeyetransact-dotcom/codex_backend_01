/**
 * Equipment / Calibration — Feature Guide spec.
 */
export default {
  version: "1.1",
  moduleName: "Equipment / Calibration",
  moduleFlag: "modules.ASSET_MANAGEMENT",
  modelFile: "backend/src/models/EquipmentModel.js",
  routes: ["/asset-management (frontend)", "/api/equipment (backend)"],
  purpose: "Track every GMP-relevant asset through its calibration lifecycle. Auto-escalate OVERDUE items. Failed calibrations trigger QUARANTINED status so the asset is blocked from production use.",
  compliance: "ISO 9001:2015 §7.1.5 (monitoring & measuring resources) · 21 CFR 211.68(b) (equipment qualification) · ICH Q7 §5.3",
  overviewBody:
    "Equipment moves ACTIVE ↔ UNDER_CALIBRATION ↔ INACTIVE / OUT_OF_SERVICE / QUARANTINED → RETIRED. " +
    "Each calibration event captures performedBy + performedAt + result (PASS/CONDITIONAL/FAIL) + certificateRef + nextDueDays. " +
    "FAIL → calibrationStatus=OVERDUE + status=QUARANTINED automatically.",

  comparison: [
    { expectation: "Auto-numbered equipment (EQ-YYYY-NNNN)", standard: "GMP traceability", hawkeye: "equipmentNumber pre-save generator.", outcome: "met" },
    { expectation: "Equipment types (ANALYTICAL_INSTRUMENT / PRODUCTION_EQUIPMENT / UTILITY / MEASURING_DEVICE / IT_SYSTEM / OTHER)", standard: "—", hawkeye: "equipmentType enum.", outcome: "met" },
    { expectation: "Calibration frequency in days + next-due tracking", standard: "21 CFR 211.68(b)", hawkeye: "calibrationFrequencyDays (default 365) + nextCalibrationDue computed from last calibration.", outcome: "met" },
    { expectation: "Calibration history (all events)", standard: "21 CFR 211.68(b)", hawkeye: "calibrationHistory[] subdocument with date / performedBy / result / certificateRef.", outcome: "met" },
    { expectation: "Status enum: ACTIVE / INACTIVE / UNDER_CALIBRATION / OUT_OF_SERVICE / RETIRED / QUARANTINED", standard: "—", hawkeye: "All 6 supported.", outcome: "met" },
    { expectation: "calibrationStatus enum: CURRENT / DUE_SOON / OVERDUE / NOT_REQUIRED", standard: "—", hawkeye: "All 4 supported. Auto-derived from result + nextDue.", outcome: "met" },
    { expectation: "Failed calibration auto-quarantines + blocks production use", standard: "21 CFR 211.68(b)", hawkeye: "Calibration result=FAIL → calibrationStatus=OVERDUE + status=QUARANTINED.", outcome: "met" },
    { expectation: "OVERDUE alert when calibration past due", standard: "ICH Q7 §5.3", hawkeye: "Vercel cron (03:00 UTC daily) calls /api/quality/scan-overdue → auto-flips calibrationStatus to OVERDUE on assets past nextCalibrationDue + writes notification-outbox rows. UI badge shows.", outcome: "met" },
    { expectation: "Soft-retire (RETIRED) with decommissionedAt", standard: "—", hawkeye: "DELETE /:id sets status=RETIRED + decommissionedAt; record retained.", outcome: "met" },
    { expectation: "Linked to batch records (equipmentUsed[])", standard: "21 CFR 211.188(b)(7)", hawkeye: "Cross-referenced via batch-records.equipmentUsed[].equipmentId.", outcome: "met" },
  ],

  personas: [
    { name: "Lars Nilsson", role: "Maintenance Engineer (admin)", email: "maintenance@novex-pharma.demo",
      responsibilities: "Adds equipment, performs + records calibrations, transitions status, retires assets.",
      touches: ["ACTIVE", "UNDER_CALIBRATION", "OUT_OF_SERVICE", "RETIRED"] },
    { name: "James Thompson", role: "Head of QA (admin · approver)", email: "qa.head@novex-pharma.demo",
      responsibilities: "Reviews QUARANTINED assets, signs return-to-service after re-calibration.", touches: ["QUARANTINED", "ACTIVE (return)"] },
    { name: "Aisha Patel", role: "QC Lab Lead (admin)", email: "qc.lab@novex-pharma.demo",
      responsibilities: "Owns analytical instruments; performs calibrations on HPLCs, balances.", touches: ["ACTIVE", "UNDER_CALIBRATION"] },
  ],

  features: [
    { name: "Equipment register",
      what: "Lists every asset with type / status / calibrationStatus / nextCalibrationDue.",
      location: "/asset-management",
      roles: ["any tenant viewer"],
      api: "GET /api/equipment",
      steps: [
        { kind: "navigate", label: "Click 'Equipment' in the top nav", expect: "Page renders" },
        { kind: "wait", label: "Spinner clears", expect: "Rows visible" },
      ],
      screenshot: "state-screens/equipment-list.png" },

    { name: "+ Add Equipment dialog",
      what: "Capture a new asset.",
      location: "/asset-management · top-right '+ Add Equipment'",
      roles: ["maintenance · admin"],
      api: "POST /api/equipment",
      steps: [
        { kind: "click", label: "Click '+ Add Equipment'", expect: "Dialog opens" },
        { kind: "type", label: "Fill name", expect: "required" },
        { kind: "click", label: "Pick equipmentType", expect: "6 enums" },
        { kind: "type", label: "Fill manufacturer + model + serialNumber + assetTag", expect: "" },
        { kind: "click", label: "Tick requiresCalibration (default true)", expect: "drives nextCalibrationDue" },
        { kind: "type", label: "Fill calibrationFrequencyDays (default 365)", expect: "" },
        { kind: "click", label: "Pick owner (user dropdown)", expect: "ObjectId" },
        { kind: "click", label: "Click 'Save'", expect: "Row appears with status=ACTIVE; equipmentNumber=EQ-YYYY-NNNN" },
      ],
      fields: [
        { name: "name", required: true, values: "string" },
        { name: "equipmentType", required: false, values: "ANALYTICAL_INSTRUMENT | PRODUCTION_EQUIPMENT | UTILITY | MEASURING_DEVICE | IT_SYSTEM | OTHER", note: "default MEASURING_DEVICE" },
        { name: "model", required: false, values: "string" },
        { name: "manufacturer", required: false, values: "string" },
        { name: "requiresCalibration", required: false, values: "boolean", note: "default true" },
        { name: "calibrationFrequencyDays", required: false, values: "number", note: "default 365" },
        { name: "ownerId", required: false, values: "ObjectId" },
      ] },

    { name: "Begin calibration (ACTIVE → UNDER_CALIBRATION)",
      what: "Mark asset as under calibration.",
      location: "Equipment row · 'Begin Calibration' button",
      roles: ["maintenance"],
      api: "PUT /api/equipment/:id (status=UNDER_CALIBRATION)",
      steps: [{ kind: "click", label: "Click 'Begin Calibration'", expect: "Status flips" }] },

    { name: "Record calibration",
      what: "Capture a calibration event with result + certificate.",
      location: "Equipment row · 'Record Calibration' button",
      roles: ["maintenance"],
      api: "POST /api/equipment/:id/calibration",
      steps: [
        { kind: "click", label: "Click 'Record Calibration'", expect: "Drawer opens" },
        { kind: "click", label: "Pick performedAt + performedBy", expect: "required" },
        { kind: "click", label: "Pick result (PASS / CONDITIONAL / FAIL)", expect: "drives next state" },
        { kind: "type", label: "Fill certificateRef (S3 path or external URL)", expect: "required" },
        { kind: "type", label: "(Optional) override nextDueDays (else uses frequency)", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Calibration appended to history; calibrationStatus auto-set; PASS → CURRENT; CONDITIONAL → DUE_SOON; FAIL → OVERDUE + status=QUARANTINED" },
      ] },

    { name: "Return to service",
      what: "Move QUARANTINED / OUT_OF_SERVICE → ACTIVE after a successful re-calibration.",
      location: "Equipment row · 'Return to Service' button",
      roles: ["maintenance + QA approval"],
      api: "PUT /api/equipment/:id (status=ACTIVE)",
      steps: [
        { kind: "click", label: "Confirm latest calibration result=PASS", expect: "QA signs off" },
        { kind: "click", label: "Click 'Return to Service'", expect: "Status=ACTIVE" },
      ] },

    { name: "Retire (soft-delete)",
      what: "Decommission an asset. Status=RETIRED + decommissionedAt set.",
      location: "Equipment row · 'Retire' button",
      roles: ["admin · tenant_admin"],
      api: "DELETE /api/equipment/:id",
      steps: [
        { kind: "click", label: "Click 'Retire'", expect: "Confirmation dialog" },
        { kind: "click", label: "Confirm", expect: "Status=RETIRED · decommissionedAt set · row remains visible (read-only)" },
      ] },
  ],

  lifecycleIntro: "One HPLC walked from Add → Calibrate (PASS) → Return to service → Retire.",
  lifecycle: [
    { step: 1, persona: "Lars", role: "Maintenance Eng", fromState: "—", toState: "ACTIVE",
      action: "+ Add Equipment → name='HPLC E2E', type=ANALYTICAL_INSTRUMENT, model=Agilent 1260, calibrationFrequencyDays=180",
      api: "POST /api/equipment",
      observed: "equipmentNumber=EQ-YYYY-NNNN · status=ACTIVE", outcome: "pass",
      expectedDb: "equipment { _id, equipmentNumber, name, equipmentType: 'ANALYTICAL_INSTRUMENT', model, calibrationFrequencyDays: 180, status: 'ACTIVE', calibrationStatus: 'NOT_REQUIRED' (until first cal) }",
      screenshot: "state-screens/equipment-list.png" },
    { step: 2, persona: "Lars", role: "Maintenance Eng", fromState: "ACTIVE", toState: "UNDER_CALIBRATION",
      action: "PUT status=UNDER_CALIBRATION", api: "PUT /api/equipment/:id", observed: "Status flips", outcome: "pass" },
    { step: 3, persona: "Lars", role: "Maintenance Eng", fromState: "UNDER_CALIBRATION", toState: "ACTIVE (CURRENT)",
      action: "POST calibration with result=PASS, certificateRef='CAL-E2E-001', nextDueDays=180",
      api: "POST /api/equipment/:id/calibration",
      observed: "calibrationStatus=CURRENT · calibrationHistory[] += entry · nextCalibrationDue=+180d", outcome: "pass",
      expectedDb: "equipment.calibrationHistory += { performedAt, performedBy, result: 'PASS', certificateRef, nextDueDays: 180 }; calibrationStatus = 'CURRENT'; lastCalibrationDate; nextCalibrationDue" },
    { step: 4, persona: "Lars", role: "Maintenance Eng", fromState: "ACTIVE", toState: "ACTIVE (returned)",
      action: "PUT status=ACTIVE (confirm return-to-service)", api: "PUT /api/equipment/:id", observed: "Status=ACTIVE (no change)", outcome: "pass" },
    { step: 5, persona: "Lars", role: "Maintenance Eng", fromState: "ACTIVE", toState: "RETIRED",
      action: "DELETE /api/equipment/:id (soft-delete)", api: "DELETE /api/equipment/:id",
      observed: "status=RETIRED · decommissionedAt set", outcome: "pass",
      expectedDb: "equipment { status: 'RETIRED', decommissionedAt: <now> }" },
  ],

  aiAssists: [
    { name: "(roadmap) Predictive calibration (Wave 3)", attachedToStates: ["ACTIVE", "UNDER_CALIBRATION"], endpoint: "(future)", where: "Equipment detail badge", what: "Predict P(failure) at next calibration from historical trend + usage hours + ambient conditions", provider: "Statistical / ML" },
    { name: "(roadmap) AI calibration record review", attachedToStates: ["UNDER_CALIBRATION → ACTIVE"], endpoint: "(future)", where: "Calibration drawer", what: "Auto-extract values from uploaded certificate (PDF) + flag anomalies", provider: "Free Gemini Vision" },
  ],

  regulatorTrace: [
    { state: "ACTIVE (CURRENT)", citations: ["21 CFR 211.68(b)", "ISO 9001 §7.1.5.2"], evidence: "lastCalibrationDate + nextCalibrationDue + certificateRef + performedBy", records: "equipment + equipment.calibrationHistory" },
    { state: "UNDER_CALIBRATION", citations: ["21 CFR 211.68(b)"], evidence: "Status transition recorded with timestamp", records: "equipment + auditTrail" },
    { state: "QUARANTINED (FAIL)", citations: ["21 CFR 211.68(b)", "21 CFR 211.63"], evidence: "Failed calibration record + auto-block from production use", records: "equipment.calibrationHistory + (downstream batch checks)" },
    { state: "RETIRED", citations: ["21 CFR 211.68(b)"], evidence: "decommissionedAt + retention of full calibration history", records: "equipment (soft-deleted)" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · equipment", scope: "ACTIVE → UNDER_CALIBRATION → calibration PASS → ACTIVE → RETIRED", outcome: "pass", evidence: "5/5 PASS · eqms-test-results-v2.pdf" },
  ],

  roadmap: [
    { title: "OVERDUE / DUE_SOON notification scheduler", note: "Cron scans nextCalibrationDue; when within 30 days → DUE_SOON notification; when past → OVERDUE + email + Slack.", priority: "HIGH" },
    { title: "Auto-block from batch records when calibrationStatus != CURRENT", note: "Batch creation should reject equipmentUsed[] entries pointing to QUARANTINED or OVERDUE assets.", priority: "HIGH" },
    { title: "Predictive calibration (Wave 3 ML)", note: "P(failure) at next cal based on history + usage.", priority: "MEDIUM" },
    { title: "AI cert-extraction on calibration upload", note: "Free Gemini Vision extracts values from cert PDF.", priority: "LOW" },
  ],
};
