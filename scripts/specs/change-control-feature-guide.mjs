/**
 * Change Control — Feature Guide spec.
 */
export default {
  version: "1.1",
  moduleName: "Change Control",
  moduleFlag: "modules.CHANGE_CONTROL",
  modelFile: "backend/src/models/ChangeControlModel.js",
  routes: ["/change-controls (frontend)", "/api/universal/change-controls (backend)"],
  purpose: "Control + document any proposed change to an approved process, material, equipment, specification, or procedure. Drive impact assessment, multi-level approval, implementation, effectiveness verification.",
  compliance: "ICH Q10 §3.2.3 (change management) · 21 CFR 211.100 · 21 CFR 820.30 (medical device) · EU GMP Annex 15",
  overviewBody:
    "Changes follow DRAFT → SUBMITTED → IMPACT_ASSESSMENT → UNDER_REVIEW (multi-step approval) → APPROVED → IMPLEMENTATION → VERIFICATION → CLOSED (or REJECTED / CANCELLED). " +
    "The Wave 2 Regulatory Impact Classifier suggests US (CBE-30 / PAS-NDA) + EU (Type IA/IB/II Variation) routing from the change description.",

  comparison: [
    { expectation: "Change types (PROCESS / MATERIAL / EQUIPMENT / DOCUMENTATION / FACILITY / SUPPLIER / SPECIFICATION / OTHER)", standard: "ICH Q10", hawkeye: "changeType enum.", outcome: "met" },
    { expectation: "Risk level (LOW / MEDIUM / HIGH / CRITICAL)", standard: "ICH Q9", hawkeye: "riskLevel enum.", outcome: "met" },
    { expectation: "10-state lifecycle with role gates", standard: "21 CFR 211.100(b)", hawkeye: "DRAFT / SUBMITTED / IMPACT_ASSESSMENT / UNDER_REVIEW / APPROVED / IMPLEMENTATION / VERIFICATION / CLOSED / REJECTED / CANCELLED.", outcome: "met" },
    { expectation: "Multi-step approval workflow with role + decision per step", standard: "21 CFR 211.100(b)", hawkeye: "approvalSteps[] subdocument with role + userId + decision (PENDING/APPROVED/REJECTED/ABSTAINED). All APPROVED → status=APPROVED; any REJECTED → status=REJECTED.", outcome: "met" },
    { expectation: "AI regulatory impact classifier", standard: "FDA AI guidance Jan 2025", hawkeye: "POST /api/ai/change-control/classify-impact returns US (CBE-30 / PAS-NDA) + EU (Type IA/IB/II Variation) routing with reasoning.", outcome: "met" },
    { expectation: "Effectiveness verification after implementation", standard: "ICH Q10 §3.2.3(d)", hawkeye: "POST /:id/verify-effectiveness with verificationNotes + effectivenessCheck + effective boolean. effective=true → status=CLOSED; effective=false → bumps back to IMPLEMENTATION.", outcome: "met" },
    { expectation: "Linked records (CAPA / deviation / document / training)", standard: "ICH Q10 §3.2.5", hawkeye: "linkedDocumentIds, linkedCAPAIds, linkedTrainingIds arrays.", outcome: "met" },
    { expectation: "Affected products + markets capture", standard: "FDA / EMA", hawkeye: "affectedProducts[] + affectedMarkets[] arrays. Drives the AI impact classifier.", outcome: "met" },
    { expectation: "21 CFR Part 11 e-signature on each approval step", standard: "21 CFR Part 11 §11.50", hawkeye: "approvalSteps[].signature field exists; not enforced today.", outcome: "partial", note: "Wire e-sig requirement" },
    { expectation: "Per-tenant numbering (CCR-YYYY-NNNN)", standard: "GMP traceability", hawkeye: "Pre-save hook generates CCR-YYYY-NNNN. Bug fixed in v2.1: index now (tenantId, changeNumber) compound + per-tenant max-prefix scan.", outcome: "met" },
  ],

  personas: [
    { name: "Marcus Brown", role: "Regulatory Affairs (admin · originator)", email: "regulatory@novex-pharma.demo",
      responsibilities: "Drafts changes, fires AI impact classifier, drives the workflow.", touches: ["DRAFT", "SUBMITTED", "IMPACT_ASSESSMENT"] },
    { name: "James Thompson", role: "Head of QA (admin · approver)", email: "qa.head@novex-pharma.demo",
      responsibilities: "Default approver on QA-impact changes.", touches: ["UNDER_REVIEW"] },
    { name: "Sarah O'Brien", role: "Doc Control (admin · implementer)", email: "doc.control@novex-pharma.demo",
      responsibilities: "Implements doc-related changes (publishes new SOP rev linked to the change).", touches: ["IMPLEMENTATION"] },
    { name: "Elena Vasquez", role: "VP Quality (tenant_admin · final approver)", email: "vp.quality@novex-pharma.demo",
      responsibilities: "Final approval on CRITICAL changes; signs effectiveness verification.", touches: ["VERIFICATION", "CLOSED"] },
  ],

  features: [
    { name: "Change-control register", what: "Lists every change with risk-level + status chips.", location: "/change-controls", roles: ["any viewer"], api: "GET /api/universal/change-controls",
      steps: [
        { kind: "navigate", label: "Click 'Changes' in the top nav", expect: "Page renders" },
        { kind: "wait", label: "Spinner clears", expect: "Rows visible (empty if no changes seeded)" },
      ],
      screenshot: "state-screens/change-controls-list.png" },

    { name: "+ New Change Request dialog",
      what: "Author a new change request.",
      location: "/change-controls · top-right '+ New Change Request' button",
      roles: ["createRoles"],
      api: "POST /api/universal/change-controls",
      steps: [
        { kind: "click", label: "Click '+ New Change Request'", expect: "Dialog opens" },
        { kind: "type", label: "Fill title (1 sentence)", expect: "required" },
        { kind: "type", label: "Fill description (full narrative)", expect: "required" },
        { kind: "click", label: "Pick changeType (PROCESS / MATERIAL / EQUIPMENT / DOCUMENTATION / FACILITY / SUPPLIER / SPECIFICATION / OTHER)", expect: "required" },
        { kind: "click", label: "Pick riskLevel (LOW / MEDIUM / HIGH / CRITICAL)", expect: "required" },
        { kind: "type", label: "(Optional) Fill affectedProducts[] + affectedMarkets[]", expect: "drives the AI classifier" },
        { kind: "click", label: "(Optional) Add approvalSteps[] now or after submit", expect: "stepOrder + role + (userId)" },
        { kind: "click", label: "Click 'Save'", expect: "Row appears with status=DRAFT; changeNumber=CCR-YYYY-NNNN auto-generated" },
      ],
      fields: [
        { name: "title", required: true, values: "string" },
        { name: "description", required: true, values: "multi-line" },
        { name: "changeType", required: true, values: "PROCESS | MATERIAL | EQUIPMENT | DOCUMENTATION | FACILITY | SUPPLIER | SPECIFICATION | OTHER" },
        { name: "riskLevel", required: true, values: "LOW | MEDIUM | HIGH | CRITICAL" },
        { name: "affectedProducts", required: false, values: "string[]" },
        { name: "affectedMarkets", required: false, values: "string[] e.g. ['US', 'EU']" },
        { name: "approvalSteps", required: false, values: "[{stepOrder, role, userId, decision: 'PENDING'}]" },
      ] },

    { name: "AI · Classify regulatory impact (Wave 2)",
      what: "Given the change description + type + risk + products + markets, AI classifies US (CBE-30 / PAS-NDA / Annual) + EU (Type IA / IB / II Variation) routing with reasoning.",
      location: "Change detail · 'Classify regulatory impact' button",
      roles: ["regulatory · admin"],
      api: "POST /api/ai/change-control/classify-impact",
      aiAssist: "Free Gemini 2.5 Flash-Lite with regulatory reasoning prompt",
      steps: [
        { kind: "click", label: "Click 'Classify regulatory impact'", expect: "Drawer opens" },
        { kind: "click", label: "Click 'Generate'", expect: "After ~3 s: US route + EU route + rationale rendered. Auto-populates regulatoryImpact field" },
      ] },

    { name: "Submit (DRAFT → SUBMITTED)",
      what: "Move the draft into the workflow.",
      location: "Change detail · 'Submit' button (or PUT)",
      roles: ["createRoles"],
      api: "PUT /api/universal/change-controls/:id (status=SUBMITTED)",
      steps: [{ kind: "click", label: "Click 'Submit'", expect: "Status flips to SUBMITTED" }] },

    { name: "Approve / reject step",
      what: "Approver acts on a pending step. All APPROVED → status=APPROVED; any REJECTED → status=REJECTED.",
      location: "Change detail · 'Approve' button (visible to assigned approver)",
      roles: ["auditor", "admin", "tenant_admin", "reviewer", "workflow_manager"],
      api: "POST /api/universal/change-controls/:id/approval",
      steps: [
        { kind: "click", label: "Click 'Approve' on the row", expect: "Drawer with stepOrder + decision picker" },
        { kind: "click", label: "Pick APPROVED / REJECTED / ABSTAINED", expect: "required" },
        { kind: "type", label: "Fill comments (recommended)", expect: "stored on the step" },
        { kind: "click", label: "Submit", expect: "Step decision recorded" },
      ] },

    { name: "Verify effectiveness (IMPLEMENTATION/VERIFICATION → CLOSED)",
      what: "After the change is implemented, verify it achieved its intent.",
      location: "Change detail · 'Verify Effectiveness' button",
      roles: ["createRoles"],
      api: "POST /api/universal/change-controls/:id/verify-effectiveness",
      steps: [
        { kind: "click", label: "Click 'Verify Effectiveness'", expect: "Drawer with verificationNotes + effectivenessCheck + effective boolean" },
        { kind: "type", label: "Fill verificationNotes", expect: "required" },
        { kind: "type", label: "Fill effectivenessCheck (the criterion)", expect: "required" },
        { kind: "click", label: "Tick effective=true (or false)", expect: "true → status=CLOSED; false → status=IMPLEMENTATION (re-work)" },
        { kind: "click", label: "Submit", expect: "Status updates" },
      ] },
  ],

  lifecycleIntro: "One change request walked from draft to closure with effectiveness verification.",
  lifecycle: [
    { step: 1, persona: "Marcus", role: "Regulatory Affairs", fromState: "—", toState: "DRAFT",
      action: "+ New Change Request → fill PLC health-check addition / PROCESS / MEDIUM / Novexolimus / US → approvalSteps=[{1, QA Manager}]",
      api: "POST /api/universal/change-controls",
      observed: "Row · changeNumber=CCR-2026-NNNN · status=DRAFT", outcome: "pass",
      expectedDb: "change_controls { _id, changeNumber: 'CCR-2026-NNNN', title, description, changeType: 'PROCESS', riskLevel: 'MEDIUM', status: 'DRAFT', approvalSteps: [{ stepOrder: 1, role: 'QA Manager', decision: 'PENDING' }] }",
      screenshot: "state-screens/change-controls-list.png" },
    { step: 2, persona: "Marcus", role: "Reg Affairs", fromState: "DRAFT", toState: "SUBMITTED",
      action: "PUT status=SUBMITTED", api: "PUT /api/universal/change-controls/:id", observed: "status flips", outcome: "pass" },
    { step: 3, persona: "Marcus", role: "Reg Affairs", fromState: "SUBMITTED", toState: "SUBMITTED (with AI impact)",
      action: "Click 'Classify regulatory impact' → AI returns US + EU routing", api: "POST /api/ai/change-control/classify-impact",
      observed: "regulatoryImpact populated; classifier returned both routes", outcome: "pass" },
    { step: 4, persona: "James", role: "Head of QA (approver)", fromState: "SUBMITTED", toState: "APPROVED",
      action: "Click 'Approve' on stepOrder=1 → APPROVED + comments → Submit",
      api: "POST /api/universal/change-controls/:id/approval",
      observed: "All steps APPROVED → status=APPROVED", outcome: "pass",
      expectedDb: "change_controls.approvalSteps[0].decision = 'APPROVED'; status = 'APPROVED'" },
    { step: 5, persona: "Marcus", role: "Reg Affairs", fromState: "APPROVED", toState: "IMPLEMENTATION",
      action: "PUT status=IMPLEMENTATION", api: "PUT /api/universal/change-controls/:id", observed: "status flips", outcome: "pass" },
    { step: 6, persona: "Marcus", role: "Reg Affairs", fromState: "IMPLEMENTATION", toState: "CLOSED",
      action: "POST /verify-effectiveness with effective=true + verificationNotes", api: "POST /api/universal/change-controls/:id/verify-effectiveness",
      observed: "status=CLOSED · effectivenessCheck recorded", outcome: "pass",
      expectedDb: "change_controls { status: 'CLOSED', effectivenessCheck, effective: true }" },
  ],

  aiAssists: [
    { name: "Regulatory Impact Classifier (Wave 2)", attachedToStates: ["IMPACT_ASSESSMENT", "UNDER_REVIEW"], endpoint: "POST /api/ai/change-control/classify-impact", where: "Change detail · 'Classify regulatory impact'", what: "Returns US (CBE-30 / PAS-NDA / Annual) + EU (Type IA/IB/II Variation) classification with reasoning", provider: "Free Gemini 2.5 Flash-Lite" },
  ],

  regulatorTrace: [
    { state: "DRAFT", citations: ["ICH Q10 §3.2.3"], evidence: "title + description + changeType + riskLevel", records: "change_controls" },
    { state: "IMPACT_ASSESSMENT", citations: ["ICH Q10 §3.2.3(a)"], evidence: "regulatoryImpact + impactAssessment fields (auto-populated by AI classifier)", records: "change_controls" },
    { state: "APPROVED", citations: ["21 CFR 211.100(b)", "21 CFR Part 11"], evidence: "approvalSteps[] all APPROVED + e-sig per step", records: "change_controls.approvalSteps + (electronic-signatures)" },
    { state: "IMPLEMENTATION", citations: ["ICH Q10 §3.2.3(b)"], evidence: "linkedDocumentIds (new SOP rev) + linkedTrainingIds + implementation notes", records: "change_controls + document-controls (linked)" },
    { state: "CLOSED", citations: ["ICH Q10 §3.2.3(d)"], evidence: "verificationNotes + effectivenessCheck + effective=true + verifiedBy + verifiedAt", records: "change_controls" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · change-control", scope: "DRAFT → SUBMITTED → AI classify → APPROVED → IMPLEMENTATION → CLOSED", outcome: "pass", evidence: "7/7 PASS · eqms-test-results-v2.pdf" },
    { suite: "Backend bug fix verification", scope: "Per-tenant changeNumber + compound unique index", outcome: "pass", evidence: "v2.1 commit 56ddd85 + migration script ran" },
  ],

  roadmap: [
    { title: "Mandatory e-sig per approval step", note: "Wire /api/electronic-signatures/sign for each approve action.", priority: "HIGH" },
    { title: "Auto-link to document revision when changeType=DOCUMENTATION", note: "Today linkedDocumentIds is manual. Auto-create + link a new SOP rev.", priority: "MEDIUM" },
    { title: "Auto-trigger training when implementation completes", note: "If linkedDocumentIds includes a SOP that publishes, training auto-assign already fires. Confirm cross-link.", priority: "LOW" },
    { title: "AI suggested approver list", note: "Based on changeType + affectedProducts, suggest approvalSteps[] from a tenant policy table.", priority: "LOW" },
  ],
};
