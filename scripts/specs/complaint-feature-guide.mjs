/**
 * Complaint Management — Feature Guide spec.
 */
export default {
  version: "1.0",
  moduleName: "Complaint Management",
  moduleFlag: "modules.COMPLAINT_MANAGEMENT",
  modelFile: "backend/src/models/ComplaintModel.js",
  routes: ["/complaint-manager (frontend)", "/api/complaints (backend)"],
  purpose: "Capture, investigate, link to CAPA, and close customer complaints. Determine MDR (Medical Device Report) reportability. Track regulatory reporting timelines.",
  compliance: "ISO 9001:2015 §10.2 · 21 CFR 211.198 (drug complaint files) · 21 CFR 820.198 (medical device complaint files) · EU GVP",
  overviewBody:
    "Complaints follow OPEN → UNDER_INVESTIGATION → PENDING_CAPA → CAPA_IN_PROGRESS → PENDING_CLOSURE → CLOSED (or CANCELLED). " +
    "isMedicalDeviceReport flag triggers the MDR reportability assessment; requiresRegulatoryReporting gates the regulatory submission timeline. " +
    "linkedCAPAIds bridges to the CAPA-v2 workspace.",

  comparison: [
    { expectation: "Complaint types (PRODUCT_QUALITY / LABELING / PACKAGING / DELIVERY / SERVICE / SAFETY / REGULATORY / OTHER)", standard: "21 CFR 820.198", hawkeye: "complaintType enum · 8 values.", outcome: "met" },
    { expectation: "Severity (CRITICAL / MAJOR / MINOR / INFORMATIONAL)", standard: "—", hawkeye: "severity enum.", outcome: "met" },
    { expectation: "Source tagging (CUSTOMER / PATIENT / REGULATOR / DISTRIBUTOR / INTERNAL / FIELD_REPORT)", standard: "—", hawkeye: "source enum · 7 values.", outcome: "met" },
    { expectation: "MDR reportability flag", standard: "21 CFR 803", hawkeye: "isMedicalDeviceReport boolean. cross-module triggers regulatory assessment.", outcome: "met" },
    { expectation: "Regulatory reporting flag + 5-day / 30-day timer", standard: "21 CFR 803.10", hawkeye: "requiresRegulatoryReporting boolean. /api/quality/regulatory-assessment computes the deadline.", outcome: "partial", note: "Add countdown UI + reminder cron" },
    { expectation: "Investigation summary + root cause + assignee", standard: "21 CFR 820.198(d)", hawkeye: "POST /:id/investigate captures investigationSummary + rootCause + assignedTo.", outcome: "met" },
    { expectation: "Linked CAPA(s)", standard: "21 CFR 820.198(c)", hawkeye: "linkedCAPAIds[] on the model. Cross-module endpoint creates CAPA-v2 intake with sourceType=COMPLAINT.", outcome: "met" },
    { expectation: "Closure with corrective + preventive action notes", standard: "21 CFR 820.198(e)", hawkeye: "POST /:id/close captures closureNotes + correctiveAction + preventiveAction.", outcome: "met" },
    { expectation: "Auto-numbered complaint (COM-YYYY-NNNN)", standard: "GMP traceability", hawkeye: "complaintNumber pre-save generator.", outcome: "met" },
  ],

  personas: [
    { name: "James Thompson", role: "Head of QA · complaint owner", email: "qa.head@novex-pharma.demo",
      responsibilities: "Logs complaints from intake (customer service), investigates, links CAPA, closes.",
      touches: ["OPEN", "UNDER_INVESTIGATION", "PENDING_CAPA", "PENDING_CLOSURE", "CLOSED"] },
    { name: "Marcus Brown", role: "Regulatory Affairs · MDR reviewer", email: "regulatory@novex-pharma.demo",
      responsibilities: "Assesses MDR reportability for safety / patient complaints; files MDR with FDA.", touches: ["OPEN", "UNDER_INVESTIGATION"] },
    { name: "Audit Lead Maria", role: "auditor · linked-CAPA owner", email: "audit.lead@novex-pharma.demo",
      responsibilities: "Owns the CAPA spawned from the complaint.", touches: ["CAPA_IN_PROGRESS"] },
  ],

  features: [
    { name: "Complaint register",
      what: "List with severity / status / type filters + MDR + regulatory-reporting indicators.",
      location: "/complaint-manager",
      roles: ["any tenant viewer"],
      api: "GET /api/complaints",
      steps: [
        { kind: "navigate", label: "Click 'Complaints' in the top nav", expect: "Page renders" },
        { kind: "wait", label: "Spinner clears", expect: "Rows visible (empty for fresh tenant)" },
      ],
      screenshot: "state-screens/complaint-list.png" },

    { name: "+ Log Complaint dialog",
      what: "Capture a new complaint at intake.",
      location: "/complaint-manager · top-right '+ Log Complaint' button",
      roles: ["any tenant user"],
      api: "POST /api/complaints",
      steps: [
        { kind: "click", label: "Click '+ Log Complaint'", expect: "Dialog opens" },
        { kind: "type", label: "Fill title (1 sentence)", expect: "required" },
        { kind: "type", label: "Fill description (full narrative)", expect: "required" },
        { kind: "click", label: "Pick complaintType", expect: "8 enums" },
        { kind: "click", label: "Pick severity", expect: "4 enums" },
        { kind: "click", label: "Pick source", expect: "7 enums" },
        { kind: "click", label: "Tick isMedicalDeviceReport if device-related", expect: "drives MDR assessment" },
        { kind: "click", label: "Click 'Save'", expect: "Row appears with status=OPEN; complaintNumber=COM-YYYY-NNNN" },
      ],
      fields: [
        { name: "title", required: true, values: "string" },
        { name: "description", required: true, values: "multi-line" },
        { name: "complaintType", required: true, values: "PRODUCT_QUALITY | LABELING | PACKAGING | DELIVERY | SERVICE | SAFETY | REGULATORY | OTHER" },
        { name: "severity", required: true, values: "CRITICAL | MAJOR | MINOR | INFORMATIONAL" },
        { name: "source", required: true, values: "CUSTOMER | PATIENT | REGULATOR | DISTRIBUTOR | INTERNAL | FIELD_REPORT | OTHER" },
        { name: "isMedicalDeviceReport", required: false, values: "boolean", note: "default false" },
      ] },

    { name: "Investigate (OPEN → UNDER_INVESTIGATION)",
      what: "Capture investigation summary, root cause, assignee.",
      location: "Complaint row · 'Investigate' button",
      roles: ["any tenant user"],
      api: "POST /api/complaints/:id/investigate",
      steps: [
        { kind: "click", label: "Click 'Investigate'", expect: "Drawer opens" },
        { kind: "type", label: "Fill investigationSummary", expect: "required" },
        { kind: "type", label: "Fill rootCause", expect: "required" },
        { kind: "click", label: "Pick assignedTo from user dropdown", expect: "required" },
        { kind: "click", label: "Click 'Submit'", expect: "Status=UNDER_INVESTIGATION; investigationCompletedAt set" },
      ] },

    { name: "Link CAPA",
      what: "Bridge to the CAPA-v2 workspace by creating an intake with sourceType=COMPLAINT.",
      location: "Complaint row · 'Create CAPA' button",
      roles: ["any tenant user"],
      api: "POST /api/capa-v2/intakes (sourceType=COMPLAINT) · then PUT /api/complaints/:id (status=PENDING_CAPA, linkedCAPAIds += new id)",
      steps: [
        { kind: "click", label: "Click 'Create CAPA' on the row", expect: "Drawer with CAPA intake fields" },
        { kind: "type", label: "Fill issueStatement + issueDescription + severity", expect: "required" },
        { kind: "click", label: "Click 'Create + link'", expect: "CAPA-v2 intake row created; linkedCAPAIds += new id; complaint status=PENDING_CAPA" },
      ] },

    { name: "Close",
      what: "Close the complaint after investigation + (linked CAPAs) closed.",
      location: "Complaint row · 'Close' button",
      roles: ["any tenant user"],
      api: "POST /api/complaints/:id/close",
      steps: [
        { kind: "click", label: "Click 'Close'", expect: "Drawer with closureNotes + correctiveAction + preventiveAction" },
        { kind: "type", label: "Fill closureNotes (required)", expect: "required" },
        { kind: "type", label: "(Optional) correctiveAction + preventiveAction", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Status=CLOSED; closedAt + closedBy set" },
      ] },

    { name: "Cross-module · Regulatory assessment",
      what: "Compute regulatory reporting required + flags + recommended deadline.",
      location: "Complaint detail · 'Assess regulatory reporting' button",
      roles: ["any tenant user"],
      api: "POST /api/quality/regulatory-assessment",
      steps: [
        { kind: "api", label: "POST body = the full complaint object", expect: "Returns { requiresReporting, flags[], recommendedDeadlineDays, regulatoryBodies[] }" },
      ] },
  ],

  lifecycleIntro: "One complaint walked OPEN → UNDER_INVESTIGATION → CAPA-linked → CLOSED.",
  lifecycle: [
    { step: 1, persona: "James", role: "Head of QA", fromState: "—", toState: "OPEN",
      action: "+ Log Complaint → 'Chipped tablets at customer' / PRODUCT_QUALITY / MAJOR / CUSTOMER → Save",
      api: "POST /api/complaints",
      observed: "complaintNumber=COM-NNNN · status=OPEN", outcome: "pass",
      expectedDb: "complaints { _id, complaintNumber: 'COM-NNNN', title, description, complaintType: 'PRODUCT_QUALITY', severity: 'MAJOR', source: 'CUSTOMER', status: 'OPEN', reportedBy: james._id }",
      screenshot: "state-screens/complaint-list.png" },
    { step: 2, persona: "James", role: "Head of QA", fromState: "OPEN", toState: "UNDER_INVESTIGATION",
      action: "Click 'Investigate' → fill summary + rootCause + assignedTo=james → Submit",
      api: "POST /api/complaints/:id/investigate",
      observed: "Status flips · investigationCompletedAt set", outcome: "pass",
      expectedDb: "complaints { status: 'UNDER_INVESTIGATION', investigationSummary, rootCause, assignedTo, investigationCompletedAt }" },
    { step: 3, persona: "James", role: "Head of QA", fromState: "UNDER_INVESTIGATION", toState: "PENDING_CAPA",
      action: "Click 'Create CAPA' → CAPA-v2 intake created with sourceType=COMPLAINT → linked",
      api: "POST /api/capa-v2/intakes · PUT /api/complaints/:id (linkedCAPAIds, status=PENDING_CAPA)",
      observed: "linkedCAPAIds += [intakeId]; status=PENDING_CAPA", outcome: "pass",
      expectedDb: "capa-v2-intakes { sourceType: 'COMPLAINT', sourceRecordId: complaintId }\ncomplaints { status: 'PENDING_CAPA', linkedCAPAIds: [intakeId] }" },
    { step: 4, persona: "James", role: "Head of QA", fromState: "PENDING_CAPA", toState: "PENDING_CLOSURE",
      action: "(After CAPA close) PUT status=PENDING_CLOSURE", api: "PUT /api/complaints/:id", observed: "Status flips", outcome: "pass" },
    { step: 5, persona: "James", role: "Head of QA", fromState: "PENDING_CLOSURE", toState: "CLOSED",
      action: "Click 'Close' → closureNotes + correctiveAction + preventiveAction → Submit",
      api: "POST /api/complaints/:id/close",
      observed: "Status=CLOSED · closedBy + closedAt set", outcome: "pass",
      expectedDb: "complaints { status: 'CLOSED', closureNotes, correctiveAction, preventiveAction, closedBy, closedAt }" },
  ],

  aiAssists: [
    { name: "(roadmap) Complaint triage agent (Wave 3)", attachedToStates: ["OPEN"], endpoint: "(future)", where: "(future)", what: "Pattern-match complaint text against historical CAPAs + FDA MedWatch to pre-suggest severity, MDR reportability, and linked CAPAs", provider: "Free Gemini + vector retrieval" },
    { name: "Cross-module Regulatory Assessment", attachedToStates: ["OPEN"], endpoint: "POST /api/quality/regulatory-assessment", where: "(API; UI on roadmap)", what: "Returns requiresReporting + flags + recommendedDeadlineDays + regulatoryBodies", provider: "rule engine (no LLM)" },
  ],

  regulatorTrace: [
    { state: "OPEN", citations: ["21 CFR 820.198(a)", "21 CFR 211.198(a)"], evidence: "complaintNumber + title + complaintType + severity + source + reportedBy", records: "complaints" },
    { state: "UNDER_INVESTIGATION", citations: ["21 CFR 820.198(d)"], evidence: "investigationSummary + rootCause + assignedTo + investigationCompletedAt", records: "complaints" },
    { state: "PENDING_CAPA", citations: ["21 CFR 820.198(c)"], evidence: "linkedCAPAIds[]", records: "complaints + capa-v2 (linked)" },
    { state: "CLOSED", citations: ["21 CFR 820.198(e)", "21 CFR 211.198(b)"], evidence: "closureNotes + correctiveAction + preventiveAction + closedBy + closedAt", records: "complaints" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · complaint", scope: "OPEN → UNDER_INVESTIGATION → PENDING_CLOSURE → CLOSED", outcome: "pass", evidence: "4/4 PASS · eqms-test-results-v2.pdf" },
    { suite: "eqms-cross-module.spec.ts · F3", scope: "Complaint → CAPA-v2 intake (sourceType=COMPLAINT) → linked → close", outcome: "pass", evidence: "5/5 PASS · F3" },
  ],

  roadmap: [
    { title: "AI complaint triage agent", note: "Pre-suggest severity, MDR flag, similar past CAPAs.", priority: "HIGH" },
    { title: "MDR / FAR deadline countdown UI", note: "Visible counter on the row when requiresRegulatoryReporting=true. Email reminder at 80% elapsed.", priority: "HIGH" },
    { title: "FDA MedWatch eMDR submission integration", note: "Programmatic 3500A submission API.", priority: "MEDIUM" },
    { title: "Customer notification template", note: "Closure notes auto-formatted into a customer-facing letter.", priority: "LOW" },
  ],
};
