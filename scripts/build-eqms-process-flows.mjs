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

const VERSION = "2.0";
const REVISED = "2026-04-24";
const REVISED_BY = "Hawkeye Engineering";
const REVISION_NOTE = "Adds AI-assist mapping, persona × action matrix, and detailed state transitions verified against live code.";

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
