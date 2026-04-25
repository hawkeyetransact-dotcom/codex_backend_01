/**
 * Supplier Pre-Qualification — Feature Guide spec.
 */
export default {
  version: "1.0",
  moduleName: "Supplier Pre-Qualification",
  moduleFlag: "modules.SUPPLIER_QUALITY",
  modelFile: "backend/src/models/SupplierPreQualificationModel.js",
  routes: ["/supplier-prequalification (frontend)", "/api/supplier-prequalifications (backend)"],
  purpose: "Screen a new supplier before scheduling a full audit. Capture initial risk band, regulatory standards, product categories, checklist compliance. Output: APPROVED / CONDITIONALLY_APPROVED / REJECTED with validity window.",
  compliance: "ICH Q10 §2.7 · 21 CFR 211.84 (component qualification) · EU GMP Chapter 7 · ISO 13485 §7.4",
  overviewBody:
    "Pre-quals follow DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / CONDITIONALLY_APPROVED / REJECTED. " +
    "An APPROVED PQ becomes the basis for scheduling a full audit. CONDITIONALLY_APPROVED carries explicit conditions tracked separately. " +
    "EXPIRED is auto-set when validUntil passes.",

  comparison: [
    { expectation: "Auto-numbered (PQ-YYYY-NNNN)", standard: "GMP", hawkeye: "pqNumber pre-save generator.", outcome: "met" },
    { expectation: "Risk band capture (LOW / MEDIUM / HIGH)", standard: "ICH Q9", hawkeye: "initialRiskBand enum.", outcome: "met" },
    { expectation: "Regulatory standards + product categories", standard: "ICH Q10 §2.7", hawkeye: "regulatoryStandards[] + productCategories[].", outcome: "met" },
    { expectation: "Checklist with criterion + result + notes", standard: "21 CFR 211.84", hawkeye: "checklist[] subdocument.", outcome: "met" },
    { expectation: "Decision (APPROVED / CONDITIONALLY_APPROVED / REJECTED) with rationale + validUntil", standard: "ICH Q10 §2.7", hawkeye: "/decision endpoint with decision + decisionNotes + conditions[] + validUntil.", outcome: "met" },
    { expectation: "Auto-EXPIRE on validUntil", standard: "—", hawkeye: "Status enum supports EXPIRED; no scheduler today.", outcome: "gap", note: "Add cron" },
    { expectation: "Escalate APPROVED PQ to full audit request", standard: "ICH Q10 §2.7", hawkeye: "auditRequestId field links the PQ to the spawned audit.", outcome: "met" },
    { expectation: "Public-data enrichment (FDA warning letters / 483s / import alerts)", standard: "FDA AI guidance", hawkeye: "Wave audit-agents · Supplier-Intel agent (POST /api/ai/audit-agents/supplier-intel) returns openFDA + EMA + WHO PQ signals.", outcome: "met" },
  ],

  personas: [
    { name: "Audit Program Mgr Priya", role: "buyer · PQ owner", email: "audit.program@novex-pharma.demo",
      responsibilities: "Initiates PQ for new suppliers, drives review, escalates to audit.", touches: ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] },
    { name: "Supplier (external)", role: "supplier", email: "(supplier-side login)",
      responsibilities: "Fills the questionnaire response.", touches: ["DRAFT (external)"] },
    { name: "Audit Lead Maria", role: "auditor · approver", email: "audit.lead@novex-pharma.demo",
      responsibilities: "Reviews checklist, signs off APPROVED / CONDITIONAL / REJECTED.", touches: ["UNDER_REVIEW", "APPROVED", "CONDITIONALLY_APPROVED", "REJECTED"] },
    { name: "VP Quality Elena", role: "tenant_admin", email: "vp.quality@novex-pharma.demo",
      responsibilities: "Final approval on HIGH-risk supplier prequals.", touches: ["APPROVED"] },
  ],

  features: [
    { name: "PQ register",
      what: "Lists all pre-quals with status + risk band + decision.",
      location: "/supplier-prequalification",
      roles: ["any tenant viewer"],
      api: "GET /api/supplier-prequalifications",
      steps: [
        { kind: "navigate", label: "Click 'Suppliers' → 'Pre-qualification'", expect: "Page renders" },
      ],
      screenshot: "state-screens/supplier-prequal-list.png" },

    { name: "+ Start Pre-Qual dialog",
      what: "Initiate a new PQ.",
      location: "/supplier-prequalification · top-right '+ Start Pre-Qual'",
      roles: ["supplier · buyer · admin"],
      api: "POST /api/supplier-prequalifications",
      steps: [
        { kind: "click", label: "Click '+ Start Pre-Qual'", expect: "Dialog opens" },
        { kind: "type", label: "Fill supplierName", expect: "required" },
        { kind: "type", label: "Fill scope (1 sentence)", expect: "required" },
        { kind: "click", label: "Pick initialRiskBand (LOW / MEDIUM / HIGH)", expect: "required" },
        { kind: "type", label: "Fill regulatoryStandards[] (e.g. ICH Q7, 21 CFR 211)", expect: "" },
        { kind: "type", label: "Fill productCategories[] (e.g. API, Excipient)", expect: "" },
        { kind: "click", label: "Click 'Save'", expect: "Row · status=DRAFT · pqNumber=PQ-YYYY-NNNN" },
      ],
      fields: [
        { name: "supplierName", required: true, values: "string" },
        { name: "scope", required: true, values: "string" },
        { name: "initialRiskBand", required: true, values: "LOW | MEDIUM | HIGH" },
        { name: "regulatoryStandards", required: false, values: "string[]" },
        { name: "productCategories", required: false, values: "string[]" },
      ] },

    { name: "Submit (DRAFT → SUBMITTED)",
      what: "Supplier submits the PQ for buyer review.",
      location: "PQ row · 'Submit' button",
      roles: ["supplier"],
      api: "PUT /api/supplier-prequalifications/:id (status=SUBMITTED)",
      steps: [{ kind: "click", label: "Click 'Submit'", expect: "Status flips" }] },

    { name: "Begin review (SUBMITTED → UNDER_REVIEW)",
      what: "Buyer accepts the PQ into the queue.",
      location: "PQ row · 'Begin Review' button",
      roles: ["buyer"],
      api: "PUT /api/supplier-prequalifications/:id (status=UNDER_REVIEW)",
      steps: [{ kind: "click", label: "Click 'Begin Review'", expect: "Status flips" }] },

    { name: "Decision (UNDER_REVIEW → APPROVED/CONDITIONAL/REJECTED)",
      what: "Auditor signs off with decision + validUntil + (optional) conditions.",
      location: "PQ row · 'Decision' button",
      roles: ["auditor · tenant_admin"],
      api: "POST /api/supplier-prequalifications/:id/decision",
      steps: [
        { kind: "click", label: "Click 'Decision'", expect: "Drawer with decision picker" },
        { kind: "click", label: "Pick decision (APPROVED / CONDITIONALLY_APPROVED / REJECTED)", expect: "required" },
        { kind: "type", label: "Fill decisionNotes (rationale)", expect: "required" },
        { kind: "click", label: "Pick validUntil (e.g. +2 years)", expect: "required for APPROVED / CONDITIONAL" },
        { kind: "type", label: "(If CONDITIONAL) Fill conditions[]", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Status flips · decisionAt set" },
      ] },

    { name: "AI · Supplier Intel agent",
      what: "Pull public FDA + EMA + WHO PQ signals about the supplier.",
      location: "PQ detail · 'Check public signals' button",
      roles: ["any tenant user"],
      api: "POST /api/ai/audit-agents/supplier-intel",
      aiAssist: "Cross-product: openFDA + FDA warning letters + EMA EudraGMDP + WHO PQ. Verdict = known_tenant / public_only / ambiguous / unknown.",
      steps: [
        { kind: "click", label: "Click 'Check public signals'", expect: "Drawer opens" },
        { kind: "wait", label: "Wait ~3-5 s for the public-data fusion", expect: "Returns FDA ANDAs + warning letters + import alerts; verdict shown" },
      ] },
  ],

  lifecycleIntro: "One PQ walked from start to APPROVED.",
  lifecycle: [
    { step: 1, persona: "Priya", role: "Audit Program Mgr", fromState: "—", toState: "DRAFT",
      action: "+ Start Pre-Qual → supplierName='E2E Lifecycle Supplier', scope, initialRiskBand=MEDIUM, regulatoryStandards=[ICH Q7, 21 CFR 211], productCategories=[API, Raw material]",
      api: "POST /api/supplier-prequalifications",
      observed: "pqNumber=PQ-2026-NNNN · status=DRAFT", outcome: "pass",
      expectedDb: "supplier-prequalifications { _id, pqNumber, supplierName, scope, initialRiskBand: 'MEDIUM', regulatoryStandards, productCategories, status: 'DRAFT', initiatedBy }",
      screenshot: "state-screens/supplier-prequal-list.png" },
    { step: 2, persona: "Priya", role: "Buyer", fromState: "DRAFT", toState: "SUBMITTED",
      action: "PUT status=SUBMITTED", api: "PUT /api/supplier-prequalifications/:id", observed: "Status flips", outcome: "pass" },
    { step: 3, persona: "Priya", role: "Buyer", fromState: "SUBMITTED", toState: "UNDER_REVIEW",
      action: "PUT status=UNDER_REVIEW", api: "PUT /api/supplier-prequalifications/:id", observed: "Status flips", outcome: "pass" },
    { step: 4, persona: "Maria", role: "Lead Auditor", fromState: "UNDER_REVIEW", toState: "APPROVED",
      action: "POST decision · decision=APPROVED · decisionNotes · validUntil=+2y",
      api: "POST /api/supplier-prequalifications/:id/decision",
      observed: "Status=APPROVED · decisionAt set", outcome: "pass",
      expectedDb: "supplier-prequalifications { status: 'APPROVED', decision: 'APPROVED', decisionNotes, validUntil, decidedBy: maria._id, decisionAt }" },
  ],

  aiAssists: [
    { name: "Supplier-Intel Agent (audit-agents)", attachedToStates: ["DRAFT", "UNDER_REVIEW"], endpoint: "POST /api/ai/audit-agents/supplier-intel", where: "PQ detail · 'Check public signals'", what: "openFDA + FDA warning letters + import alerts + EMA EudraGMDP + WHO PQ; verdict = known_tenant / public_only / ambiguous / unknown", provider: "Public-data fusion (no LLM for ranking; LLM for narrative)" },
  ],

  regulatorTrace: [
    { state: "DRAFT", citations: ["ICH Q10 §2.7"], evidence: "supplierName + scope + initialRiskBand + regulatoryStandards + productCategories", records: "supplier-prequalifications" },
    { state: "UNDER_REVIEW", citations: ["21 CFR 211.84(d)(1)"], evidence: "checklist[] populated", records: "supplier-prequalifications" },
    { state: "APPROVED", citations: ["21 CFR 211.84", "ICH Q10 §2.7"], evidence: "decision=APPROVED + decisionNotes + decidedBy + decisionAt + validUntil", records: "supplier-prequalifications" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · supplier-prequal", scope: "DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED", outcome: "pass", evidence: "4/4 PASS · eqms-test-results-v2.pdf" },
  ],

  roadmap: [
    { title: "Auto-EXPIRE scheduler", note: "Cron flips status to EXPIRED when validUntil passes.", priority: "HIGH" },
    { title: "Auto-create audit request from APPROVED PQ", note: "One-click 'Schedule Full Audit' button on APPROVED PQ.", priority: "HIGH" },
    { title: "AI Supplier-Intel button on the +Start dialog", note: "Pre-fill the PQ with public signals before submission.", priority: "MEDIUM" },
    { title: "Conditions tracker module", note: "CONDITIONALLY_APPROVED PQs need ongoing tracking; today conditions are free-text.", priority: "MEDIUM" },
  ],
};
