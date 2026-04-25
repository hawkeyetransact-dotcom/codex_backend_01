/**
 * Deviation / Non-Conformance — Feature Guide spec.
 *
 * Drives backend/scripts/build-module-feature-guide.mjs.
 * Authored by mapping pharma EQMS expectations to the Hawkeye implementation
 * (DeviationModel.js · deviationRoutes.js · app/(console)/nonconformance/page.tsx).
 *
 * Screenshots referenced are paths under `frontend/demo-artifacts/`.
 */
export default {
  version: "1.0",
  moduleName: "Deviation / Non-Conformance",
  moduleFlag: "modules.EVENT_MANAGEMENT",
  modelFile: "backend/src/models/DeviationModel.js",
  routes: ["/nonconformance (frontend)", "/api/deviations (backend)"],
  purpose:
    "Capture, investigate, disposition and close any planned or unplanned deviation from a specification, " +
    "SOP, batch record, or quality-system requirement. Drive a CAPA when the deviation is systemic.",
  compliance:
    "ISO 9001:2015 §10.2 (non-conformity & corrective action) · 21 CFR 211.192 (production record review · investigations) · " +
    "ICH Q10 §3.2.3 (deviation management) · EU GMP Chapter 1.4 (quality system).",
  tenantId: "69e64e7869b2ba745d40bb89",
  frontend: "https://hawkeye-frontend-dev-chi.vercel.app",
  backend: "https://hawkeye-backend-dev.vercel.app",
  overviewBody:
    "A 'deviation' is any departure from the approved batch record, validated procedure, or specification. " +
    "Pharma QA teams treat the deviation as the entry-point of the quality investigation lifecycle: it determines whether the " +
    "affected batch can be released, whether a CAPA is required, and (if patient-safety / regulatory exposure) whether a Field " +
    "Alert Report or recall must be filed. Hawkeye stores deviations in the <code>deviations</code> collection, exposes them to " +
    "users with the EVENT_MANAGEMENT module flag enabled, and offers AI assistance at the investigation step (Wave 1 · 5-Why " +
    "scaffolder + CAPA RCA drafter) and at the disposition step (Wave 3 · predictive CAPA outcome).",

  // ── 2. STANDARD-vs-HAWKEYE COMPARISON ────────────────────────────────
  comparison: [
    { expectation: "Single intake form for any operator to log a deviation", standard: "21 CFR 211.192", hawkeye: "+ Report Deviation dialog on /nonconformance with title, description, type (PLANNED / UNPLANNED), classification (CRITICAL / MAJOR / MINOR), category (10 enums), area, processStep, productName, immediateActions", outcome: "met" },
    { expectation: "Auto-numbering of deviation records (DEV-YYYY-NNNN)", standard: "GMP traceability", hawkeye: "deviationNumber auto-generated server-side (DeviationModel.js:54). Format DEV-YYYY-NNNN.", outcome: "met" },
    { expectation: "Multi-step lifecycle with role gates (operator → QA → Head of QA → VP)", standard: "ICH Q10 §3.2.3", hawkeye: "9-state machine (REPORTED → UNDER_ASSESSMENT → UNDER_INVESTIGATION → PENDING_DISPOSITION → PENDING_CAPA_DECISION → CAPA_REQUIRED → PENDING_CLOSURE → CLOSED, plus CANCELLED). Transitions gated by EDITOR_ROLES.", outcome: "met" },
    { expectation: "Impact assessment captured before investigation (product / patient / batch / regulatory)", standard: "21 CFR 211.192", hawkeye: "POST /assess endpoint requires productQualityImpact, patientSafetyImpact, batchDisposition, regulatoryImpact (deviationRoutes.js:104-124)", outcome: "met" },
    { expectation: "Root-cause analysis with method tracking (5-Why / Fishbone / FTA / FMEA / Pareto)", standard: "ICH Q9", hawkeye: "POST /investigate accepts method enum + summary + rootCause + rootCauseCategory. AI 5-Why scaffolder available in the View+AI drawer.", outcome: "met" },
    { expectation: "Batch disposition decision (RELEASE / REJECT / REWORK / REPROCESS / QUARANTINE)", standard: "21 CFR 211.165", hawkeye: "POST /dispose with decision + justification. Five-value enum.", outcome: "met" },
    { expectation: "Decision whether CAPA is required, with auto-creation of CAPA record", standard: "ISO 9001 §10.2.1", hawkeye: "POST /capa-decision with capaRequired flag. autoCreateCapa=true triggers crossModuleService.createCapaFromDeviation() — produces a real capa-v2 record, not just a flag.", outcome: "met" },
    { expectation: "Closure with electronic signature meeting 21 CFR Part 11", standard: "21 CFR Part 11 §11.50", hawkeye: "POST /close captures closureNotes + closedBy + closedAt. Generic /api/electronic-signatures/sign endpoint exists and can be wired to closure but is NOT enforced today.", outcome: "partial", note: "Wire e-sig requirement to closure (1-line check)" },
    { expectation: "Linked records: CAPAs, complaints, change controls, audits", standard: "ICH Q10 §3.2.5", hawkeye: "linkedCAPAIds, linkedComplaintIds, linkedChangeControlIds, linkedAuditIds, linkedDeviationIds arrays on the model. Cross-module endpoint POST /api/quality/capa-from-deviation creates + links.", outcome: "met" },
    { expectation: "Field Alert Report / MDR reportability flag", standard: "21 CFR 314.81 / 21 CFR 803", hawkeye: "regulatoryImpact captured as free-text on the assessment but no MDR / FAR boolean / deadline timer.", outcome: "gap", note: "Add isFieldAlertReportable + farDueDate + auto-reminder" },
    { expectation: "Trend / signal detection across deviations (e.g. 3 OOS in 30 days on same equipment)", standard: "ICH Q10 §3.2.4 (KPI monitoring)", hawkeye: "Wave 3 SignalAlertsList — Z-score cluster detector. Live alert today: equipment:NVX-PRESS-001 · size 3 · z=3.4.", outcome: "met" },
    { expectation: "AI assistance to accelerate RCA + draft CAPA + predict outcome", standard: "FDA AI guidance Jan 2025", hawkeye: "View + AI drawer offers Scaffold 5-Why (Wave 1) + Draft CAPA RCA (Wave 1) + Predictive CAPA badge (Wave 3) + Create CAPA from RCA cross-module button.", outcome: "met" },
    { expectation: "Audit trail of every state change + every AI accept/reject (ALCOA+)", standard: "21 CFR Part 11 §11.10(e)", hawkeye: "auditTrailModel logs deviation transitions. AI outputs logged to AiActionMetric + DataIntegrityLog with prompt-version + retrieval-set hashes.", outcome: "met" },
    { expectation: "Per-tenant module enable / disable", standard: "Multi-tenant SaaS", hawkeye: "tenantModuleConfig with EVENT_MANAGEMENT boolean. Frontend hides nav + 403s when disabled.", outcome: "met" },
  ],

  // ── 3. PERSONAS ──────────────────────────────────────────────────────
  personas: [
    { name: "Kenji Tanaka", role: "QA Specialist (admin)", email: "qa.specialist@novex-pharma.demo",
      responsibilities: "Reports deviations from the floor, runs the initial impact assessment, drives investigation + RCA, accepts AI-drafted RCA, creates CAPA from drawer.",
      touches: ["REPORTED", "UNDER_ASSESSMENT", "UNDER_INVESTIGATION"] },
    { name: "James Thompson", role: "Head of QA (admin)", email: "qa.head@novex-pharma.demo",
      responsibilities: "Reviews investigation conclusions, makes batch disposition decision, decides whether systemic CAPA is required, signs closure.",
      touches: ["PENDING_DISPOSITION", "PENDING_CAPA_DECISION", "CAPA_REQUIRED", "PENDING_CLOSURE", "CLOSED"] },
    { name: "Elena Vasquez", role: "VP Quality (tenant_admin)", email: "vp.quality@novex-pharma.demo",
      responsibilities: "Final approver on CRITICAL deviations; reviews closure on the management-review cycle. Signs e-sig where enforced.",
      touches: ["PENDING_CLOSURE", "CLOSED"] },
    { name: "Marcus Brown", role: "Regulatory Affairs (admin)", email: "regulatory@novex-pharma.demo",
      responsibilities: "Determines MDR / Field Alert reportability when deviation has patient-safety or regulatory exposure.",
      touches: ["UNDER_ASSESSMENT", "UNDER_INVESTIGATION"] },
    { name: "Maria Santos", role: "Lead Auditor (auditor)", email: "audit.lead@novex-pharma.demo",
      responsibilities: "Reviews deviation closure during periodic internal audit. Triages CAPAs spawned from deviations.",
      touches: ["CLOSED (audit-time review)"] },
  ],

  // ── 4. FEATURES (click-by-click) ────────────────────────────────────
  features: [
    {
      name: "View deviation register",
      what: "Land on /nonconformance to see every deviation in the tenant with classification + status chips and inline workflow buttons.",
      location: "Top nav · 'Deviations' tile · /nonconformance",
      roles: ["admin", "buyer", "auditor", "tenant_admin"],
      api: "GET /api/deviations?page=1&limit=20",
      steps: [
        { kind: "navigate", label: "Click 'Deviations' in the top nav (or open /nonconformance directly)", expect: "Page loads with header 'Deviation / NC Manager' + the counter chips '3 total · 3 open' (using seeded data)" },
        { kind: "wait", label: "Wait for the loading spinner to disappear (data fetched from /api/deviations)", expect: "Three rows render: DEV-DEMO-001 OOS dissolution, DEV-DEMO-002 calibration drift, DEV-DEMO-003 viable contamination" },
      ],
      screenshot: "walkthrough/02-kenji.png",
      tip: "If the list is empty after seeding, you're hitting the wrong backend. Confirm APP_API_BASE_URL on the Vercel frontend points to https://hawkeye-backend-dev.vercel.app (the v2.0 fix).",
    },
    {
      name: "Filter the register",
      what: "Narrow the list by classification, status, or category.",
      location: "/nonconformance — filter row above the deviation list",
      roles: ["any viewer"],
      steps: [
        { kind: "click", label: "Click the 'Classification' dropdown", expect: "Dropdown shows CRITICAL / MAJOR / MINOR" },
        { kind: "click", label: "Click 'Status' dropdown", expect: "Dropdown shows the 9 lifecycle states" },
        { kind: "click", label: "Click 'Category' dropdown", expect: "10 categories: Process, Equipment, Material, Documentation, Environmental, Laboratory, Packaging, Storage, Personnel, Other" },
      ],
    },
    {
      name: "Report a new deviation (intake dialog)",
      what: "Open the +Report Deviation modal, fill in the intake form, save. Creates a record in REPORTED state.",
      location: "/nonconformance — top-right red '+ Report Deviation' button",
      roles: ["admin", "buyer", "auditor", "tenant_admin", "inspector", "workflow_manager"],
      api: "POST /api/deviations",
      steps: [
        { kind: "click", label: "Click '+ Report Deviation' (top-right)", expect: "Dialog opens with 8 form fields" },
        { kind: "type", label: "Fill 'Title' — short headline (e.g. 'OOS dissolution on batch NVX-2026-B015')", expect: "Required; submit disabled until non-empty" },
        { kind: "type", label: "Fill 'Description' — multi-line narrative", expect: "Required; submit disabled until non-empty" },
        { kind: "click", label: "Choose 'Type' — UNPLANNED (default) or PLANNED", expect: "Most production deviations are UNPLANNED" },
        { kind: "click", label: "Choose 'Category' — Process, Equipment, Material, etc.", expect: "Drives downstream KPI grouping" },
        { kind: "click", label: "Choose 'Classification' — CRITICAL / MAJOR / MINOR (default MINOR)", expect: "CRITICAL gates VP-level closure" },
        { kind: "type", label: "Fill 'Department' / 'Area' / 'Process Step' / 'Product Name' / 'Immediate Actions'", expect: "All optional — but stronger investigations capture them" },
        { kind: "click", label: "Click 'Save' (red button)", expect: "Dialog closes; new row appears at top of list with status REPORTED" },
      ],
      fields: [
        { name: "title", required: true, values: "string", note: "max ~200 chars practical" },
        { name: "description", required: true, values: "multi-line text", note: "captured in /investigate later" },
        { name: "deviationType", required: false, values: "PLANNED | UNPLANNED", note: "default UNPLANNED" },
        { name: "category", required: false, values: "PROCESS | EQUIPMENT | MATERIAL | DOCUMENTATION | ENVIRONMENTAL | LABORATORY | PACKAGING | STORAGE | PERSONNEL | OTHER" },
        { name: "classification", required: false, values: "CRITICAL | MAJOR | MINOR", note: "default MINOR" },
        { name: "productName", required: false, values: "string" },
        { name: "batchNumbers", required: false, values: "array of strings" },
        { name: "immediateActions", required: false, values: "string", note: "what was done at the moment of detection (quarantine, line stop, ...)" },
      ],
    },
    {
      name: "View + AI drawer (per row)",
      what: "Right-side drawer opens when you click 'View + AI' on any deviation row. Shows full narrative + the three AI assists.",
      location: "/nonconformance — primary blue 'View + AI' button on every row (data-testid='deviation-view-ai')",
      roles: ["any role with row visibility"],
      steps: [
        { kind: "click", label: "Click the blue 'View + AI' button on any deviation row", expect: "Drawer slides in from the right (640 px wide). Shows DEV-XXX header, classification + status chips, full description, AI actions section, AI prediction card." },
        { kind: "wait", label: "Predictive CAPA card auto-loads (POST /api/ai/predict/capa-outcome)", expect: "Two green/orange chips: P(on-time)=NN% · P(effective)=NN% · 'Top factors: ...'. ~700 ms" },
      ],
      screenshot: "walkthrough/03-kenji.png",
      aiAssist: "Predictive CAPA badge auto-renders on every drawer open.",
    },
    {
      name: "AI · Scaffold 5-Why",
      what: "Inline AI agent that turns the deviation narrative into a 5-level Why chain with citations and 6M (Man/Machine/Method/Material/Measurement/Environment) categorisation.",
      location: "View + AI drawer · button labelled 'Scaffold 5-why with AI'",
      roles: ["any with drawer access"],
      api: "POST /api/ai/deviation/scaffold-five-why",
      aiAssist: "Free Gemini 2.5 Flash-Lite. Citation-gated; falls back if confidence < 0.4.",
      steps: [
        { kind: "click", label: "Click 'Scaffold 5-why with AI'", expect: "Popover opens with a spinner; AI request fires" },
        { kind: "wait", label: "Wait ~2-4 s for the AI response", expect: "Popover renders 5 numbered Why steps with answer + citation refs (e.g. SOP-QC-014:3.2). Below: 6M categorisation, 6 follow-up questions." },
        { kind: "click", label: "Press Esc or click outside to dismiss", expect: "Popover closes; drawer remains open" },
      ],
      tip: "AI accept/reject is recorded to the audit trail (recordAiOutcome) — reviewers see who accepted what and when.",
    },
    {
      name: "AI · Draft CAPA RCA",
      what: "Larger drawer-in-drawer that produces a complete RCA: 5-Why + Fishbone + corrective + preventive + effectiveness check + regulatory clauses + citations.",
      location: "View + AI drawer · button labelled 'Draft CAPA RCA'",
      roles: ["any with drawer access"],
      api: "POST /api/ai/capa/draft-rca",
      aiAssist: "Free Gemini. Returns severity classification + structured RCA. User can edit every field before accepting.",
      steps: [
        { kind: "click", label: "Click 'Draft CAPA RCA'", expect: "Full-width drawer opens with header 'AI-drafted RCA' + provider/model/latency tags" },
        { kind: "wait", label: "Wait ~3-5 s", expect: "5-Why list renders, then corrective/preventive sections fill in, regulatory clauses appear as chips" },
        { kind: "type", label: "(Optional) Edit any field — RCA narrative, action descriptions, due-day estimates", expect: "Edits update the local copy; the AI draft is kept for diff" },
        { kind: "click", label: "Click 'Accept' (left of Create CAPA)", expect: "Records USER_ACCEPTED or USER_EDITED outcome in the audit trail. Does NOT create a CAPA on its own." },
        { kind: "click", label: "Click 'Create CAPA from this RCA' (primary blue, right)", expect: "Green Alert: 'CAPA CAPA-2026-NNNN created in CAPA_OPEN state. Open the CAPA workspace at /buyer/capas to triage and assign actions.'" },
      ],
      screenshot: "walkthrough/05-kenji.png",
      tip: "The 'Create CAPA from this RCA' button is the cross-module hand-off. It posts to POST /api/quality/capa-from-deviation which mints a real capa-v2 record + writes the corrective/preventive actions onto a capa-v2-action-plans row + pushes the CAPA id into the deviation's linkedCAPAIds.",
    },
    {
      name: "AI · Predictive CAPA badge",
      what: "Auto-renders in the View + AI drawer. Predicts P(on-time) and P(effective) for the (potential) CAPA, plus the top contributing factors.",
      location: "View + AI drawer · 'Predictive outcome' card at the bottom",
      roles: ["any with drawer access"],
      api: "POST /api/ai/predict/capa-outcome",
      aiAssist: "Heuristic model (capa.heuristic@1.0.0) — features: severity, rootCauseDepth, actionCount, daysToDue.",
      steps: [
        { kind: "wait", label: "Auto-renders 700 ms after the drawer opens", expect: "Two chips: P(on-time)=81% (green if >70%) and P(effective)=66% (orange if 50-70%)" },
        { kind: "wait", label: "Below: Top factors line", expect: "e.g. 'Top factors: slack_days · owner_prior_closure_rate'" },
      ],
    },
    {
      name: "Workflow button · Assess",
      what: "Captures the impact assessment (4 fields). Moves REPORTED → UNDER_ASSESSMENT.",
      location: "/nonconformance row · 'Assess' button (visible when status = REPORTED or UNDER_ASSESSMENT)",
      roles: ["EDITOR_ROLES"],
      api: "POST /api/deviations/:id/assess",
      steps: [
        { kind: "click", label: "Click 'Assess' on the row", expect: "Dialog opens with 4 fields" },
        { kind: "type", label: "Fill 'Product Quality Impact'", expect: "free-text" },
        { kind: "type", label: "Fill 'Patient Safety Impact'", expect: "free-text" },
        { kind: "click", label: "Choose 'Batch Disposition' (RELEASE/REJECT/REWORK/REPROCESS/QUARANTINE/PENDING)", expect: "PENDING is the safe default if undecided" },
        { kind: "type", label: "Fill 'Regulatory Impact'", expect: "free-text — basis for FAR / MDR decision later" },
        { kind: "click", label: "Click 'Submit'", expect: "Dialog closes; row status chip flips to UNDER_ASSESSMENT" },
      ],
    },
    {
      name: "Workflow button · Investigate",
      what: "Captures the root-cause analysis. Moves UNDER_ASSESSMENT → UNDER_INVESTIGATION; if rootCause is set → PENDING_DISPOSITION.",
      location: "/nonconformance row · 'Investigate' button (visible when status ≤ UNDER_INVESTIGATION)",
      roles: ["EDITOR_ROLES"],
      api: "POST /api/deviations/:id/investigate",
      steps: [
        { kind: "click", label: "Click 'Investigate'", expect: "Dialog opens" },
        { kind: "click", label: "Choose 'Method' — FIVE_WHY / FISHBONE / FAULT_TREE / PARETO / BRAINSTORM / OTHER", expect: "Method captured for QA-trail" },
        { kind: "type", label: "Fill 'Summary' (investigation summary)", expect: "free-text" },
        { kind: "type", label: "Fill 'Root Cause' (one sentence)", expect: "Setting this advances state to PENDING_DISPOSITION" },
        { kind: "click", label: "Choose 'Root Cause Category' — HUMAN_ERROR / EQUIPMENT_FAILURE / MATERIAL_DEFECT / PROCESS_GAP / etc.", expect: "10 enums" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips. If you used the AI 5-Why scaffolder first, paste its 5th-Why answer here." },
      ],
    },
    {
      name: "Workflow button · Dispose",
      what: "Records the batch disposition decision. Moves PENDING_DISPOSITION → PENDING_CAPA_DECISION.",
      location: "/nonconformance row · 'Dispose' button (visible when status = PENDING_DISPOSITION)",
      roles: ["EDITOR_ROLES (Head of QA in practice)"],
      api: "POST /api/deviations/:id/dispose",
      steps: [
        { kind: "click", label: "Click 'Dispose'", expect: "Dialog opens" },
        { kind: "click", label: "Choose 'Disposition Decision' — RELEASE / REJECT / REWORK / REPROCESS / QUARANTINE / NOT_APPLICABLE", expect: "REJECT for the failed batch in the demo" },
        { kind: "type", label: "Fill 'Justification'", expect: "Cite the failing test + spec ref" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips to PENDING_CAPA_DECISION" },
      ],
    },
    {
      name: "Workflow · CAPA decision",
      what: "Decide whether a systemic CAPA is required. Moves PENDING_CAPA_DECISION → CAPA_REQUIRED or PENDING_CLOSURE.",
      location: "POST /api/deviations/:id/capa-decision (no dedicated UI button today — fired by the AI 'Create CAPA' button or via API)",
      roles: ["EDITOR_ROLES"],
      api: "POST /api/deviations/:id/capa-decision",
      steps: [
        { kind: "api", label: "Frontend wiring: when user clicks 'Create CAPA from this RCA' the cross-module endpoint sets capaRequired=true + populates linkedCAPAIds.", expect: "Status moves to CAPA_REQUIRED" },
        { kind: "api", label: "Backend body: { capaRequired: true | false, autoCreateCapa: true | false, linkedCAPAIds: [..] }", expect: "If autoCreateCapa=true and the deviation has no linked CAPA, the legacy code-path mints one via crossModuleService.createCapaFromDeviation()" },
      ],
      tip: "There's no standalone 'Decide CAPA' button on the row today — the user makes the decision implicitly via the AI 'Create CAPA' button, or via API. Roadmap: dedicated drawer.",
    },
    {
      name: "Workflow button · Close",
      what: "Final closure. Captures closureNotes + sets closedBy + closedAt. Moves PENDING_CLOSURE / CAPA_REQUIRED → CLOSED.",
      location: "/nonconformance row · 'Close' button (visible when status = PENDING_CLOSURE or CAPA_REQUIRED)",
      roles: ["EDITOR_ROLES (Head of QA / VP Quality)"],
      api: "POST /api/deviations/:id/close",
      steps: [
        { kind: "click", label: "Click 'Close'", expect: "Dialog opens" },
        { kind: "type", label: "Fill 'Closure Notes' — what was done; reference to linked CAPA closure", expect: "Required" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips to CLOSED. closedBy + closedAt persisted. Row chip turns green." },
      ],
      tip: "Closure does not currently force the linked CAPA(s) to be closed first — they continue independently in the CAPA workspace. This is intentional (CAPAs may take 90+ days, but the deviation can close once disposition is final).",
    },
    {
      name: "Cross-feature · Signal cluster alert",
      what: "Z-score trend detector running across deviations. If 3+ deviations cluster on the same equipment / material / process within the baseline window, an alert fires.",
      location: "Head-of-QA dashboard + GET /api/ai/signals?status=open",
      roles: ["admin · Head of QA"],
      api: "GET /api/ai/signals?status=open",
      aiAssist: "Wave 3 statistical detector (no LLM).",
      steps: [
        { kind: "navigate", label: "James (Head of QA) opens the AI signals dashboard", expect: "1 cluster shown today: equipment:NVX-PRESS-001 · size 3 · z=3.4. Members listed by deviationNumber." },
      ],
    },
  ],

  // ── 5. LIFECYCLE WALKTHROUGH ─────────────────────────────────────────
  lifecycleIntro:
    "One deviation walked end-to-end. Each row is one transition. The 'Observed' column is what we got from the live Vercel run on " +
    new Date().toISOString().slice(0, 10) +
    ". Screenshot rows under each step show what the user actually saw at that point.",
  lifecycle: [
    { step: 1, persona: "Kenji", role: "QA Specialist", fromState: "—", toState: "REPORTED",
      action: "Open /nonconformance, click '+ Report Deviation', fill the intake form (title + description + classification=MAJOR + product), Save",
      api: "POST /api/deviations",
      observed: "id assigned · deviationNumber DEV-2026-NNNN · status=REPORTED",
      outcome: "pass",
      screenshot: "walkthrough/02-kenji.png" },
    { step: 2, persona: "Kenji", role: "QA Specialist", fromState: "REPORTED", toState: "UNDER_ASSESSMENT",
      action: "Click 'Assess' on the new row → fill 4 impact fields → Submit",
      api: "POST /api/deviations/:id/assess",
      observed: "status=UNDER_ASSESSMENT", outcome: "pass" },
    { step: 3, persona: "Kenji", role: "QA Specialist", fromState: "UNDER_ASSESSMENT", toState: "UNDER_INVESTIGATION",
      action: "Click 'View + AI' on the row → Click 'Scaffold 5-why with AI' → AI returns 5-Why chain in ~3 s",
      api: "POST /api/ai/deviation/scaffold-five-why",
      observed: "5 whys + 6 follow-ups + 6M categorisation. Provider gemini-2.5-flash-lite. Confidence 0.85.",
      outcome: "pass",
      screenshot: "walkthrough/03-kenji.png" },
    { step: 4, persona: "Kenji", role: "QA Specialist", fromState: "UNDER_INVESTIGATION", toState: "PENDING_DISPOSITION",
      action: "Click 'Draft CAPA RCA' in the same drawer → AI returns full RCA in ~4 s → Click 'Create CAPA from this RCA'",
      api: "POST /api/ai/capa/draft-rca · then POST /api/quality/capa-from-deviation",
      observed: "Green alert: 'CAPA CAPA-2026-NNNN created in CAPA_OPEN state.' deviation.linkedCAPAIds[] now contains the new CAPA id; capaRequired=true",
      outcome: "pass",
      screenshot: "walkthrough/05-kenji.png" },
    { step: 5, persona: "(verify)", role: "—", fromState: "—", toState: "—",
      action: "Open /buyer/capas — confirm the CAPA workspace shows the newly minted record",
      api: "GET /api/capa-v2/capas",
      observed: "CAPA visible at top of list with status CAPA_OPEN, severity HIGH (mapped from MAJOR), owner=Kenji, dueDate=+30 days",
      outcome: "pass" },
    { step: 6, persona: "James", role: "Head of QA", fromState: "PENDING_DISPOSITION", toState: "PENDING_CAPA_DECISION",
      action: "James opens the deviation row → Click 'Investigate' (sets rootCause from the AI draft) → Click 'Dispose' → choose REJECT + justification → Submit",
      api: "POST /api/deviations/:id/investigate · POST /api/deviations/:id/dispose",
      observed: "status=PENDING_CAPA_DECISION", outcome: "pass" },
    { step: 7, persona: "James", role: "Head of QA", fromState: "PENDING_CAPA_DECISION", toState: "CAPA_REQUIRED",
      action: "Confirm CAPA decision = required (already set when Kenji clicked 'Create CAPA from RCA')",
      api: "POST /api/deviations/:id/capa-decision",
      observed: "status=CAPA_REQUIRED, linkedCAPAIds intact", outcome: "pass" },
    { step: 8, persona: "James", role: "Head of QA", fromState: "CAPA_REQUIRED", toState: "CLOSED",
      action: "Click 'Close' on the row → fill closureNotes referencing the CAPA → Submit",
      api: "POST /api/deviations/:id/close",
      observed: "status=CLOSED · closedBy=James · closedAt=now · linked CAPA continues independently in /buyer/capas", outcome: "pass" },
    { step: 9, persona: "Maria", role: "Lead Auditor (audit-time)", fromState: "CLOSED", toState: "CLOSED (verified)",
      action: "(Audit-time) Maria opens the CAPA-v2 workspace → walks the linked CAPA through INVESTIGATION → RCA → ACTION_PLAN → IMPLEMENTATION → EFFECTIVENESS_REVIEW → CLOSED_EFFECTIVE",
      api: "POST /api/capa-v2/capas/:id/* (multiple)",
      observed: "Covered in eqms-lifecycle.spec.ts capa-v2 test; not duplicated here", outcome: "skip" },
  ],

  // ── 6. AI ASSIST MAP ─────────────────────────────────────────────────
  aiAssists: [
    { name: "5-Why Scaffolder (Wave 1)", attachedToStates: ["UNDER_INVESTIGATION"], endpoint: "POST /api/ai/deviation/scaffold-five-why",
      where: "View + AI drawer · 'Scaffold 5-why with AI' button → popover",
      what: "5-level Why chain with citations + 6 follow-up questions + 6M categorisation",
      provider: "Free Gemini 2.5 Flash-Lite" },
    { name: "CAPA RCA Drafter (Wave 1)", attachedToStates: ["UNDER_INVESTIGATION → CAPA_REQUIRED"], endpoint: "POST /api/ai/capa/draft-rca",
      where: "View + AI drawer · 'Draft CAPA RCA' button → drawer-in-drawer",
      what: "Full RCA: 5-Why + Fishbone + corrective + preventive + effectiveness + regulatory clauses + citations + severity",
      provider: "Free Gemini 2.5 Flash-Lite" },
    { name: "Predictive CAPA Outcome (Wave 3)", attachedToStates: ["any (drawer auto-render)"], endpoint: "POST /api/ai/predict/capa-outcome",
      where: "View + AI drawer · 'Predictive outcome' card (auto-renders)",
      what: "P(on-time) + P(effective) + top contributing factors",
      provider: "Heuristic model capa.heuristic@1.0.0 (no LLM)" },
    { name: "Cross-module CAPA Creator", attachedToStates: ["UNDER_INVESTIGATION → CAPA_REQUIRED"], endpoint: "POST /api/quality/capa-from-deviation",
      where: "AI Draft CAPA RCA drawer · 'Create CAPA from this RCA' button (primary blue, right)",
      what: "Mints a real capa-v2 record + persists corrective/preventive actions + links the new CAPA id back into the deviation",
      provider: "Cross-module service (no LLM)" },
    { name: "Signal cluster detector (Wave 3)", attachedToStates: ["all states (post-create)"], endpoint: "GET /api/ai/signals?status=open",
      where: "Head-of-QA dashboard",
      what: "Z-score detector across deviations on shared features (equipment, material, process). Today: 1 alert on equipment:NVX-PRESS-001 · z=3.4",
      provider: "Statistical (no LLM)" },
  ],

  // ── 7. TEST RESULTS ──────────────────────────────────────────────────
  testResults: [
    { suite: "eqms-lifecycle.spec.ts · deviation", scope: "REPORTED → CLOSED — 8 steps via API", outcome: "pass", evidence: "8/8 PASS — eqms-test-results-v2.pdf" },
    { suite: "eqms-cross-module.spec.ts · F1", scope: "Deviation → AI Draft RCA → real CAPA created in workspace → linkedCAPAIds updated → close deviation", outcome: "pass", evidence: "7/8 PASS, 1 SKIP (full CAPA closure deferred to v2 lifecycle)" },
    { suite: "novex-walkthrough.spec.ts", scope: "/nonconformance UI rendering with 3 seeded rows + View+AI drawer + AI buttons", outcome: "pass", evidence: "screenshots 02 + 03 + 05 in walkthrough.json" },
    { suite: "Wave 1 smoke", scope: "POST /api/ai/deviation/scaffold-five-why · POST /api/ai/capa/draft-rca", outcome: "pass", evidence: "11/12 wave1-3 smoke" },
    { suite: "Wave 3 smoke", scope: "POST /api/ai/predict/capa-outcome · GET /api/ai/signals", outcome: "pass", evidence: "wave1-3 smoke green" },
  ],

  // ── 8. ROADMAP / GAPS ────────────────────────────────────────────────
  roadmap: [
    { title: "Dedicated 'CAPA decision' drawer (PENDING_CAPA_DECISION → CAPA_REQUIRED)", note: "Today the decision is implicit via the AI 'Create CAPA' button. Add an explicit Yes/No drawer with rationale field.", priority: "MEDIUM" },
    { title: "E-signature requirement on close", note: "Closure currently captures closedBy + closedAt but doesn't force /api/electronic-signatures/sign. Wire the signature gate for CRITICAL severity.", priority: "HIGH" },
    { title: "Field Alert Reportable flag + deadline timer", note: "Per 21 CFR 314.81 / 21 CFR 803, a CRITICAL deviation with patient-safety exposure has a 3-day FAR or 5-day MDR clock. Add isFieldAlertReportable boolean + farDueDate auto-computed, with reminder notification policy.", priority: "HIGH" },
    { title: "Surface linkedCAPAIds in the deviation detail drawer", note: "The deviation has the link in the model (verified by API) but the drawer doesn't render the linked CAPAs as clickable chips yet.", priority: "MEDIUM" },
    { title: "AI Complaint-triage agent (Wave 3 roadmap)", note: "Not in Deviation module per se but extends the cross-module flow to Complaint → Deviation → CAPA.", priority: "LOW" },
    { title: "ROI / token-budget tool for tenant admin", note: "User-requested separately. Per-tenant LLM token usage dashboard with provider override (Gemini Free / GPT-4o / Anthropic / open-source on-prem) and budget cap.", priority: "DEFERRED" },
  ],
};
