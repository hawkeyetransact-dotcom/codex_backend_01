/**
 * Audit Request / RFQ — Feature Guide spec.
 */
export default {
  version: "1.1",
  moduleName: "Audit Request / RFQ (marketplace audit flow)",
  moduleFlag: "modules.RFQ",
  modelFile: "backend/src/models/auditRfqModel.js · auditRfqQuoteModel.js · auditRfqThreadModel.js",
  routes: ["/rfqs, /rfqs/[id], /request-audit (frontend)", "/api/rfqs, /api/audit-requests (backend)"],
  purpose: "Buyer posts an audit RFQ. Multiple auditor orgs submit quotes. Buyer shortlists + awards. Awarded quote converts into a full audit request that enters the 8-phase audit lifecycle.",
  compliance: "ICH Q10 §2.7 · ISO 19011 §5.3 · contract audit governance",
  overviewBody:
    "RFQs follow DRAFT → PUBLISHED → IN_QA → QUOTES_RECEIVED → SHORTLISTED → AWARDED → CONVERTED. Quote rows follow DRAFT → SUBMITTED → REVISED / WITHDRAWN / ACCEPTED / REJECTED. " +
    "An awarded quote auto-creates an audit-requests-master row that enters the 8-phase audit lifecycle.",

  comparison: [
    { expectation: "RFQ lifecycle (DRAFT → AWARDED → CONVERTED)", standard: "—", hawkeye: "9-state enum.", outcome: "met" },
    { expectation: "Per-auditor quote lifecycle (DRAFT → SUBMITTED → ACCEPTED/REJECTED)", standard: "—", hawkeye: "6-state enum on auditRfqQuoteModel.", outcome: "met" },
    { expectation: "Auto-numbered RFQ (RFQ-XXXXXX)", standard: "GMP", hawkeye: "Pre-save generator.", outcome: "met" },
    { expectation: "Invitations to specific auditor orgs", standard: "—", hawkeye: "invitedAuditors[] subdocument with status (INVITED / DECLINED / ACCEPTED_VIEW).", outcome: "met" },
    { expectation: "Q&A threads between buyer + auditor", standard: "—", hawkeye: "auditRfqThreadModel.", outcome: "met" },
    { expectation: "Quote line items + totals + proposed schedule", standard: "—", hawkeye: "lineItems[] + totals { subtotal, tax, total } + proposedSchedule.", outcome: "met" },
    { expectation: "Award + auto-convert to audit request", standard: "—", hawkeye: "POST /:id/award sets awardedQuoteId; downstream auto-creates audit-requests-master.", outcome: "met" },
    { expectation: "Closing date + auto-EXPIRE", standard: "—", hawkeye: "Vercel cron (03:30 UTC daily) calls /api/quality/scan-expirations → flips PUBLISHED/QUOTES_RECEIVED RFQs past closingAt to EXPIRED.", outcome: "met" },
  ],

  personas: [
    { name: "Audit Program Mgr Priya", role: "buyer", email: "audit.program@novex-pharma.demo",
      responsibilities: "Drafts RFQ, publishes, invites auditor orgs, shortlists, awards.", touches: ["DRAFT", "PUBLISHED", "SHORTLISTED", "AWARDED"] },
    { name: "Auditor (external auditor org)", role: "auditor", email: "(auditor-side login)",
      responsibilities: "Receives invite, submits quote, revises after Q&A.", touches: ["(quote) DRAFT", "SUBMITTED", "REVISED"] },
    { name: "Audit Lead Maria (auditor)", role: "auditor", email: "audit.lead@novex-pharma.demo",
      responsibilities: "Internal-tenant equivalent — submits quotes from Maria's auditor org.", touches: ["(quote) DRAFT", "SUBMITTED"] },
  ],

  features: [
    { name: "RFQ register",
      what: "Lists all RFQs with status + closingAt + invited-auditors count.",
      location: "/rfqs",
      roles: ["buyer · admin"],
      api: "GET /api/rfqs",
      steps: [
        { kind: "navigate", label: "Click 'RFQs' in the top nav", expect: "Page renders" },
      ],
      screenshot: "state-screens/rfq-list.png" },

    { name: "+ New RFQ",
      what: "Buyer drafts an RFQ.",
      location: "/rfqs · top-right '+ New RFQ'",
      roles: ["buyer"],
      api: "POST /api/rfqs",
      steps: [
        { kind: "click", label: "Click '+ New RFQ'", expect: "Form opens" },
        { kind: "type", label: "Fill title", expect: "required" },
        { kind: "click", label: "Pick supplierOrgId + siteId", expect: "required" },
        { kind: "click", label: "Pick productIds[]", expect: "" },
        { kind: "click", label: "Pick closingAt (deadline for quotes)", expect: "required" },
        { kind: "click", label: "Click 'Save draft'", expect: "Status=DRAFT · rfqNumber=RFQ-XXXXXX" },
      ] },

    { name: "Publish",
      what: "Move DRAFT → PUBLISHED so invited auditors can see it.",
      location: "RFQ row · 'Publish' button",
      roles: ["buyer"],
      api: "POST /api/rfqs/:id/publish",
      steps: [{ kind: "click", label: "Click 'Publish'", expect: "Status flips" }] },

    { name: "Invite auditors",
      what: "Add specific auditor orgs to the invited list.",
      location: "RFQ detail · 'Invite Auditors' button",
      roles: ["buyer"],
      api: "POST /api/rfqs/:id/invite",
      steps: [
        { kind: "click", label: "Click 'Invite Auditors'", expect: "Drawer with auditor org picker" },
        { kind: "click", label: "Pick auditorOrgIds[]", expect: "" },
        { kind: "click", label: "Click 'Send invitations'", expect: "Each gets status=INVITED in invitedAuditors[]; notification sent" },
      ] },

    { name: "Submit quote (auditor)",
      what: "Auditor submits a quote with line items + totals + proposed schedule.",
      location: "RFQ detail (auditor view) · '+ Submit Quote' button",
      roles: ["auditor"],
      api: "POST /api/rfqs/:id/quotes",
      steps: [
        { kind: "click", label: "Click '+ Submit Quote'", expect: "Form opens" },
        { kind: "type", label: "Fill lineItems[] (each: description + qty + unitPrice)", expect: "" },
        { kind: "type", label: "Fill totals.subtotal + tax + total", expect: "" },
        { kind: "type", label: "Fill proposedSchedule + assumptionsText", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Quote row · status=SUBMITTED · RFQ status auto → QUOTES_RECEIVED" },
      ] },

    { name: "Shortlist + Award",
      what: "Buyer narrows quotes, picks one to award.",
      location: "RFQ detail · Quotes tab · 'Shortlist' / 'Award' buttons",
      roles: ["buyer"],
      api: "PUT /api/rfqs/:id (status=SHORTLISTED) · POST /api/rfqs/:id/award (quoteId)",
      steps: [
        { kind: "click", label: "Click 'Shortlist' on the quotes you want to consider", expect: "Status=SHORTLISTED" },
        { kind: "click", label: "Click 'Award' on the winning quote", expect: "Status=AWARDED · awardedQuoteId set" },
        { kind: "wait", label: "Auto-conversion", expect: "audit-requests-master row created with rfqId link · RFQ status=CONVERTED" },
      ] },
  ],

  lifecycleIntro: "One RFQ from draft to award + auto-convert.",
  lifecycle: [
    { step: 1, persona: "Priya", role: "Buyer", fromState: "—", toState: "DRAFT",
      action: "+ New RFQ · supplier · site · products · closingAt=+30d",
      api: "POST /api/rfqs",
      observed: "rfqNumber=RFQ-XXXXXX · status=DRAFT", outcome: "pass",
      expectedDb: "audit-rfqs { _id, rfqNumber, supplierOrgId, siteId, productIds, closingAt, status: 'DRAFT', auditTrail: [] }",
      screenshot: "state-screens/rfq-list.png" },
    { step: 2, persona: "Priya", role: "Buyer", fromState: "DRAFT", toState: "PUBLISHED",
      action: "POST /publish", api: "POST /api/rfqs/:id/publish", observed: "Status flips", outcome: "pass" },
    { step: 3, persona: "Priya", role: "Buyer", fromState: "PUBLISHED", toState: "PUBLISHED (with invites)",
      action: "POST /invite · auditorOrgIds[]", api: "POST /api/rfqs/:id/invite", observed: "invitedAuditors[] populated", outcome: "pass" },
    { step: 4, persona: "Maria (auditor org)", role: "auditor", fromState: "—", toState: "(quote) SUBMITTED",
      action: "POST /quotes · lineItems · totals · schedule", api: "POST /api/rfqs/:id/quotes",
      observed: "Quote row with status=SUBMITTED", outcome: "pass",
      expectedDb: "audit-rfq-quotes { _id, rfqId, auditorOrgId, lineItems, totals, proposedSchedule, status: 'SUBMITTED' }" },
    { step: 5, persona: "(system)", role: "—", fromState: "PUBLISHED", toState: "QUOTES_RECEIVED",
      action: "Auto-fired on first quote submission", api: "—", observed: "RFQ status auto-flips to QUOTES_RECEIVED", outcome: "pass" },
    { step: 6, persona: "Priya", role: "Buyer", fromState: "QUOTES_RECEIVED", toState: "AWARDED",
      action: "POST /award · quoteId=winner", api: "POST /api/rfqs/:id/award",
      observed: "Status=AWARDED · awardedQuoteId set", outcome: "pass",
      expectedDb: "audit-rfqs { status: 'AWARDED', awardedQuoteId: maria-quote._id }" },
    { step: 7, persona: "(system)", role: "—", fromState: "AWARDED", toState: "CONVERTED",
      action: "Auto-create audit-requests-master row with rfqId link", api: "(auto)",
      observed: "audit-requests-master row created · RFQ status=CONVERTED", outcome: "pass",
      expectedDb: "audit-requests-master { rfqId, supplierId, scope, phaseState: { currentPhase: 'INITIATED' } }" },
  ],

  aiAssists: [],

  regulatorTrace: [
    { state: "PUBLISHED", citations: ["—"], evidence: "title + scope + invitedAuditors[]", records: "audit-rfqs" },
    { state: "AWARDED", citations: ["—"], evidence: "awardedQuoteId + buyer signature on award", records: "audit-rfqs + audit-rfq-quotes" },
    { state: "CONVERTED", citations: ["ISO 19011 §5.3"], evidence: "rfqId link from new audit-request to source RFQ", records: "audit-requests-master + audit-rfqs" },
  ],

  testResults: [
    { suite: "novex-walkthrough.spec.ts", scope: "/rfqs + /request-audit UI render", outcome: "pass", evidence: "09-priya.png" },
    { suite: "(deferred) eqms-lifecycle.spec.ts · rfq", scope: "Full RFQ lifecycle requires buyer + auditor org orchestration", outcome: "skip", evidence: "Not yet automated" },
  ],

  roadmap: [
    { title: "Full RFQ E2E lifecycle test", note: "buyer + auditor orchestration spec.", priority: "MEDIUM" },
    { title: "Auto-EXPIRE on closingAt", note: "Cron flips status to EXPIRED when closing date passes without award.", priority: "MEDIUM" },
    { title: "AI quote-comparison helper", note: "Side-by-side quote comparison with line-item delta + recommendation.", priority: "LOW" },
  ],
};
