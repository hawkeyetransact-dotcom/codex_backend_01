/**
 * Build the EQMS Process-Flow Analysis document (v2.0).
 *
 * Per-module sections cover:
 *   - state machine (every legal transition)
 *   - persona × action × API × screen matrix
 *   - required input per transition
 *   - AI assists wired to the module
 *   - compliance citations
 *
 * Output:
 *   docs/04-processes/eqms-process-flows-v2.html
 *   docs/04-processes/eqms-process-flows-v2.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const outHtml = path.join(repo, "docs/04-processes/eqms-process-flows-v2.html");
const outPdf  = path.join(repo, "docs/04-processes/eqms-process-flows-v2.pdf");
fs.mkdirSync(path.dirname(outHtml), { recursive: true });

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const VERSION = "2.1";
const REVISED = "2026-04-24";
const REVISED_BY = "Hawkeye Engineering";
const REVISION_NOTE = "Extends v2.0 (5 modules) to v2.1 (14 modules) — adds Training, Change Control, Complaints, Internal Audit, Batch Records, Equipment/Calibration, Supplier Pre-Qualification, Audit Request/RFQ, Design Control.";

// ─── Module specs ───────────────────────────────────────────────────────
const modules = [
  // ───────────── 1. DEVIATION ─────────────
  {
    n: 1, key: "deviation",
    title: "Deviation / Non-Conformance",
    iso: "ISO 9001:2015 §10.2 · 21 CFR 211.192 · ICH Q10 §3.2.3",
    purpose: "Capture, investigate, disposition and close any planned or unplanned deviation from a specification, SOP, batch record, or quality system requirement. Drive CAPA when systemic.",
    model: { file: "backend/src/models/DeviationModel.js", collection: "deviations", numbering: "DEV-YYYY-NNNN" },
    classifications: ["CRITICAL", "MAJOR", "MINOR"],
    states: [
      { state: "REPORTED",            owner: "QA Specialist (admin)", description: "Initial intake; raised by detector via 'Report Deviation' dialog. Captures title, description, classification, type, category, area, processStep, productName, batchNumbers, immediateActions." },
      { state: "UNDER_ASSESSMENT",    owner: "QA Specialist / Head of QA", description: "Impact assessment under way: product quality, patient safety, batch disposition, regulatory impact." },
      { state: "UNDER_INVESTIGATION", owner: "QA Specialist / SME",   description: "Root-cause analysis. Method may be 5-Why / Fishbone / FMEA / FTA. AI 5-Why scaffolder available." },
      { state: "PENDING_DISPOSITION", owner: "Head of QA",            description: "RCA complete; awaiting batch disposition decision (RELEASE / REJECT / REWORK / REPROCESS / QUARANTINE)." },
      { state: "PENDING_CAPA_DECISION", owner: "Head of QA",          description: "Disposition done; deciding whether systemic CAPA is required." },
      { state: "CAPA_REQUIRED",       owner: "QA / CAPA Owner",        description: "CAPA required and being created (auto via cross-module service or linked manually)." },
      { state: "PENDING_CLOSURE",     owner: "Head of QA / VP Quality", description: "All actions closed; final review before formal closure." },
      { state: "CLOSED",              owner: "VP Quality (tenant_admin)", description: "Terminal. closedBy + closedAt + closureNotes captured. Triggers e-sig if configured." },
      { state: "CANCELLED",           owner: "Head of QA",            description: "Terminal. Raised in error; cancel reason captured." },
    ],
    transitions: [
      { from: "REPORTED",                     to: "UNDER_ASSESSMENT",    api: "POST /api/deviations/:id/assess",          required: "productQualityImpact, patientSafetyImpact, batchDisposition, regulatoryImpact", roles: "EDITOR_ROLES (admin/buyer/auditor/tenant_admin/inspector/workflow_manager/superadmin)", button: "Assess" },
      { from: "REPORTED|UNDER_ASSESSMENT",    to: "UNDER_INVESTIGATION", api: "POST /api/deviations/:id/investigate",     required: "method, summary, rootCause, rootCauseCategory", roles: "EDITOR_ROLES", button: "Investigate" },
      { from: "UNDER_INVESTIGATION",          to: "PENDING_DISPOSITION", api: "POST /api/deviations/:id/investigate (with rootCause)", required: "rootCause set", roles: "EDITOR_ROLES", button: "Investigate (sets rootCause)" },
      { from: "PENDING_DISPOSITION",          to: "PENDING_CAPA_DECISION", api: "POST /api/deviations/:id/dispose",       required: "decision, justification", roles: "EDITOR_ROLES", button: "Dispose" },
      { from: "PENDING_CAPA_DECISION",        to: "CAPA_REQUIRED|PENDING_CLOSURE", api: "POST /api/deviations/:id/capa-decision", required: "capaRequired (bool); optional autoCreateCapa", roles: "EDITOR_ROLES", button: "(decision drawer)" },
      { from: "CAPA_REQUIRED|PENDING_CLOSURE", to: "CLOSED",             api: "POST /api/deviations/:id/close",           required: "closureNotes", roles: "EDITOR_ROLES", button: "Close" },
      { from: "(any)",                        to: "CANCELLED",           api: "DELETE /api/deviations/:id (soft)",        required: "n/a", roles: "EDITOR_ROLES", button: "Cancel" },
    ],
    aiAssists: [
      { name: "5-Why Scaffolder (Wave 1)", endpoint: "POST /api/ai/deviation/scaffold-five-why", attachedTo: "UNDER_INVESTIGATION", inUI: "View+AI drawer · 'Scaffold 5-why with AI' popover", description: "Generates a 5-level why chain with citations + 6M (Man/Machine/Method/Material/Measurement/Environment) categorisation. Free Gemini." },
      { name: "CAPA RCA Drafter (Wave 1)", endpoint: "POST /api/ai/capa/draft-rca", attachedTo: "UNDER_INVESTIGATION → CAPA_REQUIRED", inUI: "View+AI drawer · 'Draft CAPA RCA' drawer", description: "Drafts severity + RCA + corrective/preventive actions + effectiveness plan. User edits + e-signs before saving." },
      { name: "Predictive CAPA badge (Wave 3)", endpoint: "POST /api/ai/predict/capa-outcome", attachedTo: "PENDING_CAPA_DECISION", inUI: "View+AI drawer (auto-renders)", description: "Heuristic prediction P(on-time) + P(effective) + top contributing factors." },
      { name: "Signal cluster detector (Wave 3)", endpoint: "GET /api/ai/signals?status=open", attachedTo: "all states (post-create)", inUI: "Head-of-QA dashboard", description: "Z-score trend detection on equipment / material / process clusters." },
    ],
    closure: "CLOSED requires (a) status set via /close, (b) closureNotes captured, (c) closedBy + closedAt set. If CAPA was required, the linked CAPAs must also reach CLOSED_EFFECTIVE before the deviation is permanently closed.",
    screens: [
      { route: "/nonconformance", purpose: "List + report + lifecycle actions" },
      { route: "/nonconformance (View+AI drawer)", purpose: "Detail + AI 5-Why + Draft CAPA RCA + Predictive badge" },
    ],
  },

  // ───────────── 2. CAPA ─────────────
  {
    n: 2, key: "capa",
    title: "CAPA — Corrective & Preventive Action (v2)",
    iso: "ISO 9001:2015 §10.2 · 21 CFR 211.192 · ICH Q10 §3.2.2",
    purpose: "Formalise root-cause investigation + corrective + preventive actions for a quality issue. Track effectiveness to closure. Enforce 5-stage approval gates (Triage / RCA / Action Plan / Effectiveness / Closure).",
    model: { file: "backend/src/models/capaV2Models.js", collection: "capa-v2 + 16 child collections", numbering: "CAPA-YYYY-NNNN" },
    states: [
      { state: "DRAFT_CANDIDATE",                 owner: "QA / Auditor",          description: "Candidate created from an audit finding or manual draft." },
      { state: "INTAKE_DRAFT",                    owner: "Submitter",              description: "Intake form being filled (issue statement, scope, regulatory exposure)." },
      { state: "UNDER_TRIAGE",                    owner: "Triage Reviewer (auditor/admin)", description: "Triage decision pending: FORMAL_CAPA / CORRECTION_ONLY / NO_CAPA." },
      { state: "TRIAGE_NO_CAPA",                  owner: "Triage Reviewer",       description: "Terminal — no CAPA needed; rationale logged." },
      { state: "CORRECTION_ONLY",                 owner: "CAPA Owner",            description: "Quick fix only; no formal investigation." },
      { state: "CAPA_OPEN",                       owner: "CAPA Owner",            description: "Formal CAPA opened; ownerUserId + dueDate required." },
      { state: "INVESTIGATION_IN_PROGRESS",       owner: "Investigator",          description: "Investigation scope + activities being recorded." },
      { state: "RCA_PENDING_APPROVAL",            owner: "Approver (auditor/admin)", description: "Root-cause analysis submitted; awaiting approval." },
      { state: "ACTION_PLAN_PENDING_APPROVAL",    owner: "Approver",              description: "Corrective/preventive plan submitted; awaiting approval." },
      { state: "ACTION_PLAN_APPROVED",            owner: "CAPA Owner",            description: "Plan approved; ready to execute action items." },
      { state: "IN_IMPLEMENTATION",               owner: "Action-item Owners",    description: "Action items being worked. Evidence attached as proof." },
      { state: "AWAITING_EFFECTIVENESS_CHECK",    owner: "Effectiveness Reviewer", description: "Implementation done; awaiting effectiveness evaluation." },
      { state: "EFFECTIVENESS_REVIEW_IN_PROGRESS", owner: "Effectiveness Reviewer", description: "Evaluating whether actions achieved their goal (PASS/FAIL)." },
      { state: "CLOSED_EFFECTIVE",                owner: "VP Quality",            description: "Terminal. Effective; closure approved." },
      { state: "CLOSED_INEFFECTIVE",              owner: "VP Quality",            description: "Terminal. Ineffective; reopen or supersede needed." },
      { state: "REOPENED",                        owner: "QA / Reviewer",         description: "Reopened after recurrence or failed effectiveness." },
      { state: "CANCELLED",                       owner: "Approver",              description: "Terminal." },
      { state: "SUPERSEDED",                      owner: "VP Quality",            description: "Terminal — replaced by another CAPA." },
      { state: "MERGED",                          owner: "VP Quality",            description: "Terminal — merged into another CAPA." },
    ],
    transitions: [
      { from: "DRAFT_CANDIDATE",                  to: "INTAKE_DRAFT|UNDER_TRIAGE|MERGED|CANCELLED", api: "POST /api/capa-v2/intakes (or merge endpoint)", required: "intake fields", roles: "manageRoles", button: "(workspace tabs)" },
      { from: "INTAKE_DRAFT",                     to: "UNDER_TRIAGE|CANCELLED",         api: "POST /api/capa-v2/intakes/:id/submit", required: "all intake fields", roles: "manageRoles", button: "Submit Intake" },
      { from: "UNDER_TRIAGE",                     to: "TRIAGE_NO_CAPA|CORRECTION_ONLY|CAPA_OPEN", api: "POST /api/capa-v2/triage/:id/decision", required: "decision (NO_CAPA/CORRECTION/FORMAL_CAPA), rationale", roles: "triageRoles (auditor/admin/tenant_admin/superadmin)", button: "Triage decision" },
      { from: "CAPA_OPEN",                        to: "INVESTIGATION_IN_PROGRESS",      api: "POST /api/capa-v2/capas (then PUT investigation)", required: "ownerUserId, dueDate", roles: "manageRoles", button: "Open CAPA" },
      { from: "INVESTIGATION_IN_PROGRESS",        to: "RCA_PENDING_APPROVAL",           api: "PUT /api/capa-v2/capas/:id/root-cause", required: "rootCauseStatement, rcaMethod", roles: "manageRoles", button: "Submit RCA" },
      { from: "RCA_PENDING_APPROVAL",             to: "ACTION_PLAN_PENDING_APPROVAL",   api: "POST /api/capa-v2/capas/:id/approvals (stage=RCA, decision=APPROVED)", required: "approver decision", roles: "approvalRoles (auditor/admin/tenant_admin/superadmin)", button: "Approve RCA" },
      { from: "ACTION_PLAN_PENDING_APPROVAL",     to: "ACTION_PLAN_APPROVED",           api: "POST /api/capa-v2/capas/:id/approvals (stage=ACTION_PLAN, decision=APPROVED)", required: "approver decision", roles: "approvalRoles", button: "Approve Plan" },
      { from: "ACTION_PLAN_APPROVED",             to: "IN_IMPLEMENTATION",              api: "PATCH /api/capa-v2/action-items/:id/status (start any item)", required: "≥1 action item moved to IN_PROGRESS", roles: "manageRoles", button: "Start Action" },
      { from: "IN_IMPLEMENTATION",                to: "AWAITING_EFFECTIVENESS_CHECK",   api: "POST /api/capa-v2/capas/:id/implementation-evidence (last action complete)", required: "all action items COMPLETED + evidence", roles: "manageRoles", button: "Mark Complete" },
      { from: "AWAITING_EFFECTIVENESS_CHECK",     to: "EFFECTIVENESS_REVIEW_IN_PROGRESS", api: "PUT /api/capa-v2/capas/:id/effectiveness (start)", required: "review window dates", roles: "manageRoles", button: "Begin EC" },
      { from: "EFFECTIVENESS_REVIEW_IN_PROGRESS", to: "CLOSED_EFFECTIVE|CLOSED_INEFFECTIVE", api: "POST /api/capa-v2/capas/:id/close", required: "closureOutcome (EFFECTIVE/INEFFECTIVE), closedAt", roles: "approvalRoles", button: "Close CAPA" },
      { from: "CLOSED_EFFECTIVE|CLOSED_INEFFECTIVE", to: "REOPENED|SUPERSEDED|MERGED",   api: "POST /api/capa-v2/capas/:id/reopen (or supersede)", required: "reason", roles: "approvalRoles", button: "Reopen" },
    ],
    aiAssists: [
      { name: "CAPA RCA Drafter", endpoint: "POST /api/ai/capa/draft-rca", attachedTo: "INVESTIGATION_IN_PROGRESS", inUI: "From deviation View+AI drawer or CAPA workspace", description: "Drafts severity + RCA + actions; user edits + e-signs." },
      { name: "Predictive CAPA Outcome (Wave 3)", endpoint: "POST /api/ai/predict/capa-outcome", attachedTo: "CAPA_OPEN onwards", inUI: "Predictive badge on CAPA row", description: "P(on-time) + P(effective) heuristic." },
      { name: "Active Learning Loop", endpoint: "POST /api/ai/active-learning/adjustments", attachedTo: "CLOSED_EFFECTIVE/CLOSED_INEFFECTIVE", inUI: "Drift dashboard", description: "Refines retrieval weights based on accept/reject outcomes." },
    ],
    closure: "CLOSED_EFFECTIVE requires: all action items COMPLETED, ≥1 implementation evidence, effectiveness check PASS, closure approval (stage=CLOSURE) by approvalRoles user. CLOSED_INEFFECTIVE permitted but triggers reopen workflow.",
    screens: [
      { route: "/buyer/capas", purpose: "CAPA workspace (admin/buyer view)" },
      { route: "/auditor/capas", purpose: "CAPA workspace (auditor view, scoped to assigned)" },
    ],
  },

  // ───────────── 3. DOCUMENT CONTROL ─────────────
  {
    n: 3, key: "doc",
    title: "Document Control (SOP / WI / Policy / Spec)",
    iso: "ISO 9001:2015 §7.5 · 21 CFR 211.180 · 21 CFR Part 11 §11.10 (e-signature)",
    purpose: "Author, review, approve, publish, supersede and withdraw controlled documents. Multi-step serial approval. Triggers training auto-assignment when published if requiresTrainingOnUpdate=true.",
    model: { file: "backend/src/models/DocumentControlModel.js", collection: "document-controls", numbering: "Sequential per tenant; user-set documentNumber" },
    states: [
      { state: "DRAFT",        owner: "Doc Author",          description: "Initial draft; freely editable." },
      { state: "UNDER_REVIEW", owner: "Reviewers (per step)", description: "approvalSteps[] active; serial review per step." },
      { state: "APPROVED",     owner: "Doc Control",         description: "All steps APPROVED/DELEGATED; awaiting publish." },
      { state: "EFFECTIVE",    owner: "(All users)",         description: "Live; effectiveDate set. Supersede or withdraw permitted." },
      { state: "SUPERSEDED",   owner: "Doc Control",         description: "Terminal; supersededById points to new revision." },
      { state: "WITHDRAWN",    owner: "Doc Control",         description: "Terminal; withdrawalReason captured." },
    ],
    transitions: [
      { from: "DRAFT",        to: "UNDER_REVIEW", api: "POST /api/document-control/:id/submit-for-review", required: "reviewers[] (each with role; userId optional)", roles: "authenticated tenant user", button: "Submit for Review" },
      { from: "UNDER_REVIEW", to: "DRAFT (rejected) | UNDER_REVIEW (next step) | APPROVED (all approved)", api: "POST /api/document-control/:id/approve", required: "stepOrder, decision (APPROVED/REJECTED/DELEGATED), comments", roles: "authenticated; step.approverId enforced", button: "Approve / Reject" },
      { from: "APPROVED",     to: "EFFECTIVE",    api: "POST /api/document-control/:id/publish", required: "effectiveDate (defaults to today); triggers training auto-assign", roles: "doc admin", button: "Publish" },
      { from: "EFFECTIVE",    to: "SUPERSEDED",   api: "POST /api/document-control/:id/supersede", required: "new doc payload (auto-creates new revision)", roles: "doc admin", button: "Supersede" },
      { from: "EFFECTIVE",    to: "WITHDRAWN",    api: "POST /api/document-control/:id/withdraw", required: "withdrawalReason", roles: "doc admin", button: "Withdraw" },
    ],
    aiAssists: [
      { name: "Training Auto-Assign Agent (Wave 2)", endpoint: "POST /api/ai/training/auto-assign-on-sop-revision", attachedTo: "EFFECTIVE (publish)", inUI: "Auto-fired on publish if requiresTrainingOnUpdate=true", description: "Identifies affected roles + creates 'read-and-understood' training records with grace-period dueDate. Optionally drafts an LLM knowledge-check question." },
    ],
    closure: "EFFECTIVE is the operational state. Permanent closure occurs at SUPERSEDED (replaced by new revision) or WITHDRAWN (taken out of service). versionMajor auto-increments on supersede.",
    screens: [{ route: "/document-control", purpose: "Register + state-action buttons + 'Effective' indicator" }],
  },

  // ───────────── 4. RISK REGISTER ─────────────
  {
    n: 4, key: "risk",
    title: "Risk Register (FMEA)",
    iso: "ISO 9001:2015 §6.1 · ICH Q9 (R1) Quality Risk Management",
    purpose: "Capture process-step risks (failure mode → effect → cause) with FMEA scoring (S × O × D = RPN). Add mitigations until residual risk acceptable. Tie to source (audit, deviation, complaint, CAPA, regulatory).",
    model: { file: "backend/src/models/RiskItemModel.js", collection: "risk-items", numbering: "user-defined / N/A" },
    rpnBands: [{ band: "LOW", range: "< 60" }, { band: "MEDIUM", range: "60 – 124" }, { band: "HIGH", range: "125 – 199" }, { band: "CRITICAL", range: "≥ 200" }],
    states: [
      { state: "OPEN",        owner: "Risk Owner",     description: "Initial; no mitigations completed." },
      { state: "MITIGATED",   owner: "Risk Owner",     description: "≥ 1 mitigation COMPLETED; residual S/O/D entered; residual RPN computed." },
      { state: "ACCEPTED",    owner: "VP Quality",     description: "Residual risk acceptable; sign-off captured." },
      { state: "CLOSED",      owner: "VP Quality",     description: "Terminal; full audit trail verified." },
      { state: "TRANSFERRED", owner: "VP Quality",     description: "Terminal; ownership moved to another tenant/site." },
    ],
    transitions: [
      { from: "OPEN", to: "OPEN (with mitigation appended)", api: "POST /api/risk-items/:id/mitigate", required: "action, owner, dueDate", roles: "tenant authenticated", button: "Add Mitigation" },
      { from: "OPEN", to: "MITIGATED", api: "PUT /api/risk-items/:id (status=MITIGATED + residual S/O/D)", required: "≥ 1 mitigation COMPLETED; residual scores", roles: "risk owner", button: "Mark Mitigated" },
      { from: "MITIGATED", to: "ACCEPTED", api: "PUT /api/risk-items/:id (status=ACCEPTED)", required: "approver sign-off", roles: "tenant_admin", button: "Accept Residual" },
      { from: "ACCEPTED", to: "CLOSED", api: "PUT /api/risk-items/:id (status=CLOSED)", required: "closure note", roles: "tenant_admin", button: "Close" },
      { from: "(any non-terminal)", to: "TRANSFERRED", api: "PUT /api/risk-items/:id (status=TRANSFERRED)", required: "transfer destination", roles: "tenant_admin", button: "Transfer" },
    ],
    aiAssists: [
      { name: "Risk Scenario Brainstormer (Wave 2)", endpoint: "POST /api/ai/risk/brainstorm-scenarios", attachedTo: "OPEN (creation)", inUI: "Risk Register · 'Brainstorm with AI' button", description: "Given a process description + product class, AI proposes failure modes + effects + causes seeded into draft risk items." },
    ],
    closure: "CLOSED requires (a) all mitigations COMPLETED, (b) residual RPN acceptable per tenant policy, (c) tenant_admin approval. Residual RPN auto-computed on save when residualSeverity + residualOccurrence + residualDetectability all set.",
    screens: [{ route: "/risk-register", purpose: "FMEA register with RPN/Band columns + Log Risk dialog" }],
  },

  // ───────────── 5. MANAGEMENT REVIEW ─────────────
  {
    n: 5, key: "mrm",
    title: "Management Review (MRM)",
    iso: "ISO 9001:2015 §9.3 · 21 CFR Part 11 (e-signed minutes)",
    purpose: "Periodic top-management review of QMS performance: audit results, CAPA status, deviations, complaints, supplier performance, resource adequacy, improvement opportunities, decisions and action items.",
    model: { file: "backend/src/models/ManagementReviewModel.js", collection: "management-reviews", numbering: "MR-YYYY-NNNN" },
    states: [
      { state: "PLANNED",     owner: "Chair (VP Quality)", description: "Scheduled; plannedDate + reviewType + chair + attendees set." },
      { state: "IN_PROGRESS", owner: "Chair / Minutes Taker", description: "Meeting under way; inputs[] being captured (manually or via AI populator)." },
      { state: "COMPLETED",   owner: "Chair + Approver",  description: "Terminal; outputs (qmsAdequacy / resourceDecisions / improvementOpportunities / actionItems) captured + e-signed." },
      { state: "CANCELLED",   owner: "Chair",             description: "Terminal." },
    ],
    transitions: [
      { from: "PLANNED",     to: "IN_PROGRESS",  api: "PUT /api/management-reviews/:id (status=IN_PROGRESS, actualDate)", required: "actualDate", roles: "tenant authenticated", button: "Start Meeting" },
      { from: "IN_PROGRESS", to: "COMPLETED",    api: "POST /api/management-reviews/:id/complete", required: "qmsAdequacy, resourceDecisions, improvementOpportunities, actionItems[]", roles: "chair / tenant_admin", button: "Complete + Sign" },
      { from: "PLANNED|IN_PROGRESS", to: "CANCELLED", api: "DELETE /api/management-reviews/:id (soft) or PUT status=CANCELLED", required: "reason", roles: "chair", button: "Cancel" },
    ],
    aiAssists: [
      { name: "MRM Input Populator (Wave 2)", endpoint: "POST /api/ai/mrm/populate-inputs", attachedTo: "IN_PROGRESS", inUI: "MRM detail · 'Auto-populate inputs' button", description: "Aggregates last N days of audits + CAPAs + deviations + complaints → populates inputs[] with topic/summary/trend. Adds AI narrative." },
    ],
    closure: "COMPLETED requires (a) inputs[] populated for all 9.3.2 topics, (b) qmsAdequacy decision (ADEQUATE/NEEDS_IMPROVEMENT/INADEQUATE), (c) resourceDecisions + improvementOpportunities recorded, (d) actionItems[] with owners + due dates, (e) approvedBy + approvedAt set (e-signature), (f) optionally minutesDocumentId linked.",
    screens: [{ route: "/management-review", purpose: "Register + Schedule Review dialog + detail with inputs + action items" }],
  },

  // ───────────── 6. TRAINING RECORDS ─────────────
  {
    n: 6, key: "training",
    title: "Training Records",
    iso: "ISO 9001:2015 §7.2 · 21 CFR 211.25 · 21 CFR 211.100 (training on SOPs)",
    purpose: "Track assigned, in-progress and completed training for every employee. Auto-assign 'Read and Understood' records when SOPs are published. Capture competency assessment + knowledge-check results for audit readiness.",
    model: { file: "backend/src/models/TrainingRecordModel.js", collection: "training-records", numbering: "n/a" },
    states: [
      { state: "ASSIGNED",    owner: "Trainer / auto-assign agent", description: "Initial state; assigned with dueDate." },
      { state: "IN_PROGRESS", owner: "Trainee",                     description: "Trainee has started but not completed." },
      { state: "COMPLETED",   owner: "Trainee",                     description: "Terminal. Completion captured with competencyLevel + assessment." },
      { state: "OVERDUE",     owner: "(auto)",                      description: "Auto-escalation when dueDate < today and not COMPLETED." },
      { state: "WAIVED",      owner: "Trainer",                     description: "Terminal. Waiver captured with waiverReason + waivedBy." },
      { state: "FAILED",      owner: "Trainer",                     description: "Terminal. Assessment failed; remedial action required." },
    ],
    transitions: [
      { from: "(create)", to: "ASSIGNED", api: "POST /api/training-records", required: "traineeId, trainingCode, trainingTitle, dueDate", roles: "authenticated tenant user / Wave 2 agent", button: "Assign Training" },
      { from: "ASSIGNED", to: "IN_PROGRESS", api: "PUT /api/training-records/:id", required: "status=IN_PROGRESS", roles: "trainee", button: "Start Training" },
      { from: "ASSIGNED|IN_PROGRESS", to: "COMPLETED", api: "POST /api/training-records/:id/complete", required: "competencyLevel (AWARE/COMPETENT/PROFICIENT/EXPERT); assessment {type, score, passed, notes}", roles: "trainee", button: "Mark Complete" },
      { from: "ASSIGNED|IN_PROGRESS", to: "WAIVED",   api: "PUT /api/training-records/:id (status=WAIVED)", required: "waiverReason, waivedBy", roles: "trainer", button: "Waive" },
      { from: "ASSIGNED|IN_PROGRESS", to: "FAILED",   api: "PUT /api/training-records/:id (status=FAILED)", required: "assessment (passed=false)", roles: "trainer", button: "Mark Failed" },
    ],
    aiAssists: [
      { name: "Training Auto-Assign Agent (Wave 2)", endpoint: "POST /api/ai/training/auto-assign-on-sop-revision", attachedTo: "ASSIGNED (creation)", inUI: "Auto-fired on SOP publish when requiresTrainingOnUpdate=true", description: "Given an SOP revision, identifies affected roles/departments and creates read-and-understood training records. Optionally drafts a multiple-choice knowledge-check via LLM." },
    ],
    closure: "COMPLETED requires competencyLevel + assessment (type, score, passed). An e-signature may be required per tenant policy (21 CFR Part 11).",
    screens: [{ route: "/training", purpose: "Assigned + completed list, +Assign Training dialog, status/type filters" }],
  },

  // ───────────── 7. CHANGE CONTROL ─────────────
  {
    n: 7, key: "change",
    title: "Change Control",
    iso: "ICH Q10 §3.2.3 · 21 CFR 211.100 · 21 CFR 820.30 (medical device) · EU GMP Annex 15",
    purpose: "Control + document any proposed change to an approved process, material, equipment, specification, or procedure. Drive impact assessment, multi-level approval, implementation, and effectiveness verification.",
    model: { file: "backend/src/models/ChangeControlModel.js", collection: "change_controls", numbering: "user-defined" },
    states: [
      { state: "DRAFT",               owner: "Change originator", description: "Draft change request; freely editable." },
      { state: "SUBMITTED",           owner: "Change manager",   description: "Submitted for initial screening + assignment." },
      { state: "IMPACT_ASSESSMENT",   owner: "Cross-functional SMEs", description: "Regulatory + quality + technical impact captured (AI classifier available)." },
      { state: "UNDER_REVIEW",        owner: "Reviewers (approvalSteps[])", description: "Multi-step serial approval per approvalSteps[] array." },
      { state: "APPROVED",            owner: "Change manager",   description: "All approval steps APPROVED; ready to implement." },
      { state: "IMPLEMENTATION",      owner: "Implementation owners", description: "Change is being executed per the approved plan." },
      { state: "VERIFICATION",        owner: "QA verifier",      description: "Effectiveness verification under way." },
      { state: "CLOSED",              owner: "QA",               description: "Terminal. Effectiveness confirmed; change closed." },
      { state: "REJECTED",            owner: "Reviewer",         description: "Terminal. Reject reason captured." },
      { state: "CANCELLED",           owner: "Originator / Change mgr", description: "Terminal." },
    ],
    transitions: [
      { from: "(create)", to: "DRAFT", api: "POST /api/universal/change-controls", required: "title, description, changeType, riskLevel", roles: "buyer/supplier/auditor/admin/tenant_admin (createRoles)", button: "New Change Request" },
      { from: "DRAFT",              to: "SUBMITTED",          api: "PUT /api/universal/change-controls/:id (status=SUBMITTED)", required: "full payload", roles: "createRoles", button: "Submit" },
      { from: "SUBMITTED",          to: "IMPACT_ASSESSMENT",  api: "PUT /api/universal/change-controls/:id (status=IMPACT_ASSESSMENT)", required: "initial triage", roles: "reviewRoles", button: "Begin Impact Assessment" },
      { from: "IMPACT_ASSESSMENT",  to: "UNDER_REVIEW",       api: "PUT /api/universal/change-controls/:id (status=UNDER_REVIEW)", required: "regulatoryImpact, impactAssessment fields", roles: "reviewRoles", button: "Send for Review" },
      { from: "UNDER_REVIEW",       to: "APPROVED|REJECTED",  api: "POST /api/universal/change-controls/:id/approval", required: "stepOrder, decision (APPROVED/REJECTED/ABSTAINED), comments", roles: "auditor/admin/tenant_admin/reviewer/workflow_manager", button: "Approve / Reject" },
      { from: "APPROVED",           to: "IMPLEMENTATION",     api: "PUT /api/universal/change-controls/:id (status=IMPLEMENTATION)", required: "implementation plan", roles: "createRoles", button: "Start Implementation" },
      { from: "IMPLEMENTATION",     to: "VERIFICATION",       api: "POST /api/universal/change-controls/:id/verify-effectiveness", required: "verificationNotes, effectivenessCheck, effective=false (pending)", roles: "createRoles", button: "Begin Verification" },
      { from: "VERIFICATION",       to: "CLOSED",             api: "POST /api/universal/change-controls/:id/verify-effectiveness (effective=true)", required: "verificationNotes, effectivenessCheck, effective=true", roles: "createRoles", button: "Confirm Effective + Close" },
    ],
    aiAssists: [
      { name: "Regulatory Impact Classifier (Wave 2)", endpoint: "POST /api/ai/change-control/classify-impact", attachedTo: "IMPACT_ASSESSMENT", inUI: "Change-control detail · 'Classify regulatory impact' button", description: "Given a change description + changeType + riskLevel + affected products/markets, classifies US (CBE-30 / PAS-NDA) + EU (Type IA / IB / II Variation) routes with reasoning." },
    ],
    closure: "CLOSED requires (a) all approvalSteps APPROVED, (b) implementation evidence captured, (c) verify-effectiveness with effective=true, (d) optional e-sig on closure decision.",
    screens: [{ route: "/change-controls", purpose: "Register + New Change dialog + approval drawer" }],
  },

  // ───────────── 8. COMPLAINTS ─────────────
  {
    n: 8, key: "complaint",
    title: "Complaint Management",
    iso: "ISO 9001:2015 §10.2 · 21 CFR 211.198 · 21 CFR 820.198 (Complaint Files)",
    purpose: "Capture, investigate, and close customer complaints. Determine MDR reportability. Link to CAPA when systemic. Track regulatory reporting timelines.",
    model: { file: "backend/src/models/ComplaintModel.js", collection: "complaints", numbering: "auto (complaintNumber)" },
    states: [
      { state: "OPEN",                owner: "Complaint Intake",  description: "Initial intake; severity + type + source captured. isMedicalDeviceReport flag set." },
      { state: "UNDER_INVESTIGATION", owner: "Complaint Investigator", description: "Investigation open; rootCause + investigationSummary being captured." },
      { state: "PENDING_CAPA",        owner: "Complaint Investigator", description: "Investigation indicates CAPA required; awaiting CAPA record creation + linking." },
      { state: "CAPA_IN_PROGRESS",    owner: "CAPA Owner",        description: "Linked CAPA records being executed." },
      { state: "PENDING_CLOSURE",     owner: "QA",                description: "All CAPAs closed; final review before formal closure." },
      { state: "CLOSED",              owner: "QA",                description: "Terminal. closureNotes + correctiveAction + preventiveAction captured." },
      { state: "CANCELLED",           owner: "QA",                description: "Terminal. Cancelled reason captured (OPEN-only via DELETE)." },
    ],
    transitions: [
      { from: "(create)", to: "OPEN", api: "POST /api/complaints", required: "title, complaintType, severity, source", roles: "authenticated tenant user", button: "+ Log Complaint" },
      { from: "OPEN",                  to: "UNDER_INVESTIGATION", api: "POST /api/complaints/:id/investigate", required: "investigationSummary, rootCause, assignedTo", roles: "authenticated", button: "Investigate" },
      { from: "UNDER_INVESTIGATION",   to: "PENDING_CAPA",        api: "PUT /api/complaints/:id (status=PENDING_CAPA; linkedCAPAIds[])", required: "linkedCAPAIds", roles: "authenticated", button: "Require CAPA" },
      { from: "PENDING_CAPA",          to: "CAPA_IN_PROGRESS",    api: "PUT /api/complaints/:id (status=CAPA_IN_PROGRESS)", required: "CAPA opened", roles: "authenticated", button: "(auto)" },
      { from: "CAPA_IN_PROGRESS",      to: "PENDING_CLOSURE",     api: "PUT /api/complaints/:id (status=PENDING_CLOSURE)", required: "all CAPAs CLOSED_EFFECTIVE", roles: "authenticated", button: "(auto)" },
      { from: "PENDING_CLOSURE",       to: "CLOSED",              api: "POST /api/complaints/:id/close", required: "closureNotes, correctiveAction, preventiveAction", roles: "authenticated", button: "Close" },
      { from: "OPEN",                  to: "CANCELLED",           api: "DELETE /api/complaints/:id (OPEN-only)", required: "—", roles: "authenticated", button: "Cancel" },
    ],
    aiAssists: [
      { name: "(planned) Complaint triage", endpoint: "(not yet wired)", attachedTo: "OPEN", inUI: "(future)", description: "Wave 3 roadmap — pattern-match the complaint text against historical CAPAs + FDA MedWatch to pre-suggest severity, MDR reportability, and linked CAPAs." },
    ],
    closure: "CLOSED requires closureNotes; correctiveAction + preventiveAction captured. If isMedicalDeviceReport=true, MDR 3500A submission timeline is tracked separately (FDA eMDR).",
    screens: [{ route: "/complaint-manager", purpose: "Register + Log Complaint dialog + investigation/closure drawers" }],
  },

  // ───────────── 9. INTERNAL AUDIT EXECUTION ─────────────
  {
    n: 9, key: "audit",
    title: "Internal Audit Execution (8-phase lifecycle)",
    iso: "ISO 19011 · ISO 9001:2015 §9.2 · 21 CFR 211.180 · ICH Q10 §3.2.4 · EU GMP Chapter 9",
    purpose: "Run a supplier or internal audit through 8 sequential phases — from intake through surveillance follow-up. Each phase owns specific artifacts (DRL, SMF, agenda, checklist, PDR, CAPA, closure certificate). Role gates enforce buyer/supplier/auditor collaboration.",
    model: { file: "backend/src/models/auditRequestsMasterModel.js", collection: "audit-requests-master", numbering: "HAWK-XXXXXXXXXXX (global) + supplier-scoped" },
    states: [
      { state: "INITIATED",   owner: "Buyer",    description: "Buyer creates audit request. RFQ/intimation + scope captured." },
      { state: "PREP",        owner: "Supplier", description: "Supplier completes pre-audit questionnaire + Document Requirements List + Site Master File." },
      { state: "PLANNING",    owner: "Auditor",  description: "Auditor builds scope + agenda + COI declaration." },
      { state: "EXECUTION",   owner: "Auditor",  description: "On-site / remote audit under way. Opening meeting, observations, evidence capture." },
      { state: "FINDINGS",    owner: "Auditor",  description: "Findings documented per ISO 19011 severity (Critical/Major/Minor/Observation). Preliminary Deficiency Report issued." },
      { state: "CAPA",        owner: "Supplier → Buyer", description: "Supplier submits CAPA plans + evidence; buyer reviews." },
      { state: "CLOSURE",     owner: "Buyer",    description: "Final report approved; closure certificate signed by buyer/supplier/auditor/witness." },
      { state: "SURVEILLANCE", owner: "Buyer/Auditor", description: "Follow-up audit scheduled per surveillance cadence." },
    ],
    transitions: [
      { from: "(create)",     to: "INITIATED",    api: "POST /api/audit-requests (buyer)", required: "supplierOrgId, scope, auditType", roles: "buyer/tenant_admin", button: "Request Audit" },
      { from: "INITIATED",    to: "PREP",         api: "POST /api/audit-requests/:id/supplier-decision (ACCEPTED)", required: "supplierDecision, optional proposedDates", roles: "supplier", button: "Accept Audit" },
      { from: "INITIATED",    to: "(rejected)",   api: "POST /api/audit-requests/:id/supplier-decision (REJECTED/PROPOSED)", required: "supplierDecision, dispute reason", roles: "supplier", button: "Propose / Reject" },
      { from: "any",          to: "any (admin)",  api: "POST /api/audits/:id/phases/transition (override=true)", required: "override flag (admin-only)", roles: "admin/tenant_admin", button: "Force Transition" },
      { from: "PREP",         to: "PLANNING",     api: "POST /api/audits/:id/phases/transition", required: "prep artifacts complete", roles: "auditor/buyer", button: "Advance to Planning" },
      { from: "PLANNING",     to: "EXECUTION",    api: "POST /api/audits/:id/phases/transition", required: "agenda + scope approved", roles: "auditor", button: "Start Execution" },
      { from: "EXECUTION",    to: "FINDINGS",     api: "POST /api/audits/:id/phases/transition", required: "closing meeting complete", roles: "auditor", button: "Advance to Findings" },
      { from: "FINDINGS",     to: "CAPA",         api: "POST /api/audit-requests/:id/deficiency-validation", required: "deficiencyValidation (ACCEPTED/PARTIALLY_ACCEPTED/DISPUTED) + disputeItems", roles: "supplier", button: "Validate Findings" },
      { from: "CAPA",         to: "CLOSURE",      api: "POST /api/audits/:id/phases/transition", required: "all linked CAPAs closed", roles: "buyer", button: "Close Audit" },
      { from: "CLOSURE",      to: "SURVEILLANCE", api: "POST /api/audits/:id/phases/transition", required: "closure certificate signed", roles: "buyer/auditor", button: "Schedule Follow-up" },
    ],
    aiAssists: [
      { name: "Audit-Prep Agent (audit-agents)", endpoint: "POST /api/ai/audit-agents/prepare-questionnaire", attachedTo: "PREP", inUI: "Prep workspace · 'Generate questionnaire'", description: "Risk-weighted questionnaire pulled from past findings + openFDA + EMA EudraGMDP + WHO PQ signals." },
      { name: "Supplier-Intel Agent (audit-agents)", endpoint: "POST /api/ai/audit-agents/supplier-intel", attachedTo: "PREP|PLANNING", inUI: "Supplier register drawer", description: "Public FDA warning letters + Form 483s + recalls for target supplier; verdict = known_tenant / public_only / ambiguous / unknown." },
      { name: "Auditor Coach Panel (Wave 3)", endpoint: "POST /api/ai/auditor-coach/suggest", attachedTo: "EXECUTION", inUI: "Auditor console side panel", description: "Real-time observation severity guidance per ISO 19011 (Critical/Major/Minor/Observation)." },
      { name: "Audit-Report Assembler (audit-agents)", endpoint: "POST /api/ai/audit-agents/assemble-report", attachedTo: "FINDINGS|CLOSURE", inUI: "Findings drawer · 'Assemble report'", description: "Generates findings log PDF + CAPA deadlines per GMP classification + SHA-256 integrity hash." },
    ],
    closure: "CLOSURE requires (a) all observations documented with severity + CAPA linkage, (b) closure certificate signed by buyer + supplier + auditor + witness roles, (c) all CAPAs closed. SURVEILLANCE triggers re-audit per risk-banded cadence.",
    screens: [
      { route: "/buyer/audits, /audits", purpose: "Buyer / admin audit register" },
      { route: "/auditor/audits", purpose: "Auditor workspace with phase kanban" },
      { route: "/audits/[id]", purpose: "Audit detail with phase-specific artifact tabs" },
    ],
  },

  // ───────────── 10. BATCH RECORDS ─────────────
  {
    n: 10, key: "batch",
    title: "Batch / Manufacturing Records",
    iso: "21 CFR 211.188 · 21 CFR 211.192 · EU GMP Annex 11 (electronic batch records) · ICH Q7",
    purpose: "Capture the full manufacturing record for a single batch — BOM actuals, in-process tests, yield, equipment, linked deviations — then drive it through QA review to final disposition (release / reject / rework).",
    model: { file: "backend/src/models/BatchRecordModel.js", collection: "batch-records", numbering: "user-defined batchNumber" },
    states: [
      { state: "MANUFACTURING",           owner: "Operator",  description: "Batch in production; BOM + in-process tests + yields being recorded." },
      { state: "UNDER_REVIEW",            owner: "Operator",  description: "Submitted for review; lab + deviation checks run." },
      { state: "PENDING_LAB_RESULTS",     owner: "QC Lab",    description: "Waiting for analytical release results." },
      { state: "PENDING_QA_REVIEW",       owner: "QA",        description: "Lab complete; QA reviewing batch record integrity." },
      { state: "PENDING_DEVIATION_CLOSURE", owner: "QA",      description: "Open deviations block release." },
      { state: "PENDING_DISPOSITION",     owner: "VP / Director", description: "Final release decision pending." },
      { state: "RELEASED",                owner: "VP",        description: "Terminal. releaseDate set." },
      { state: "REJECTED",                owner: "VP",        description: "Terminal. Batch destroyed or returned to supplier." },
      { state: "QUARANTINED",             owner: "QA",        description: "Terminal (or non-terminal pending rework/reprocess)." },
    ],
    transitions: [
      { from: "(create)",                to: "MANUFACTURING", api: "POST /api/batch-records", required: "batchNumber, productName, manufacturingDate, billOfMaterials[], inProcessTests[]", roles: "operator/admin", button: "+ Create Batch" },
      { from: "MANUFACTURING",           to: "UNDER_REVIEW|PENDING_LAB_RESULTS|PENDING_QA_REVIEW", api: "POST /api/batch-records/:id/submit-for-review", required: "labResultsComplete (bool), labResultsSummary, linkedDeviationIds[]", roles: "operator", button: "Submit for Review" },
      { from: "UNDER_REVIEW|PENDING_LAB_RESULTS|PENDING_QA_REVIEW", to: "PENDING_DEVIATION_CLOSURE|PENDING_LAB_RESULTS|PENDING_DISPOSITION", api: "POST /api/batch-records/:id/qa-review", required: "qaReviewNotes, deviationsResolved (bool), labResultsComplete (bool)", roles: "QA / admin", button: "QA Review" },
      { from: "PENDING_DISPOSITION",     to: "RELEASED",       api: "POST /api/batch-records/:id/dispose (decision=RELEASED)", required: "decision=RELEASED, justification", roles: "VP/tenant_admin", button: "Release" },
      { from: "PENDING_DISPOSITION",     to: "REJECTED",       api: "POST /api/batch-records/:id/dispose (decision=REJECTED)", required: "decision=REJECTED, justification", roles: "VP/tenant_admin", button: "Reject" },
      { from: "PENDING_DISPOSITION",     to: "QUARANTINED",    api: "POST /api/batch-records/:id/dispose (decision=REWORK|REPROCESS|QUARANTINED)", required: "decision, justification", roles: "VP/QA", button: "Quarantine / Rework" },
    ],
    aiAssists: [
      { name: "(roadmap) Yield anomaly detector", endpoint: "(not yet wired)", attachedTo: "MANUFACTURING|UNDER_REVIEW", inUI: "(future)", description: "Wave 3 roadmap — compare current yield + in-process test trends against historical and flag outliers for QA review." },
    ],
    closure: "RELEASED requires (a) batchRecord complete per approved MBR, (b) all in-process tests PASS, (c) all linked deviations CLOSED, (d) labResultsComplete=true, (e) QA reviewed, (f) VP disposition=RELEASED. releaseDate auto-set on RELEASED.",
    screens: [{ route: "/batch-records", purpose: "Batch register + lifecycle buttons (Submit / QA Review / Dispose)" }],
  },

  // ───────────── 11. EQUIPMENT / CALIBRATION ─────────────
  {
    n: 11, key: "equipment",
    title: "Equipment / Calibration",
    iso: "ISO 9001:2015 §7.1.5 · 21 CFR 211.68(b) · ICH Q7 §5.3",
    purpose: "Track every GMP-relevant asset through its calibration lifecycle. Auto-escalate OVERDUE items. Tie failed calibrations to QUARANTINED status so the asset cannot be used in production.",
    model: { file: "backend/src/models/EquipmentModel.js", collection: "equipment", numbering: "EQ-YYYY-NNNN (auto)" },
    states: [
      { state: "ACTIVE",            owner: "Maintenance", description: "In service, calibration current." },
      { state: "INACTIVE",          owner: "Maintenance", description: "Temporarily withdrawn, not under active maintenance." },
      { state: "UNDER_CALIBRATION", owner: "Maintenance", description: "Currently being calibrated." },
      { state: "OUT_OF_SERVICE",    owner: "Maintenance", description: "Broken or awaiting repair." },
      { state: "QUARANTINED",       owner: "QA",          description: "Failed calibration or suspected compromised; blocked from production use." },
      { state: "RETIRED",           owner: "Maintenance", description: "Terminal. Decommissioned; decommissionedAt set." },
    ],
    transitions: [
      { from: "(create)",           to: "ACTIVE",            api: "POST /api/equipment", required: "equipmentName, equipmentType, calibrationFrequencyDays (if requiresCalibration)", roles: "maintenance/admin", button: "+ Add Equipment" },
      { from: "ACTIVE",             to: "UNDER_CALIBRATION", api: "PUT /api/equipment/:id (status=UNDER_CALIBRATION)", required: "—", roles: "maintenance", button: "Begin Calibration" },
      { from: "UNDER_CALIBRATION",  to: "ACTIVE (PASS) | QUARANTINED (FAIL)", api: "POST /api/equipment/:id/calibration", required: "performedAt, performedBy, result (PASS/CONDITIONAL/FAIL), certificateRef, nextDueDays", roles: "maintenance", button: "Record Calibration" },
      { from: "ACTIVE",             to: "OUT_OF_SERVICE",    api: "PUT /api/equipment/:id (status=OUT_OF_SERVICE)", required: "—", roles: "maintenance", button: "Mark Out of Service" },
      { from: "QUARANTINED|OUT_OF_SERVICE", to: "ACTIVE",    api: "PUT /api/equipment/:id (status=ACTIVE) + new calibration", required: "successful re-calibration", roles: "maintenance + QA", button: "Return to Service" },
      { from: "(any)",              to: "RETIRED",           api: "DELETE /api/equipment/:id (soft)", required: "decommission reason", roles: "admin/tenant_admin", button: "Retire" },
    ],
    aiAssists: [
      { name: "(roadmap) Predictive calibration", endpoint: "(not yet wired)", attachedTo: "ACTIVE|UNDER_CALIBRATION", inUI: "(future)", description: "Wave 3 roadmap — predict calibration failure probability from historical trend + usage hours + ambient conditions." },
    ],
    closure: "RETIRED is terminal. A QUARANTINED asset cannot be used in production until successfully re-calibrated (status flips back to ACTIVE with calibrationStatus=CURRENT).",
    screens: [{ route: "/asset-management", purpose: "Equipment register + calibration dialog (Record Calibration / Retire)" }],
  },

  // ───────────── 12. SUPPLIER PRE-QUALIFICATION ─────────────
  {
    n: 12, key: "prequal",
    title: "Supplier Pre-Qualification",
    iso: "ICH Q10 §2.7 · 21 CFR 211.84 (component qualification) · EU GMP Chapter 7",
    purpose: "Screen a new supplier before scheduling a full audit. Capture initial risk band, regulatory standards, product categories, and checklist compliance. Output: APPROVED / CONDITIONALLY_APPROVED / REJECTED.",
    model: { file: "backend/src/models/SupplierPreQualificationModel.js", collection: "supplier-pre-qualifications", numbering: "PQ-YYYY-NNNN (auto)" },
    states: [
      { state: "DRAFT",                   owner: "Supplier",    description: "Supplier filling in pre-qual form." },
      { state: "SUBMITTED",               owner: "Supplier",    description: "Submitted; buyer queue entry." },
      { state: "UNDER_REVIEW",            owner: "Buyer / Auditor", description: "Checklist being reviewed." },
      { state: "APPROVED",                owner: "Auditor / VP", description: "Terminal. Ready for full audit scheduling." },
      { state: "CONDITIONALLY_APPROVED",  owner: "Auditor / VP", description: "Terminal. Conditions captured + tracked separately." },
      { state: "REJECTED",                owner: "Auditor / VP", description: "Terminal." },
      { state: "EXPIRED",                 owner: "(auto)",       description: "Terminal. validUntil passed." },
    ],
    transitions: [
      { from: "(create)",     to: "DRAFT",       api: "POST /api/supplier-prequalifications", required: "scope, regulatoryStandards[], productCategories[]", roles: "supplier/buyer/admin", button: "+ Start Pre-Qual" },
      { from: "DRAFT",        to: "SUBMITTED",   api: "PUT /api/supplier-prequalifications/:id (status=SUBMITTED)", required: "full payload", roles: "supplier", button: "Submit" },
      { from: "SUBMITTED",    to: "UNDER_REVIEW", api: "PUT /api/supplier-prequalifications/:id (status=UNDER_REVIEW)", required: "checklist assigned", roles: "buyer", button: "Begin Review" },
      { from: "UNDER_REVIEW", to: "APPROVED|CONDITIONALLY_APPROVED|REJECTED", api: "POST /api/supplier-prequalifications/:id/decision", required: "decision, decisionNotes, validUntil, conditions[] (if conditional)", roles: "auditor/tenant_admin", button: "Approve / Conditional / Reject" },
      { from: "APPROVED",     to: "(escalate to audit)", api: "POST /api/audit-requests (from PQ)", required: "audit scope", roles: "buyer", button: "Schedule Full Audit" },
      { from: "(any non-terminal)", to: "EXPIRED", api: "(auto job)", required: "validUntil passed", roles: "system", button: "(auto)" },
    ],
    aiAssists: [
      { name: "Supplier-Intel Agent (audit-agents)", endpoint: "POST /api/ai/audit-agents/supplier-intel", attachedTo: "DRAFT|UNDER_REVIEW", inUI: "PQ detail · 'Check public signals'", description: "Enriches the PQ record with openFDA + FDA warning letters + import alerts for the supplier." },
    ],
    closure: "Terminal states (APPROVED / CONDITIONALLY_APPROVED / REJECTED) require decision + decisionNotes. APPROVED sets validUntil (default 2 years).",
    screens: [{ route: "/supplier-prequalification", purpose: "PQ register + decision drawer" }],
  },

  // ───────────── 13. AUDIT REQUEST / RFQ ─────────────
  {
    n: 13, key: "rfq",
    title: "Audit Request / RFQ (marketplace audit flow)",
    iso: "ICH Q10 §2.7 · ISO 19011 §5.3 · contract audit governance",
    purpose: "Buyer posts an audit RFQ. Multiple auditor orgs submit quotes. Buyer shortlists + awards. Awarded quote converts into a full audit request that enters the 8-phase audit lifecycle.",
    model: { file: "backend/src/models/auditRfqModel.js · auditRfqQuoteModel.js", collection: "audit-rfqs + audit-rfq-quotes", numbering: "RFQ-XXXXXX (auto)" },
    states: [
      { state: "DRAFT",           owner: "Buyer",   description: "RFQ being drafted." },
      { state: "PUBLISHED",       owner: "Buyer",   description: "Visible to invited auditors." },
      { state: "IN_QA",           owner: "(internal)", description: "Internal quality-check." },
      { state: "QUOTES_RECEIVED", owner: "Auditors",description: "Auditors have submitted quotes." },
      { state: "SHORTLISTED",     owner: "Buyer",   description: "Buyer has narrowed to top candidates." },
      { state: "AWARDED",         owner: "Buyer",   description: "A quote has been accepted." },
      { state: "CONVERTED",       owner: "(system)", description: "Terminal. Awarded quote linked to an auditRequest row." },
      { state: "CANCELLED",       owner: "Buyer",   description: "Terminal." },
      { state: "EXPIRED",         owner: "(auto)",  description: "Terminal. closingAt passed without award." },
    ],
    transitions: [
      { from: "(create)",         to: "DRAFT",           api: "POST /api/rfqs", required: "title, supplierOrgId, siteId, productIds[], closingAt", roles: "buyer", button: "+ New RFQ" },
      { from: "DRAFT",            to: "PUBLISHED",       api: "POST /api/rfqs/:id/publish", required: "scope + closingAt", roles: "buyer", button: "Publish" },
      { from: "PUBLISHED",        to: "QUOTES_RECEIVED", api: "(auto when first quote submitted)", required: "—", roles: "system", button: "(auto)" },
      { from: "PUBLISHED",        to: "PUBLISHED (with invites)", api: "POST /api/rfqs/:id/invite", required: "auditorOrgIds[]", roles: "buyer", button: "Invite Auditors" },
      { from: "QUOTES_RECEIVED",  to: "SHORTLISTED",     api: "PUT /api/rfqs/:id (status=SHORTLISTED)", required: "shortlist[]", roles: "buyer", button: "Shortlist" },
      { from: "QUOTES_RECEIVED|SHORTLISTED", to: "AWARDED", api: "POST /api/rfqs/:id/award (quoteId)", required: "awardedQuoteId", roles: "buyer", button: "Award" },
      { from: "AWARDED",          to: "CONVERTED",       api: "(auto linked to POST /api/audit-requests)", required: "audit request created", roles: "system", button: "(auto)" },
      { from: "(auditor side)",   to: "(quote) SUBMITTED", api: "POST /api/rfqs/:id/quotes", required: "lineItems[], totals, proposedSchedule", roles: "auditor", button: "Submit Quote" },
    ],
    aiAssists: [],
    closure: "CONVERTED is the terminal happy-path state. The awarded auditRfqQuote binds to a newly-created audit request row, which then enters the 8-phase audit lifecycle (module 9).",
    screens: [
      { route: "/rfqs", purpose: "RFQ list (buyer)" },
      { route: "/rfqs/[id]", purpose: "RFQ detail + quotes + Q&A threads + award" },
      { route: "/request-audit", purpose: "Buyer audit-request creation" },
    ],
  },

  // ───────────── 14. DESIGN CONTROL ─────────────
  {
    n: 14, key: "design",
    title: "Design Control (medical device)",
    iso: "21 CFR 820.30 · ISO 13485:2016 §7.3 · ISO 14971 (risk mgmt)",
    purpose: "Track a medical-device design through 8 phases (Planning → Input → Output → Review → Verification → Validation → Transfer → Changes). Maintain the Design History File (DHF). Link to Risk, Change Control, CAPA.",
    model: { file: "backend/src/models/DesignControlModel.js", collection: "design-controls", numbering: "DC-YYYY-NNNN (auto)" },
    classifications: ["CLASS_I", "CLASS_II", "CLASS_III", "IVD"],
    states: [
      { state: "DRAFT",          owner: "Product Engineer", description: "Draft; editable before any phase starts." },
      { state: "ACTIVE",         owner: "Product Engineer", description: "At least one phase is IN_PROGRESS." },
      { state: "DESIGN_FREEZE",  owner: "QA / RA",          description: "Design transfer complete; design frozen." },
      { state: "TRANSFERRED",    owner: "Manufacturing",    description: "Formal design transfer to manufacturing site." },
      { state: "OBSOLETE",       owner: "QA",               description: "Terminal. End-of-life." },
      { state: "CANCELLED",      owner: "QA",               description: "Terminal." },
    ],
    transitions: [
      { from: "(create)",         to: "DRAFT",         api: "POST /api/design-controls", required: "title, productName, deviceClass, regulatoryPathway", roles: "product engineer/admin", button: "+ Start Design" },
      { from: "DRAFT",            to: "ACTIVE",        api: "POST /api/design-controls/:id/advance-phase (to PLANNING)", required: "first phase started", roles: "product engineer", button: "Activate" },
      { from: "ACTIVE",           to: "ACTIVE (next phase)", api: "POST /api/design-controls/:id/advance-phase", required: "phase artifacts complete", roles: "product engineer/QA", button: "Advance Phase" },
      { from: "ACTIVE (REVIEW+)", to: "ACTIVE",        api: "POST /api/design-controls/:id/reviews", required: "reviewDate, attendees[], decision (PROCEED/REVISE/HOLD), actionItems[]", roles: "QA / reviewer", button: "Add Design Review" },
      { from: "ACTIVE (TRANSFER)", to: "DESIGN_FREEZE → TRANSFERRED", api: "POST /api/design-controls/:id/transfer", required: "manufacturingSiteId", roles: "QA / RA / admin", button: "Transfer" },
      { from: "TRANSFERRED",      to: "OBSOLETE",      api: "PUT /api/design-controls/:id (status=OBSOLETE)", required: "end-of-life decision", roles: "QA", button: "Obsolete" },
      { from: "(any non-terminal)", to: "CANCELLED",   api: "PUT /api/design-controls/:id (status=CANCELLED)", required: "cancellation reason", roles: "QA", button: "Cancel" },
    ],
    aiAssists: [],
    closure: "TRANSFERRED is the main happy-path terminal (device design released to manufacturing). OBSOLETE is the end-of-life terminal after market withdrawal.",
    screens: [{ route: "/design-controls", purpose: "Design register + phase tracker + review drawer" }],
  },
];

// ─── Cross-cutting infrastructure ───────────────────────────────────────
const crossCutting = [
  {
    name: "Electronic Signatures (21 CFR Part 11)",
    file: "backend/src/routes/electronicSignatureRoutes.js",
    summary: "Generic e-signature endpoint accepts {recordType, recordId, signatureMeaning, authMethod}. Captures content SHA-256 hash, signer IP, user-agent. Signatures cannot be repudiated; logged to DataIntegrityLog. Used by document-control approvals, MRM completion, CAPA closure.",
    api: "POST /api/electronic-signatures/sign",
  },
  {
    name: "AI Audit Trail (FDA AI guidance · Jan 2025)",
    file: "backend/src/services/ai/audit/aiAuditTrail.js",
    summary: "Every AI decision logs feature, prompt-version, retrieval-set hashes, output, confidence, grounded flag, provider+model, latency, accept/reject outcome. Enables drift dashboard + regulator-ready evidence.",
    api: "Internal: recordAiDecision() · POST /api/ai/decisions/outcome (user accept/reject)",
  },
  {
    name: "Universal Module Config",
    file: "backend/src/middleware/universalPlatform.js",
    summary: "Each tenant has modules.* boolean flags (EVENT_MANAGEMENT / DOCUMENT_CONTROL / RISK_MANAGEMENT / MANAGEMENT_REVIEW / CAPA / TRAINING / SUPPLIER_QUALITY / etc.). Frontend hides nav and 403s for disabled modules. Novex has all 15 enabled.",
    api: "GET /api/universal-platform/config",
  },
  {
    name: "Role middleware",
    file: "backend/src/middlewares/roleMiddleware.js",
    summary: "permit(...allowedRoles) gate. Roles normalised: tenantAdmin → tenant_admin, supplierUser → supplieruser, etc. Returns 403 with 'Forbidden: You don't have permission to access this resource.' if role not in allow-list.",
    api: "Used as middleware on every protected route",
  },
];

// ─── Renderer ────────────────────────────────────────────────────────────
function pill(text, kind = "neutral") {
  return `<span class="pill p-${kind}">${esc(text)}</span>`;
}

function stateRow(s) {
  return `<tr><td><code>${esc(s.state)}</code></td><td>${esc(s.owner)}</td><td>${esc(s.description)}</td></tr>`;
}

function transRow(t) {
  return `<tr>
    <td><code>${esc(t.from)}</code></td>
    <td><code>${esc(t.to)}</code></td>
    <td>${pill(t.button, "click")}</td>
    <td><code>${esc(t.api)}</code></td>
    <td>${esc(t.required)}</td>
    <td>${esc(t.roles)}</td>
  </tr>`;
}

function aiRow(a) {
  return `<tr>
    <td>${esc(a.name)}</td>
    <td><code>${esc(a.endpoint)}</code></td>
    <td>${esc(a.attachedTo)}</td>
    <td>${esc(a.inUI)}</td>
    <td>${esc(a.description)}</td>
  </tr>`;
}

function renderModule(m) {
  const stateRows = m.states.map(stateRow).join("");
  const transRows = m.transitions.map(transRow).join("");
  const aiRows = m.aiAssists.map(aiRow).join("");
  const screens = m.screens.map((s) => `<li><code>${esc(s.route)}</code> — ${esc(s.purpose)}</li>`).join("");
  const rpn = m.rpnBands ? `
    <h4>FMEA RPN bands</h4>
    <table class="kv">
      ${m.rpnBands.map((b) => `<tr><td><strong>${esc(b.band)}</strong></td><td>RPN ${esc(b.range)}</td></tr>`).join("")}
    </table>` : "";

  return `
  <section class="module">
    <h2 id="m-${esc(m.key)}">${m.n}. ${esc(m.title)}</h2>
    <table class="kv">
      <tr><td>Compliance</td><td>${esc(m.iso)}</td></tr>
      <tr><td>Purpose</td><td>${esc(m.purpose)}</td></tr>
      <tr><td>Model file</td><td><code>${esc(m.model.file)}</code></td></tr>
      <tr><td>Collection</td><td><code>${esc(m.model.collection)}</code></td></tr>
      <tr><td>Numbering</td><td><code>${esc(m.model.numbering)}</code></td></tr>
      ${m.classifications ? `<tr><td>Classification</td><td>${m.classifications.map((c) => pill(c, "warn")).join(" ")}</td></tr>` : ""}
    </table>
    ${rpn}

    <h4>Lifecycle states</h4>
    <table>
      <thead><tr><th>State</th><th>Primary owner</th><th>Description</th></tr></thead>
      <tbody>${stateRows}</tbody>
    </table>

    <h4>Legal transitions</h4>
    <table class="trans">
      <thead><tr><th>From</th><th>To</th><th>UI button</th><th>API</th><th>Required input</th><th>Allowed roles</th></tr></thead>
      <tbody>${transRows}</tbody>
    </table>

    <h4>AI assists wired to this module</h4>
    <table>
      <thead><tr><th>Agent</th><th>Endpoint</th><th>Attached to state</th><th>Where in UI</th><th>What it does</th></tr></thead>
      <tbody>${aiRows}</tbody>
    </table>

    <h4>Screens</h4>
    <ul>${screens}</ul>

    <h4>Closure conditions</h4>
    <p>${esc(m.closure)}</p>
  </section>`;
}

const totalStates = modules.reduce((s, m) => s + m.states.length, 0);
const totalTransitions = modules.reduce((s, m) => s + m.transitions.length, 0);
const totalAi = modules.reduce((s, m) => s + m.aiAssists.length, 0);

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye EQMS — Process-Flow Analysis v${VERSION}</title>
<meta name="hawkeye-doc-version" content="${VERSION}"/>
<meta name="hawkeye-revised" content="${REVISED}"/>
<style>
:root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --soft:#f9fafb; }
* { box-sizing:border-box; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink);
       max-width:1080px; margin:24px auto; padding:0 24px; line-height:1.5; font-size:13.5px; }
h1 { font-size:26px; margin:0 0 4px 0; }
h2 { font-size:20px; margin:32px 0 8px 0; padding-top:16px; border-top:3px solid var(--line); }
h3 { font-size:16px; margin:18px 0 6px 0; }
h4 { font-size:13px; margin:14px 0 6px 0; color:#374151; text-transform:uppercase; letter-spacing:.05em; }
.subtitle { color:var(--muted); font-size:13px; margin-bottom:18px; }
.banner { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 18px; margin:18px 0 24px 0; }
.banner table { width:100%; border-collapse:collapse; font-size:13px; }
.banner td { padding:3px 8px; vertical-align:top; }
.banner td:first-child { color:var(--muted); width:25%; }
.toc { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px 18px; }
.toc ol { margin:6px 0 0 18px; padding:0; }
.toc a { text-decoration:none; color:#1e40af; }
table { width:100%; border-collapse:collapse; font-size:11.5px; margin:6px 0 12px 0; }
table.kv td:first-child { color:var(--muted); width:22%; padding:3px 8px; }
table.kv td { padding:3px 8px; vertical-align:top; }
th, td { border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
th { background:var(--soft); font-weight:600; font-size:11.5px; }
table.trans th { font-size:11px; }
code { font-family:"SF Mono",Consolas,monospace; font-size:11px; background:#f3f4f6; padding:1px 5px; border-radius:3px; }
.module { page-break-inside: auto; }
.module h2 { page-break-before: auto; }

.pill { display:inline-block; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:4px; letter-spacing:.04em; margin-right:4px; }
.p-click  { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; }
.p-warn   { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.p-ok     { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; }
.p-neutral { background:#f3f4f6; color:#374151; border:1px solid #d1d5db; }

.cross { background:#fffbeb; border-left:3px solid #f59e0b; padding:8px 12px; border-radius:0 4px 4px 0; margin:8px 0; }
.cross h4 { margin:0 0 4px 0; color:#92400e; text-transform:none; letter-spacing:0; font-size:13px; }
.cross p { margin:2px 0; }

@page { size: Letter; margin: 12mm 12mm 14mm 12mm; }
@media print { body { font-size:11.5px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head><body>

<h1>Hawkeye EQMS — Process-Flow Analysis</h1>
<div class="subtitle">Per-module lifecycle, persona × action × API × screen mapping, AI integration. Source-of-truth document for the test plan and demo scripts.</div>

<section class="banner">
  <table>
    <tr><td>Document version</td><td><strong>v${VERSION}</strong></td></tr>
    <tr><td>Revised on</td><td>${REVISED}</td></tr>
    <tr><td>Revised by</td><td>${REVISED_BY}</td></tr>
    <tr><td>Revision note</td><td>${REVISION_NOTE}</td></tr>
    <tr><td>Modules covered</td><td>${modules.length} (${modules.map((m) => m.title).join(" · ")})</td></tr>
    <tr><td>Total lifecycle states</td><td>${totalStates}</td></tr>
    <tr><td>Total legal transitions</td><td>${totalTransitions}</td></tr>
    <tr><td>AI assists wired in</td><td>${totalAi}</td></tr>
  </table>
</section>

<section class="toc">
  <strong>Contents</strong>
  <ol>
    ${modules.map((m) => `<li><a href="#m-${m.key}">${esc(m.title)}</a></li>`).join("")}
    <li><a href="#cross">Cross-cutting infrastructure</a></li>
  </ol>
</section>

${modules.map(renderModule).join("")}

<section class="module" id="cross">
  <h2>Cross-cutting infrastructure</h2>
  ${crossCutting.map((c) => `
    <div class="cross">
      <h4>${esc(c.name)}</h4>
      <p><strong>File:</strong> <code>${esc(c.file)}</code></p>
      <p><strong>Endpoint:</strong> <code>${esc(c.api)}</code></p>
      <p>${esc(c.summary)}</p>
    </div>
  `).join("")}
</section>

</body></html>`;

fs.writeFileSync(outHtml, html);
const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
await page.goto(pathToFileURL(outHtml).href, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({ path: outPdf, format: "Letter", printBackground: true, margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" } });
await browser.close();

console.log("wrote", outHtml);
console.log("wrote", outPdf, fs.statSync(outPdf).size, "bytes");
