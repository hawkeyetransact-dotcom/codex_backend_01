/**
 * Audit-Only Module — Feature Guide spec.
 *
 * This is a CROSS-MODULE flow guide (not a single-module guide).
 * It maps the buyer-driven supplier-audit journey end-to-end,
 * benchmarked against THREE reference docs:
 *   1. docs/04-processes/superuser-process-flow-24steps.md   (24-step super-user process)
 *   2. docs/04-processes/gmp-audit-data-flow.md              (8-phase data flow + APIs)
 *   3. docs/04-processes/status-engine-analysis.md           (state machines + status enums)
 */
export default {
  version: "1.0",
  moduleName: "Audit-Only Module (buyer-driven supplier audit, 24-step flow)",
  moduleFlag: "modules.AUDITS",
  modelFile:
    "AuditRequestMaster · Assessment · AuditPlan · AuditAgenda · AuditSchedule · " +
    "PreAuditQuestionnaire · AuditArtifact · AssessmentFinding · AuditReport · " +
    "Capa (V1) · AssessmentCapa (V2) · MonitoringSignal · SupplierRiskMetrics · " +
    "AuditorAffiliation · AuditorQualification · SupplierPreQualification",
  routes: [
    "/buyer/marketplace, /supplier-marketplace, /rfqs, /rfqs/new, /request-audit, /audits, /audits/[id] (frontend)",
    "/api/audits/buyer, /api/audits/auditor, /api/audits/supplier, /api/audits/:id/phases, " +
    "/api/audits/:id/prep, /api/audits/:id/plan, /api/audits/:id/agenda, /api/scheduling, " +
    "/api/audits/:id/questions, /api/evidence, /api/v2/findings, /api/audits/:id/report, " +
    "/api/capas, /api/v2/capas, /api/audits/:id/close, /api/buyer/marketplace/suppliers, " +
    "/api/rfqs, /api/auditor-network, /api/monitoring (backend)",
  ],
  purpose:
    "End-to-end buyer-driven supplier audit. Buyer onboards a candidate supplier, runs a pre-qualification, optionally posts an RFQ to engage a 3rd-party auditor, schedules the audit, executes (onsite/remote), generates a report, drives CAPA closure, and monitors the supplier post-audit until the next requalification audit. Spans 24 super-user-defined process steps mapped onto an 8-phase audit lifecycle.",
  compliance:
    "ICH Q7 §17 (audit of API mfrs) · ICH Q9 (risk-based supplier qualification) · ICH Q10 §2.7 (supplier mgmt) · " +
    "21 CFR 211.84 (component qualification) · EU GMP Chapter 7 (outsourced activities) · " +
    "ISO 19011 (audit programmes) · ISO 13485 §7.4 (purchasing) · WHO TRS 957 Annex 3",
  overviewBody:
    "The audit-only module spans the full BUYER → SUPPLIER lifecycle: discover → onboard → pre-qualify → engage auditor → schedule → execute → report → CAPA → close → monitor → requalify. " +
    "It runs on TWO parallel model lineages today: V1 (AuditRequestMaster + Capa + Evidence) and V2 (Assessment + AssessmentFinding + AssessmentCapa + AssessmentEvidence). V2 stores legacyRefs.auditRequestId to bridge both. " +
    "The 8-phase lifecycle (INITIATED → PREP → SCOPE_AGENDA → SCHEDULING → EXECUTION → REPORTING → FOLLOWUP_CAPA → CLOSURE) implements the core audit. The 24-step super-user process additionally covers pre-audit (steps 1–11) and post-audit (steps 22–24) work that lives in adjacent modules (Pre-Qual, Auditor Network, Monitoring, Requalification scheduler).",

  // ---------------------------------------------------------------
  // 24-step gap matrix — direct comparison vs the super-user process.
  // expectation = the super-user step
  // standard    = the cited regulatory anchor
  // hawkeye     = what's there in the codebase (with file paths)
  // outcome     = met | partial | gap
  // ---------------------------------------------------------------
  comparison: [
    { expectation: "#01 Auditee onboarding — Non-Technical Checklist (buyer Purchase team requests onboarding)",
      standard: "ICH Q10 §2.7",
      hawkeye: "SupplierPreQualificationModel.checklist[] (PASS/FAIL/N_A items). Missing: dedicated buyer-purchase-team request form; explicit non-technical-vs-technical split.",
      outcome: "partial" },
    { expectation: "#02 Auditee Due Diligence — Technical / Primary Checklist (Buyer QA)",
      standard: "21 CFR 211.84",
      hawkeye: "SupplierPreQualificationModel.checklist[]; QualificationMethod for desk review. Missing: structured technical-checklist template; checklist-item-level evidence upload.",
      outcome: "partial" },
    { expectation: "#03 Sample procurement & feasibility / R&D trial",
      standard: "ICH Q7 §17",
      hawkeye: "Not modeled — no sample-procurement / R&D-trial entity, no PO/invoice tracking against samples, no trial-result feed into PQ decision.",
      outcome: "gap" },
    { expectation: "#04 Provisional Approval (PQ process)",
      standard: "ICH Q10 §2.7",
      hawkeye: "SupplierPreQualificationModel decision enum (APPROVED / CONDITIONALLY_APPROVED / REJECTED) + auditRequestId link auto-escalates an APPROVED PQ to a full audit request. /decision endpoint live.",
      outcome: "met" },
    { expectation: "#05 Pre-Audit Communication (formal intimation)",
      standard: "ISO 19011 §6.2",
      hawkeye: "INTIMATION_LETTER artifact type defined in PREP-phase artifact constants; auditor assignment via POST /api/audits/:id/assign-auditors. Missing: structured intimation-letter template; read-receipt tracking.",
      outcome: "partial" },
    { expectation: "#06 3rd-party auditor due diligence — COI verification + acceptance by Auditee",
      standard: "ISO 19011 §7.2 (auditor competence)",
      hawkeye: "AuditorAffiliationModel (PENDING / ACTIVE / REVOKED · INTERNAL / EXTERNAL); AuditorQualificationModel.coiDeclarations[] (declaredAt, hasConflict, conflictDetails); AuditRequestMaster.coiDeclarationSignedAt/By for per-audit sign-off.",
      outcome: "met" },
    { expectation: "#07 Audit Scheduling (multi-party slot agreement)",
      standard: "ISO 19011 §6.3",
      hawkeye: "AuditScheduleModel (status: DRAFT → PROPOSED → HELD → CONFIRMED · mode: REMOTE / ONSITE / HYBRID · multi-party constraints + timezone); /api/scheduling/:id/confirm-dates endpoint.",
      outcome: "met" },
    { expectation: "#08 Pre-Audit Documentation request (SMF, SOP list, Spec/STP, Stability, process flow)",
      standard: "21 CFR 211.84 · ICH Q7 §17.4",
      hawkeye: "AuditArtifact model with artifactType (SITE_MASTER_FILE, DRL, SOP_LIST, etc.); PREP-phase artifact defaults; POST /api/audits/:id/artifacts. Missing: structured document-request template; per-document checklist completion status.",
      outcome: "partial" },
    { expectation: "#09 Pre-Audit Questionnaire (auditor designs focus)",
      standard: "ISO 19011 §6.3",
      hawkeye: "PreAuditQuestionnaireModel (status: DRAFT → SENT → IN_PROGRESS → SUBMITTED → REVIEWED · responses[]); /api/questionnaires CRUD; AI pre-fill via POST /api/ai-prefill/:auditId.",
      outcome: "met" },
    { expectation: "#10 Audit Agenda (block-by-block plan)",
      standard: "ISO 19011 §6.4",
      hawkeye: "AuditAgendaModel (agendaBlocks[] with startAt/endAt/topic/location · attendees[] · multi-version · status: DRAFT → PROPOSED → CONFIRMED); /api/audits/:id/agenda CRUD.",
      outcome: "met" },
    { expectation: "#11 Audit Checklist — standard verification (aide-de-memoir)",
      standard: "ICH Q7 / WHO TRS 957",
      hawkeye: "AuditQuestions model + GMP_CHECKLIST artifact type. Missing: dedicated aide-de-memoir checklist model with reusable question bank; observation mapping during execution.",
      outcome: "partial" },
    { expectation: "#12 Audit Execution (onsite / offsite / hybrid)",
      standard: "ISO 19011 §6.5",
      hawkeye: "Phase-state machine tracks EXECUTION start/end; RemoteSession model supports virtual audits; /api/audits/:id/questions/:qId/response + /api/evidence + /api/audits/:id/questions/:qId/flag. Missing: real-time co-auditor collaboration; live deficiency-flagging UI on execution screen.",
      outcome: "partial" },
    { expectation: "#13 Opening Meeting (client + auditee company presentation)",
      standard: "ISO 19011 §6.4.2",
      hawkeye: "AuditAgendaModel.agendaBlocks[] schedules opening; OPENING_MEETING_MINUTES artifact type defined. Missing: opening-meeting form template; minutes-capture form; attendee sign-in.",
      outcome: "partial" },
    { expectation: "#14 Closing Meeting reporting",
      standard: "ISO 19011 §6.6",
      hawkeye: "CLOSING_MEETING_MINUTES artifact type defined under FINDINGS phase. Missing: closing-meeting form; preliminary-findings summary; auditee acknowledgment capture.",
      outcome: "partial" },
    { expectation: "#15 Facility Certification / Communication (Approved pending CAPA / Conditional / Rejected)",
      standard: "ICH Q10 §2.7",
      hawkeye: "AuditRequestMaster.facilityOutcome (SATISFACTORY / CONDITIONALLY_SATISFACTORY / UNSATISFACTORY) + facilityOutcomeSetAt/By; CLOSURE-phase artifact set.",
      outcome: "met" },
    { expectation: "#16 Deficiency Reporting (within 1 week of audit)",
      standard: "21 CFR 211.84 · ICH Q7 §17",
      hawkeye: "AssessmentFindingModel (severity / domain / status · linkedEvidenceIds); AuditReport.observations[] with severity + gmpClassification + capaResponseDeadlineDays; CAPA auto-source-ref from findings. Missing: 7-day SLA enforcement; preliminary-vs-final state.",
      outcome: "partial" },
    { expectation: "#17 Deficiency Validation / Acceptance by Supplier",
      standard: "ICH Q10 §2.7",
      hawkeye: "AuditRequestMaster.deficiencyValidation enum (PENDING / ACCEPTED / PARTIALLY_ACCEPTED / DISPUTED) + deficiencyValidationAt/By/Reason; CAPA-V2 triage decisions. Missing: line-item-level dispute UI; dispute-resolution workflow.",
      outcome: "partial" },
    { expectation: "#18 Audit Report (within 30 days of audit)",
      standard: "ICH Q7 §17.7 · ISO 19011 §6.6",
      hawkeye: "AuditReportModel (status: DRAFT → PENDING_REVIEW → APPROVED → PENDING_SIGNATURES → COMPLETED · factualAccuracyReview by supplier · reportApproval by QA · signatures[]); /api/audits/:id/report; AI report assembly via POST /api/ai/audit-agents/assemble-report. 30-day SLA not enforced at model level.",
      outcome: "met" },
    { expectation: "#19 CAPA Plan (supplier within 30 days of report)",
      standard: "21 CFR 820.100 · ICH Q10 §3.2.2",
      hawkeye: "Capa (V1) + AssessmentCapa (V2) — 7-state machine (DRAFT → NEEDS_SUPPLIER → IN_REVIEW → REWORK_REQUESTED → APPROVED → CLOSED · OVERDUE) · targetDate · actions[] with visibility · auto-source-ref from findings. Missing: 30-day SLA cron.",
      outcome: "met" },
    { expectation: "#20 Review & Acceptance / Rejection of CAPA Plan",
      standard: "21 CFR 820.100",
      hawkeye: "CAPA REWORK_REQUESTED / APPROVED transitions; CAPA-V2 approval stages + triage decisions. Missing: formal e-sig sign-off on CAPA approval; approval-authority verification.",
      outcome: "partial" },
    { expectation: "#21 Audit Closure Certification",
      standard: "ICH Q7 §17.7",
      hawkeye: "CLOSURE-phase artifact list (FINAL_REPORT, AUDIT_CLOSURE_CERTIFICATE); facilityOutcome field on AuditRequestMaster; AuditReport.status=COMPLETED. Missing: automated closure trigger when all CAPAs CLOSED; closure-form template.",
      outcome: "partial" },
    { expectation: "#22 CAPA tracking / Follow-up (per target date)",
      standard: "21 CFR 820.100(b)",
      hawkeye: "Capa.actions[] + lastActivityAt + linkedCapaIds rollup. OVERDUE status enum exists but no scheduler flips records to OVERDUE today; the cross-module overdue-scan handler covers training / MRM action items / CAPA-V2 action items / equipment but not parent CAPA records by targetDate.",
      outcome: "partial" },
    { expectation: "#23 Supplier monitoring / rating (monthly)",
      standard: "ICH Q10 §2.7 · ISO 9001 §8.4",
      hawkeye: "MonitoringSignal model (severity / status · OPEN / ACKED / RESOLVED · per-tenant/audit/site/product); SupplierRiskMetrics + SupplierRiskSnapshot models; /api/monitoring routes. Missing: monthly cron to compute supplier scorecard; rating-calculation logic; dashboard widget.",
      outcome: "partial" },
    { expectation: "#24 Follow-up / Requalification Audit Planning (yearly)",
      standard: "ICH Q10 §2.7 · ICH Q7 §17.7",
      hawkeye: "QualificationCase.requalDueDate field exists; SURVEILLANCE phase keys present in auditPhases.js with empty artifact list. No cron, no auto-create-new-AuditRequestMaster, no requalification calendar / alert.",
      outcome: "gap" },

    // Cross-cutting marketplace gap (the user's earlier callout)
    { expectation: "Buyer Marketplace journey — browse suppliers → view product/API library → start RFQ from listing",
      standard: "—",
      hawkeye: "Backend marketplace catalog scaffolded (Postgres) + buyer marketplace API (GET /api/buyer/marketplace/suppliers); /supplier-marketplace page is supplier-facing (wrong audience for buyer browse); /rfqs/new step 0 forces a manual supplier dropdown — no marketplace-driven discovery, no API library page for buyers, no public supplier-profile/product-catalog page.",
      outcome: "gap" },
  ],

  // All personas are seeded by `node scripts/seed-audit-only-users.mjs`
  // Password for ALL personas: AuditDemo@2026
  personas: [
    { name: "Karan Mehta · Buyer Purchase / SCM",
      role: "buyer · purchase",
      email: "buyer.purchase@acme-pharma.demo",
      responsibilities: "Initiates onboarding (#01), procures samples (#03), drives early commercial engagement.",
      touches: ["#01 onboarding", "#03 samples"] },
    { name: "Priya Nair · Audit Program Mgr",
      role: "buyer · QA program manager",
      email: "audit.program@acme-pharma.demo",
      responsibilities: "Owns the buyer-side audit programme: due diligence (#02, #06), pre-audit comm (#05, #08), scheduling (#07), reviews CAPA (#20), drives closure (#21), monitors (#23), schedules requal (#24).",
      touches: ["#02", "#05–#08", "#15", "#20–#24", "INITIATED", "CLOSURE"] },
    { name: "Dr Elena Vasquez · VP Quality (tenant_admin)",
      role: "tenant_admin",
      email: "vp.quality@acme-pharma.demo",
      responsibilities: "Final approval on facility certification (#15) for HIGH-risk suppliers; signs off requalification programme (#24).",
      touches: ["#15", "#21", "#24"] },
    { name: "Maria Santos · Lead Auditor (3rd-party · AuditCorp)",
      role: "auditor · lead",
      email: "audit.lead@auditcorp.demo",
      responsibilities: "Signs COI (#06), designs questionnaire & agenda (#09, #10), executes audit (#12), reports findings (#13–#16), drafts audit report (#18), reviews CAPA (#20), certifies closure (#21).",
      touches: ["#06", "#09–#21", "PLANNING", "SCHEDULING", "EXECUTION", "REPORTING", "CLOSURE"] },
    { name: "Rahul Kapoor · Co-Auditor / Reviewer",
      role: "auditor · co-auditor / reviewer",
      email: "auditor.co@auditcorp.demo",
      responsibilities: "Supports lead in execution (#12), reviews report drafts (#18).",
      touches: ["#12", "#18"] },
    { name: "Asha Sharma · Supplier QA Head (Global Pharma)",
      role: "supplier · QA contact",
      email: "qa.head@globalpharma.demo",
      responsibilities: "Receives intimation, fills pre-audit questionnaire (#09), uploads SMF/SOPs/Spec (#08), hosts audit (#12–#14), drafts CAPA plan (#19), reports CAPA progress (#22).",
      touches: ["#01 (response)", "#08", "#09", "#12–#14", "#17", "#19", "#22", "PREP", "EXECUTION", "FOLLOWUP_CAPA"] },
  ],

  // ---------------------------------------------------------------
  // Features = the 8-phase lifecycle from gmp-audit-data-flow.md +
  // marketplace-discovery + AI agents + monitoring/requalification.
  // ---------------------------------------------------------------
  features: [
    { name: "Phase 1 · INITIATED — buyer creates audit request",
      what: "Buyer creates an audit request, picks supplier + site + assessment type, assigns auditor(s).",
      location: "/request-audit, /audits, /buyer/marketplace",
      roles: ["buyer", "buyer-admin"],
      api: "POST /api/audits/buyer · POST /api/audits/:id/assign-auditors",
      steps: [
        { kind: "navigate", label: "Buyer opens '/request-audit' (or starts from /buyer/marketplace)", expect: "Form renders" },
        { kind: "type",     label: "Pick supplier (today: dropdown · ideal: from marketplace)",         expect: "Supplier resolved" },
        { kind: "type",     label: "Pick site + assessment type",                                       expect: "" },
        { kind: "click",    label: "Submit",                                                            expect: "AuditRequestMaster created · trackStatus='Request Received' · phaseState.INITIATED.status=IN_PROGRESS" },
        { kind: "click",    label: "Open audit detail · 'Assign auditors'",                             expect: "auditor_id set · auditorDecision=PENDING" },
      ] },

    { name: "Phase 2 · PREP — supplier completes pre-audit questionnaire + DRL",
      what: "Supplier fills the pre-audit questionnaire and uploads the document-requirements list (SMF, SOPs, Spec/STP, Stability, process flow). AI pre-fill optional.",
      location: "/audits/[id] · supplier-side questionnaire view",
      roles: ["supplier", "auditor"],
      api: "POST /api/audits/:id/prep/start · POST /api/questionnaires/:id/submit · POST /api/audits/:id/artifacts/:id/submit",
      aiAssist: "POST /api/ai-prefill/:auditId — Gemini pre-fills questionnaire from supplier KB.",
      steps: [
        { kind: "click", label: "Auditor sends pre-audit questionnaire",                          expect: "AuditArtifact[PRE_AUDIT_QUESTIONNAIRE].status=sent · questionnaireStatus=sent_to_supplier" },
        { kind: "type",  label: "Supplier fills questionnaire (or runs AI pre-fill, then reviews)", expect: "Responses saved" },
        { kind: "click", label: "Supplier submits",                                                 expect: "questionnaireStatus=supplier_submitted" },
        { kind: "click", label: "Supplier uploads SMF / SOP list / Spec / STP / Stability",        expect: "AuditArtifact[DRL].status=complete" },
      ] },

    { name: "Phase 3 · PLANNING (SCOPE_AGENDA) — auditor defines scope + agenda",
      what: "Auditor defines audit scope, objectives, risk summary; builds agenda blocks; routes for confirmation.",
      location: "/audits/[id] · plan + agenda tabs",
      roles: ["auditor"],
      api: "POST /api/audits/:id/plan · POST /api/audits/:id/plan/submit · POST /api/audits/:id/agenda · POST /api/audits/:id/agenda/confirm",
      steps: [
        { kind: "type",  label: "Fill scope, objectives, risk summary",                  expect: "AuditPlan.status=DRAFT" },
        { kind: "click", label: "Submit plan for approval",                              expect: "AuditPlan.status=SUBMITTED" },
        { kind: "type",  label: "Build agenda blocks (start/end/topic/location)",        expect: "AuditAgenda.status=DRAFT" },
        { kind: "click", label: "Propose to auditee + confirm",                          expect: "AuditAgenda.status=CONFIRMED · milestone AGENDA_FINALIZED=DONE" },
      ] },

    { name: "Phase 4 · SCHEDULING — confirm dates + logistics",
      what: "Confirm audit dates with all parties; capture availability; lock the slot.",
      location: "/audits/[id] · schedule tab",
      roles: ["auditor", "buyer", "supplier"],
      api: "POST /api/scheduling/:auditId · POST /api/scheduling/:auditId/confirm-dates",
      steps: [
        { kind: "type",  label: "Pick scheduledDate + mode (REMOTE/ONSITE/HYBRID)", expect: "AuditSchedule.status=PROPOSED" },
        { kind: "click", label: "All parties confirm",                              expect: "AuditSchedule.status=CONFIRMED · milestone DATES_CONFIRMED=DONE" },
      ] },

    { name: "Phase 5 · EXECUTION — auditor conducts audit, collects evidence",
      what: "Auditor executes audit (onsite/remote), responds to questions, uploads evidence, flags follow-ups.",
      location: "/audits/[id] · execution tab",
      roles: ["auditor"],
      api: "POST /api/audits/:id/questions/:qId/response · POST /api/audits/:id/questions/:qId/flag · POST /api/evidence · POST /api/v2/evidence",
      aiAssist: "POST /api/ai/wave2/draft-observation — observation suggester from cross-company audits.",
      steps: [
        { kind: "click", label: "Open execution tab · transition to EXECUTION",                                  expect: "phaseState.EXECUTION=IN_PROGRESS" },
        { kind: "type",  label: "Respond to each audit question · attach evidence files",                        expect: "AuditQuestions.responses + Evidence rows" },
        { kind: "click", label: "Flag question for follow-up (if needed)",                                       expect: "flagStatus set" },
        { kind: "click", label: "Hold closing meeting · upload CLOSING_MEETING_MINUTES",                         expect: "Milestone CLOSING_MEETING=DONE · trackStatus='Audit Completed'" },
      ] },

    { name: "Phase 6 · REPORTING (FINDINGS) — auditor drafts report",
      what: "Auditor records findings (severity + domain + linkedEvidenceIds); generates draft report; supplier does factual-accuracy review; QA approves; signatures collected.",
      location: "/audits/[id] · findings + report tabs",
      roles: ["auditor", "supplier (factual review)", "buyer-QA (approval)"],
      api: "POST /api/v2/findings · POST /api/audits/:id/report · POST /api/report-instances",
      aiAssist: "POST /api/ai/audit-agents/assemble-report — Gemini drafts narrative report from findings + evidence + ICH Q7 / WHO-GMP context.",
      steps: [
        { kind: "type",  label: "Create finding (severity, domain, description, linked evidence)", expect: "AssessmentFinding.status=OPEN" },
        { kind: "click", label: "Run AI report assembler",                                          expect: "AuditReport.status=DRAFT with rendered narrative" },
        { kind: "click", label: "Send for supplier factual-accuracy review",                       expect: "AuditReport.status=PENDING_REVIEW" },
        { kind: "click", label: "QA approves report",                                              expect: "AuditReport.status=APPROVED" },
        { kind: "click", label: "Collect signatures",                                              expect: "AuditReport.status=PENDING_SIGNATURES → COMPLETED · milestone FINAL_REPORT=DONE" },
      ] },

    { name: "Phase 7 · CAPA (FOLLOWUP_CAPA) — supplier addresses findings",
      what: "Each finding spawns a CAPA. Supplier drafts plan, submits for review, auditor approves or requests rework. CAPAs reach APPROVED → CLOSED.",
      location: "/audits/[id] · capa tab · /capa-v2",
      roles: ["supplier (plan)", "auditor (review)", "buyer (close-out)"],
      api: "POST /api/capas · PATCH /api/capas/:id/status · POST /api/v2/capas · PATCH /api/v2/capas/:id/status",
      aiAssist: "POST /api/ai/capa/rca-draft — RCA drafter (5-Whys / fishbone) helps supplier author plan.",
      steps: [
        { kind: "click", label: "Auditor creates CAPA from finding",                            expect: "Capa.status=DRAFT → NEEDS_SUPPLIER" },
        { kind: "type",  label: "Supplier drafts plan (RCA, action items, target dates)",      expect: "actions[] populated" },
        { kind: "click", label: "Supplier submits plan",                                        expect: "Capa.status=IN_REVIEW" },
        { kind: "click", label: "Auditor approves (or requests rework)",                        expect: "Capa.status=APPROVED (or REWORK_REQUESTED → IN_REVIEW)" },
        { kind: "click", label: "Buyer verifies completion",                                    expect: "Capa.status=CLOSED" },
      ] },

    { name: "Phase 8 · CLOSURE — buyer signs off, audit closed",
      what: "Buyer reviews everything, assigns final compliance classification (NAI / VAI / OAI), signs report, closes audit.",
      location: "/audits/[id] · closure tab",
      roles: ["buyer"],
      api: "POST /api/audits/:id/report/sign · POST /api/audits/:id/close",
      steps: [
        { kind: "click", label: "Sign report",                                            expect: "signatures[] appended" },
        { kind: "click", label: "Set facility outcome (SATISFACTORY / CONDITIONAL / UNSAT)", expect: "facilityOutcome set" },
        { kind: "click", label: "Close audit",                                            expect: "trackStatus='Audit Closed' · all phaseState COMPLETED · AUDIT_CLOSURE_CERTIFICATE artifact" },
      ] },

    // --- Cross-cutting features that the 24-step process needs ---

    { name: "Buyer Marketplace journey (browse → profile → start RFQ)",
      what: "Buyer browses an aggregated marketplace of suppliers, opens a supplier profile (sites + product catalog + audit history + risk), starts an RFQ or audit-request from the listing.",
      location: "/buyer/marketplace, /supplier-marketplace, /rfqs/new",
      roles: ["buyer"],
      api: "GET /api/buyer/marketplace/suppliers · GET /api/buyer/marketplace/suppliers/:id/sites · POST /api/rfqs",
      gap: "Backend marketplace catalog is scaffolded (Postgres + buyer marketplace API) but no buyer-facing marketplace UI exists. /supplier-marketplace page is supplier-facing. RFQ creation forces manual supplier pick — no 'browse marketplace' link. No buyer-facing API library page.",
      steps: [
        { kind: "navigate", label: "(today) Buyer goes straight to /rfqs/new and types supplier name",  expect: "Manual dropdown — no marketplace browse" },
        { kind: "navigate", label: "(needed) Buyer browses /buyer/marketplace · filters by API/category", expect: "Listing of onboarded + public suppliers" },
        { kind: "click",    label: "(needed) Opens supplier profile · sees product catalog + audit history", expect: "Profile + catalog drawer" },
        { kind: "click",    label: "(needed) Click 'Start RFQ' from supplier profile",                    expect: "RFQ pre-filled with supplier + site" },
      ] },

    { name: "Auditor Network — engage 3rd-party auditor (COI verification + acceptance)",
      what: "Buyer browses auditor pool, invites auditor, auditor signs COI declaration, buyer accepts, audit links to auditor org.",
      location: "/auditor-network · /audits/[id] · auditor tab",
      roles: ["buyer", "auditor"],
      api: "GET /api/auditor-network · POST /api/audits/:id/assign-auditors · POST /api/auditor/coi-declaration",
      steps: [
        { kind: "click", label: "Buyer browses auditor pool",                  expect: "AuditorAffiliation[ACTIVE] list" },
        { kind: "click", label: "Buyer invites auditor",                       expect: "AuditorAffiliation.status=PENDING for that audit" },
        { kind: "type",  label: "Auditor signs COI declaration",               expect: "AuditorQualification.coiDeclarations[] entry · coiDeclarationSignedAt set" },
        { kind: "click", label: "Buyer accepts auditor",                       expect: "AuditRequestMaster.auditor_id set · auditorDecision=ACCEPTED" },
      ] },

    { name: "AI · Pre-Audit Questionnaire pre-fill (Gemini)",
      what: "AI pre-fills the supplier's questionnaire from supplier KB + ICH Q7 context. Supplier reviews + edits + submits.",
      location: "/audits/[id] · prep tab · 'AI pre-fill' button",
      roles: ["supplier"],
      api: "POST /api/ai-prefill/:auditId",
      aiAssist: "Gemini Flash-Lite · structured-output · KB-grounded.",
      steps: [
        { kind: "click", label: "Click 'AI pre-fill'",          expect: "Suggested answers populated · supplier reviews each one" },
        { kind: "click", label: "Supplier accepts / edits / submits", expect: "PreAuditQuestionnaire.status=SUBMITTED" },
      ] },

    { name: "AI · Supplier-Intel agent (public-data fusion)",
      what: "Pull openFDA + FDA warning letters + import alerts + EMA EudraGMDP + WHO PQ for the supplier; verdict (known_tenant / public_only / ambiguous / unknown).",
      location: "/audits/[id] · 'Check public signals' · /supplier-prequalification (also)",
      roles: ["any tenant user"],
      api: "POST /api/ai/audit-agents/supplier-intel",
      aiAssist: "Public-data fusion · LLM for narrative.",
      steps: [
        { kind: "click", label: "Click 'Check public signals'",  expect: "Drawer opens" },
        { kind: "wait",  label: "Wait ~3-5s for public-data fusion", expect: "openFDA + warning letters + import alerts + verdict shown" },
      ] },

    { name: "AI · Audit Report assembler",
      what: "Gemini drafts the audit report narrative from findings + evidence + ICH Q7 / WHO-GMP standards.",
      location: "/audits/[id] · report tab · 'AI assemble report' button",
      roles: ["auditor"],
      api: "POST /api/ai/audit-agents/assemble-report",
      aiAssist: "Gemini Flash-Lite · KB-grounded · factual-citation footnotes.",
      steps: [
        { kind: "click", label: "Click 'AI assemble report'",   expect: "Draft narrative populated" },
        { kind: "click", label: "Auditor reviews + saves",      expect: "AuditReport.status=DRAFT" },
      ] },

    { name: "AI · Observation drafter (Wave-2)",
      what: "During execution, auto-suggest observation wording from similar findings across other audits.",
      location: "/audits/[id] · execution tab · per-question 'AI suggest' button",
      roles: ["auditor"],
      api: "POST /api/ai/wave2/draft-observation",
      aiAssist: "Cross-tenant retrieval (anonymized) + LLM rewrite.",
      steps: [
        { kind: "click", label: "Click 'AI suggest observation'", expect: "Suggested wording shown" },
      ] },

    { name: "AI · CAPA RCA drafter",
      what: "Draft a 5-Whys / fishbone RCA for a CAPA from the finding text.",
      location: "/audits/[id] · capa tab · 'AI draft RCA' button",
      roles: ["supplier"],
      api: "POST /api/ai/capa/rca-draft",
      steps: [
        { kind: "click", label: "Click 'AI draft RCA'", expect: "RCA scaffold populated" },
      ] },

    { name: "Supplier monitoring (post-closure)",
      what: "After audit closure, the supplier is monitored for adverse signals (FDA warning letters, recalls, complaints, expiring certs). Signals raised against supplier/audit/site/product.",
      location: "/buyer/suppliers/[id]/risk · /monitoring",
      roles: ["buyer-QA"],
      api: "GET /api/monitoring · POST /api/monitoring/ack",
      gap: "Monthly cadence trigger missing. SupplierRiskMetrics + SupplierRiskSnapshot models exist but no scheduler computes monthly scorecards. No supplier-rating dashboard widget.",
      steps: [
        { kind: "navigate", label: "Open buyer supplier risk view", expect: "Risk metrics + open monitoring signals" },
      ] },

    { name: "Requalification audit planning (yearly)",
      what: "When a supplier's qualification approaches its requalDueDate, automatically alert the buyer + scaffold a new surveillance audit request linked to the previous one.",
      location: "/audits · '(needed) Requalification calendar'",
      roles: ["buyer-QA", "tenant_admin"],
      api: "(needed) GET /api/audits/requalification-due · POST /api/audits/buyer (with surveillance template)",
      gap: "QualificationCase.requalDueDate field exists but no cron job to fire alerts; no auto-create-new-audit; SURVEILLANCE phase keys present in auditPhases.js but artifact list is empty; no requalification calendar view.",
      steps: [
        { kind: "navigate", label: "(needed) Buyer opens requalification calendar", expect: "List of suppliers due for re-audit in next 90 days" },
      ] },
  ],

  lifecycleIntro:
    "One supplier walked end-to-end from initial onboarding (#01) through audit closure (#21) — covering the 8 phases of the data-flow doc, mapped onto the 24 super-user steps.",

  lifecycle: [
    { step: 1, persona: "Karan",  role: "Buyer Purchase",      fromState: "—",                   toState: "PQ DRAFT",
      action: "Initiates onboarding (#01) → creates Supplier Pre-Qual record (initialRiskBand=MEDIUM, scope, regulatoryStandards).",
      api: "POST /api/supplier-prequalifications", observed: "PQ-YYYY-NNNN created · status=DRAFT",
      outcome: "pass",
      expectedDb: "supplier-prequalifications { _id, pqNumber, supplierName, scope, initialRiskBand, status: 'DRAFT', initiatedBy }" },

    { step: 2, persona: "Asha",   role: "Supplier QA",          fromState: "PQ DRAFT",            toState: "PQ SUBMITTED",
      action: "Fills technical checklist (#02) + uploads cert documents.",
      api: "PUT /api/supplier-prequalifications/:id (status=SUBMITTED)", observed: "Status flips · checklist[] populated", outcome: "pass" },

    { step: 3, persona: "Priya",  role: "Buyer QA",             fromState: "PQ SUBMITTED",        toState: "PQ APPROVED",
      action: "Reviews + decides (#04 Provisional Approval).",
      api: "POST /api/supplier-prequalifications/:id/decision", observed: "decision=APPROVED · validUntil=+2y · auditRequestId field ready to bind", outcome: "pass" },

    { step: 4, persona: "Priya",  role: "Buyer QA",             fromState: "(none)",              toState: "AUDIT INITIATED",
      action: "Creates audit request from approved PQ (#05 Pre-Audit Communication, #06 COI, #07 Scheduling).",
      api: "POST /api/audits/buyer · POST /api/audits/:id/assign-auditors", observed: "AuditRequestMaster created · phaseState.INITIATED=IN_PROGRESS · INTIMATION_LETTER artifact created · auditor_id set · auditorDecision=PENDING",
      outcome: "pass",
      expectedDb: "auditrequestmasters { _id, supplier_id, auditor_id, site_id, assessmentTypeId, trackStatus:'Request Received', questionnaireStatus:'request_received', auditorDecision:'PENDING', supplierDecision:'PENDING', phaseState:{ INITIATED:{status:'IN_PROGRESS'} } }" },

    { step: 5, persona: "Maria",  role: "Lead Auditor",         fromState: "AUDIT INITIATED",     toState: "PREP",
      action: "Signs COI (#06) · sends pre-audit questionnaire (#08, #09).",
      api: "POST /api/auditor/coi-declaration · POST /api/audits/:id/prep/start · POST /api/audits/:id/artifacts (PRE_AUDIT_QUESTIONNAIRE) · POST /api/audits/:id/artifacts/:id/send",
      observed: "AuditorQualification.coiDeclarations[] entry · phaseState.PREP=IN_PROGRESS · questionnaireStatus=sent_to_supplier", outcome: "pass" },

    { step: 6, persona: "Asha",   role: "Supplier QA",          fromState: "PREP",                toState: "PREP COMPLETE",
      action: "Uploads SMF / SOPs / Spec / STP / Stability (#08) · fills questionnaire with optional AI pre-fill (#09) · submits.",
      api: "POST /api/ai-prefill/:auditId · POST /api/questionnaires/:id/submit · POST /api/audits/:id/artifacts/:id/submit",
      observed: "AuditArtifact[DRL].status=complete · PreAuditQuestionnaire.status=SUBMITTED · questionnaireStatus=supplier_submitted", outcome: "pass" },

    { step: 7, persona: "Maria",  role: "Lead Auditor",         fromState: "PREP COMPLETE",       toState: "PLANNING (SCOPE_AGENDA)",
      action: "Defines scope + objectives + risk summary (#11 Audit Checklist) · builds agenda (#10) · proposes + confirms.",
      api: "POST /api/audits/:id/plan/submit · POST /api/audits/:id/agenda/confirm",
      observed: "AuditPlan.status=APPROVED · AuditAgenda.status=CONFIRMED · milestone AGENDA_FINALIZED=DONE · phaseState.SCOPE_AGENDA=COMPLETED", outcome: "pass" },

    { step: 8, persona: "Maria",  role: "Lead Auditor",         fromState: "PLANNING",             toState: "SCHEDULING DONE",
      action: "Confirms dates + mode (#07 finalised).",
      api: "POST /api/scheduling/:auditId/confirm-dates",
      observed: "AuditSchedule.status=CONFIRMED · milestone DATES_CONFIRMED=DONE", outcome: "pass" },

    { step: 9, persona: "Maria + Rahul", role: "Auditors",       fromState: "SCHEDULING DONE",     toState: "EXECUTION",
      action: "Run audit (#12) · opening meeting (#13) · respond to questions + upload evidence · closing meeting (#14).",
      api: "POST /api/audits/:id/questions/:qId/response · POST /api/evidence · POST /api/audits/:id/artifacts (CLOSING_MEETING_MINUTES)",
      observed: "AuditQuestions responses filled · Evidence rows · trackStatus='Audit Completed' · milestone CLOSING_MEETING=DONE", outcome: "pass" },

    { step: 10, persona: "Maria", role: "Lead Auditor",         fromState: "EXECUTION",            toState: "REPORTING",
      action: "Records findings (#16 Deficiency Reporting) · runs AI report assembler · supplier reviews factual accuracy (#17) · QA approves · signatures.",
      api: "POST /api/v2/findings · POST /api/ai/audit-agents/assemble-report · POST /api/audits/:id/report",
      observed: "AssessmentFinding rows · AuditReport.status=DRAFT → PENDING_REVIEW → APPROVED → COMPLETED · milestone FINAL_REPORT=DONE", outcome: "pass" },

    { step: 11, persona: "Asha",  role: "Supplier QA",          fromState: "REPORTING",            toState: "FOLLOWUP_CAPA",
      action: "Drafts CAPA plan per finding (#19) — uses AI RCA drafter — submits.",
      api: "POST /api/v2/capas · POST /api/ai/capa/rca-draft · PATCH /api/v2/capas/:id/status (IN_REVIEW)",
      observed: "AssessmentCapa rows · status=IN_REVIEW · actions[] populated", outcome: "pass" },

    { step: 12, persona: "Maria", role: "Lead Auditor",         fromState: "CAPA IN_REVIEW",       toState: "CAPA APPROVED → CLOSED",
      action: "Reviews + approves CAPAs (#20) · buyer verifies + closes (#21).",
      api: "PATCH /api/v2/capas/:id/status (APPROVED → CLOSED)",
      observed: "All AssessmentCapa rows CLOSED", outcome: "pass" },

    { step: 13, persona: "Priya", role: "Buyer QA",             fromState: "CAPA CLOSED",          toState: "AUDIT CLOSED",
      action: "Sets facility outcome (#15) · signs report · closes audit (#21).",
      api: "POST /api/audits/:id/report/sign · POST /api/audits/:id/close",
      observed: "facilityOutcome=SATISFACTORY · trackStatus='Audit Closed' · all phaseState COMPLETED · AUDIT_CLOSURE_CERTIFICATE artifact",
      outcome: "pass",
      expectedDb: "auditrequestmasters { facilityOutcome:'SATISFACTORY', facilityOutcomeSetAt, facilityOutcomeSetBy, trackStatus:'Audit Closed', high_status:5, complianceStatus:'complient', phaseState:{ all phases:'COMPLETED' } }" },

    { step: 14, persona: "Priya", role: "Buyer QA",             fromState: "AUDIT CLOSED",         toState: "MONITORING",
      action: "Supplier moves to monitoring (#23) — risk metrics + adverse-signal feed running.",
      api: "(automatic) MonitoringSignal subscriptions live · SupplierRiskMetrics snapshots running",
      observed: "MonitoringSignal rows when public-data scanner finds adverse signals",
      outcome: "partial — monthly scorecard cron not yet wired" },

    { step: 15, persona: "Priya", role: "Buyer QA",             fromState: "MONITORING",           toState: "REQUALIFICATION DUE (yearly)",
      action: "(needed) Requalification scheduler fires when QualificationCase.requalDueDate passes; auto-creates surveillance audit (#24).",
      api: "(needed) cron → POST /api/audits/buyer with surveillance template",
      observed: "—",
      outcome: "gap — no scheduler today" },
  ],

  aiAssists: [
    { name: "Pre-Audit Questionnaire Pre-fill", attachedToStates: ["PREP"], endpoint: "POST /api/ai-prefill/:auditId", where: "/audits/[id] · prep tab · 'AI pre-fill'", what: "Gemini pre-fills supplier questionnaire from supplier KB + ICH Q7", provider: "Gemini Flash-Lite (free tier)" },
    { name: "Supplier-Intel Agent", attachedToStates: ["INITIATED", "PREP"], endpoint: "POST /api/ai/audit-agents/supplier-intel", where: "/audits/[id] · /supplier-prequalification", what: "Public-data fusion — openFDA + FDA WLs + EU EudraGMDP + WHO PQ + verdict", provider: "Public-data fusion + LLM narrative" },
    { name: "Audit Report Assembler", attachedToStates: ["REPORTING"], endpoint: "POST /api/ai/audit-agents/assemble-report", where: "/audits/[id] · report tab · 'AI assemble report'", what: "Drafts narrative report from findings + evidence + ICH Q7 / WHO-GMP", provider: "Gemini Flash-Lite (free tier)" },
    { name: "Observation Drafter (Wave-2)", attachedToStates: ["EXECUTION"], endpoint: "POST /api/ai/wave2/draft-observation", where: "/audits/[id] · execution tab · per-question 'AI suggest'", what: "Suggests observation wording from cross-company anonymized findings", provider: "Cross-tenant retrieval + LLM rewrite" },
    { name: "CAPA RCA Drafter", attachedToStates: ["FOLLOWUP_CAPA"], endpoint: "POST /api/ai/capa/rca-draft", where: "/audits/[id] · capa tab · 'AI draft RCA'", what: "5-Whys / fishbone scaffold from finding text", provider: "Gemini Flash-Lite (free tier)" },
    { name: "Autofill Form (generic)", attachedToStates: ["PREP", "PLANNING"], endpoint: "POST /api/ai/audit-agents/autofill-form", where: "auditor + supplier forms", what: "Generic structured-form filler", provider: "Gemini Flash-Lite (free tier)" },
  ],

  regulatorTrace: [
    { state: "PRE_QUAL", citations: ["ICH Q10 §2.7", "21 CFR 211.84"], evidence: "SupplierPreQualification.checklist[] + decision + decidedBy + decisionAt + validUntil", records: "supplier-prequalifications" },
    { state: "INITIATED", citations: ["ISO 19011 §6.2"], evidence: "AuditRequestMaster created · INTIMATION_LETTER artifact · auditor_id assigned", records: "audit-requests-master, audit-artifacts" },
    { state: "PREP", citations: ["ICH Q7 §17.4"], evidence: "PreAuditQuestionnaire SUBMITTED · DRL artifacts complete (SMF, SOPs, Spec/STP, Stability)", records: "pre-audit-questionnaires, audit-artifacts" },
    { state: "PLANNING", citations: ["ISO 19011 §6.4"], evidence: "AuditPlan APPROVED · AuditAgenda CONFIRMED", records: "audit-plans, audit-agendas" },
    { state: "SCHEDULING", citations: ["ISO 19011 §6.3"], evidence: "AuditSchedule CONFIRMED · DATES_CONFIRMED milestone DONE", records: "audit-schedules, workflow-milestone-instances" },
    { state: "EXECUTION", citations: ["ISO 19011 §6.5", "ICH Q7 §17"], evidence: "AuditQuestions responses + Evidence + CLOSING_MEETING_MINUTES artifact", records: "audit-questions, evidences, assessment-evidences" },
    { state: "REPORTING", citations: ["ISO 19011 §6.6", "ICH Q7 §17.7"], evidence: "AssessmentFinding rows · AuditReport COMPLETED with signatures[]", records: "assessment-findings, audit-reports" },
    { state: "FOLLOWUP_CAPA", citations: ["21 CFR 820.100", "ICH Q10 §3.2.2"], evidence: "AssessmentCapa rows reach APPROVED → CLOSED · actions[]", records: "capas, assessment-capas" },
    { state: "CLOSURE", citations: ["ICH Q7 §17.7", "ICH Q10 §2.7"], evidence: "facilityOutcome set · AuditReport COMPLETED · AUDIT_CLOSURE_CERTIFICATE artifact", records: "audit-requests-master, audit-reports, audit-artifacts" },
    { state: "MONITORING", citations: ["ICH Q10 §2.7", "ISO 9001 §8.4"], evidence: "MonitoringSignal rows · SupplierRiskMetrics snapshots", records: "monitoring-signals, supplier-risk-metrics, supplier-risk-snapshots" },
  ],

  testResults: [
    { suite: "audit-lifecycle.spec.ts", scope: "INITIATED → PREP → PLANNING → SCHEDULING → EXECUTION → REPORTING → FOLLOWUP_CAPA → CLOSURE", outcome: "pass", evidence: "8/8 phases · v2 + v1 lineage · audit-test-results.pdf" },
    { suite: "pre-qual-lifecycle.spec.ts", scope: "PQ DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED + auto-link to audit", outcome: "pass", evidence: "4/4 PASS" },
    { suite: "auditor-coi.spec.ts", scope: "Auditor COI declaration + acceptance", outcome: "pass", evidence: "covered" },
    { suite: "rfq-lifecycle.spec.ts", scope: "RFQ DRAFT → AWARDED → CONVERTED to audit-requests-master", outcome: "pass", evidence: "covered" },
    { suite: "buyer-marketplace.spec.ts", scope: "buyer browses suppliers → opens profile → starts RFQ", outcome: "missing", evidence: "no UI today" },
    { suite: "requalification-scheduler.spec.ts", scope: "yearly auto-trigger of surveillance audit", outcome: "missing", evidence: "no scheduler today" },
  ],

  // Roadmap = the GAPs ranked by buyer impact
  roadmap: [
    { title: "Buyer Marketplace UI (browse → profile → product/API library → start RFQ)",
      note: "Backend marketplace catalog + buyer-marketplace API exist. Build /buyer/marketplace listing, supplier-profile page (sites + product catalog + audit history + risk), API library page, and 'Browse Marketplace' link on /rfqs/new step 0.",
      priority: "HIGH" },
    { title: "Requalification / Surveillance auto-scheduler (#24)",
      note: "Vercel cron daily → scans QualificationCase.requalDueDate; T-90 alert; T-0 auto-creates surveillance AuditRequestMaster from previous audit + scope template.",
      priority: "HIGH" },
    { title: "Supplier scorecard / monthly rating (#23)",
      note: "Vercel cron monthly → computes SupplierRiskMetrics snapshot from MonitoringSignal + audit outcomes + CAPA on-time rate; dashboard widget on /buyer/suppliers/[id].",
      priority: "HIGH" },
    { title: "Sample procurement / R&D trial workflow (#03)",
      note: "New SampleProcurement model + UI (PO ref, lot, R&D trial result, link back to PQ decision). Today this is paper / email.",
      priority: "HIGH" },
    { title: "CAPA target-date OVERDUE scheduler (#22)",
      note: "Extend overdueScanService to flip parent Capa / AssessmentCapa records to OVERDUE when targetDate passes; notification-outbox alert; surface on supplier + buyer dashboard.",
      priority: "MEDIUM" },
    { title: "Opening + closing meeting forms (#13, #14)",
      note: "Structured meeting-minutes form with attendee sign-in + preliminary-findings summary; auditee acknowledgment capture.",
      priority: "MEDIUM" },
    { title: "Aide-de-memoir checklist model (#11)",
      note: "Reusable GMP checklist library (per ICH Q7 / WHO TRS 957) with question bank · clone-into-audit + observation mapping.",
      priority: "MEDIUM" },
    { title: "Per-document checklist completion status (#08)",
      note: "Per-DRL-item completion status (sent / received / accepted / rejected) instead of one artifact-level status.",
      priority: "MEDIUM" },
    { title: "30-day SLA enforcement on audit report + CAPA plan (#18, #19)",
      note: "Cron-flagged OVERDUE state on AuditReport.status if no PENDING_SIGNATURES within 30 d of EXECUTION close; same for CAPA plan submission.",
      priority: "MEDIUM" },
    { title: "Line-item deficiency dispute UI (#17)",
      note: "Dispute model already exists (deficiencyValidation enum). Add per-finding dispute drawer + resolution workflow.",
      priority: "LOW" },
    { title: "Formal e-signature on CAPA approval (#20)",
      note: "Wire requireESignature middleware on CAPA APPROVED transition (parallel to deviation closure).",
      priority: "LOW" },
    { title: "Centralized StatusTransitionEngine",
      note: "Per status-engine-analysis.md: 131+ direct .status= mutations across 20+ controllers. Build centralized engine for validation + audit-trail consistency.",
      priority: "LOW" },
  ],
};
