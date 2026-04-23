/**
 * build-novex-demo-pdf.mjs
 *
 * Assembles a single tabbed HTML deliverable + renders it as PDF for the
 * Novex Pharma · EQMS demo. Pulls screenshots captured by the Playwright
 * spec at frontend/e2e/novex-eqms-demo-capture.spec.ts and embeds them
 * inline (base64) so the PDF is standalone — no external references.
 *
 * Output:
 *   backend/docs/03-user-guides/novex-eqms-demo.html
 *   backend/docs/03-user-guides/novex-eqms-demo.pdf
 *
 * Usage:
 *   node scripts/build-novex-demo-pdf.mjs              # build HTML + PDF
 *   node scripts/build-novex-demo-pdf.mjs --html-only  # skip PDF step
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const FRONTEND_ROOT = join(ROOT, "..", "frontend");
const SHOTS_DIR = join(FRONTEND_ROOT, "demo-artifacts", "novex-demo");
const OUT_HTML = join(ROOT, "docs", "03-user-guides", "novex-eqms-demo.html");
const OUT_PDF = join(ROOT, "docs", "03-user-guides", "novex-eqms-demo.pdf");

const htmlOnly = process.argv.includes("--html-only");

// ═══════════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════════

const TENANT = {
  name: "Novex Pharma Inc.",
  id: "69e64e7869b2ba745d40bb89",
  type: "INTERNAL (pharma-manufacturing, full-EQMS)",
  industryProfile: "PHARMA_GMP",
  password: "EqmsDemo@2026",
  frontendUrl: "https://hawkeye-frontend-dev-chi.vercel.app",
  backendUrl: "https://hawkeye-backend-dev.vercel.app",
};

const PERSONAS = [
  {
    slug: "vp-quality",
    email: "vp.quality@novex-pharma.demo",
    name: "Dr Elena Vasquez",
    title: "VP of Quality",
    role: "tenant_admin",
    group: "QA Leadership",
    groupColor: "#7c3aed",
    responsibilities: [
      "Management Review chair (quarterly MRM)",
      "Final approver for high-risk CAPAs, change controls, audit reports",
      "Tenant-wide policy and module configuration",
      "Regulatory liaison for major filings",
    ],
    modules: ["MANAGEMENT_REVIEW", "AUDIT_MANAGEMENT", "CAPA_MANAGEMENT", "CHANGE_CONTROL", "RISK_MANAGEMENT"],
  },
  {
    slug: "qa-head",
    email: "qa.head@novex-pharma.demo",
    name: "James Thompson",
    title: "Head of QA",
    role: "admin",
    group: "QA Leadership",
    groupColor: "#7c3aed",
    responsibilities: [
      "Approves deviation investigations and CAPA plans",
      "Batch release sign-off",
      "Doc-control approver for SOPs",
      "Owns the day-to-day QMS operation",
    ],
    modules: ["EVENT_MANAGEMENT", "CAPA_MANAGEMENT", "DOCUMENT_CONTROL", "AUDIT_MANAGEMENT"],
  },
  {
    slug: "qa-specialist",
    email: "qa.specialist@novex-pharma.demo",
    name: "Kenji Tanaka",
    title: "Senior QA Specialist",
    role: "user",
    group: "EQMS Specialists",
    groupColor: "#059669",
    responsibilities: [
      "Leads deviation investigations (5-why, fishbone)",
      "CAPA owner for process-related non-conformances",
      "Risk-assessment author (FMEA, ICH Q9)",
      "Tracks effectiveness checks",
    ],
    modules: ["EVENT_MANAGEMENT", "CAPA_MANAGEMENT", "RISK_MANAGEMENT"],
  },
  {
    slug: "doc-control",
    email: "doc.control@novex-pharma.demo",
    name: "Sarah O'Brien",
    title: "Document Control Officer",
    role: "user",
    group: "EQMS Specialists",
    groupColor: "#059669",
    responsibilities: [
      "Authors and versions SOPs, work instructions, forms",
      "Routes change-control requests",
      "Maintains controlled-document register",
      "Owns the training-material library",
    ],
    modules: ["DOCUMENT_CONTROL", "CHANGE_CONTROL", "TRAINING_MANAGEMENT"],
  },
  {
    slug: "training-coord",
    email: "training.coord@novex-pharma.demo",
    name: "Rebecca Kim",
    title: "Training Coordinator",
    role: "user",
    group: "EQMS Specialists",
    groupColor: "#059669",
    responsibilities: [
      "Builds role-based training curricula",
      "Assigns read-and-understood for new SOP revisions",
      "Tracks competency attestations",
      "Monitors training-due KPIs",
    ],
    modules: ["TRAINING_MANAGEMENT", "DOCUMENT_CONTROL"],
  },
  {
    slug: "regulatory",
    email: "regulatory@novex-pharma.demo",
    name: "Marcus Brown",
    title: "Regulatory Affairs Manager",
    role: "user",
    group: "EQMS Specialists",
    groupColor: "#059669",
    responsibilities: [
      "Assesses regulatory impact of change controls",
      "Consumes FDA / EMA regulatory intel feeds",
      "Owns submissions and variations",
      "Maintains site DMFs and CEPs",
    ],
    modules: ["REGULATORY_INTEL", "CHANGE_CONTROL"],
  },
  {
    slug: "audit-program",
    email: "audit.program@novex-pharma.demo",
    name: "Priya Nair",
    title: "Internal Audit Program Manager",
    role: "buyer",
    group: "Internal Audit",
    groupColor: "#2563eb",
    responsibilities: [
      "Schedules the annual internal-audit program",
      "Creates audit requests and assigns lead auditors",
      "Tracks audit-cycle coverage across departments",
      "Owns the audit committee reporting line",
    ],
    modules: ["AUDIT_MANAGEMENT", "SUPPLIER_QUALITY"],
  },
  {
    slug: "audit-lead",
    email: "audit.lead@novex-pharma.demo",
    name: "Maria Santos",
    title: "Lead Internal Auditor",
    role: "auditor",
    group: "Internal Audit",
    groupColor: "#2563eb",
    responsibilities: [
      "Executes internal GMP audits per ICH Q10",
      "Issues findings and tracks observations",
      "Reviews supplier attachments and evidence",
      "Writes the final audit report",
    ],
    modules: ["AUDIT_MANAGEMENT", "CAPA_MANAGEMENT"],
  },
  {
    slug: "production-head",
    email: "production.head@novex-pharma.demo",
    name: "Michael Foster",
    title: "Head of Production",
    role: "supplier",
    group: "Auditee Departments",
    groupColor: "#ea580c",
    responsibilities: [
      "Auditee head for Production internal audits",
      "Receives questionnaires and fans sections out to team",
      "Raises deviations for process excursions",
      "Owns CAPAs for production-related findings",
    ],
    modules: ["AUDIT_MANAGEMENT", "EVENT_MANAGEMENT", "CAPA_MANAGEMENT", "BATCH_RECORDS"],
  },
  {
    slug: "qc-lab",
    email: "qc.lab@novex-pharma.demo",
    name: "Dr Aisha Patel",
    title: "QC Lab Lead",
    role: "supplierUser",
    group: "Auditee Departments",
    groupColor: "#ea580c",
    responsibilities: [
      "Responds to QC sections of internal audits",
      "Files OOS / OOT investigations",
      "Owns test-method deviation workflow",
      "Maintains CoC for sample transfer",
    ],
    modules: ["EVENT_MANAGEMENT", "CHAIN_OF_CUSTODY", "AUDIT_MANAGEMENT"],
  },
  {
    slug: "maintenance",
    email: "maintenance@novex-pharma.demo",
    name: "Lars Nilsson",
    title: "Maintenance Engineer",
    role: "supplierUser",
    group: "Auditee Departments",
    groupColor: "#ea580c",
    responsibilities: [
      "Registers and qualifies plant equipment (IQ/OQ/PQ)",
      "Responds to Engineering sections of internal audits",
      "Owns equipment-related CAPAs",
      "Runs preventive-maintenance schedules",
    ],
    modules: ["ASSET_MANAGEMENT", "AUDIT_MANAGEMENT", "CAPA_MANAGEMENT"],
  },
];

const MODULES = [
  { key: "AUDIT_MANAGEMENT", name: "Audit Management", summary: "Full lifecycle for internal GMP audits — scheduling, questionnaires, findings, reports.", tint: "#2563eb" },
  { key: "EVENT_MANAGEMENT", name: "Deviations / Event Mgmt", summary: "OOS, OOT, process excursions. 21 CFR Part 11 audit trail.", tint: "#dc2626" },
  { key: "CAPA_MANAGEMENT", name: "CAPA", summary: "Root-cause, corrective & preventive actions, effectiveness checks.", tint: "#059669" },
  { key: "DOCUMENT_CONTROL", name: "Document Control", summary: "SOPs, work instructions, forms. Versioned, approved, trained.", tint: "#0ea5e9" },
  { key: "CHANGE_CONTROL", name: "Change Control", summary: "Controlled changes with regulatory-impact assessment and approvals.", tint: "#f59e0b" },
  { key: "TRAINING_MANAGEMENT", name: "Training", summary: "Role-based curricula, read-and-understood, competency tracking.", tint: "#8b5cf6" },
  { key: "RISK_MANAGEMENT", name: "Risk", summary: "ICH Q9 risk assessments, FMEA, risk register, mitigation plans.", tint: "#ef4444" },
  { key: "MANAGEMENT_REVIEW", name: "Management Review", summary: "Quarterly MRM — KPIs, findings, CAPAs, resource decisions.", tint: "#7c3aed" },
  { key: "ASSET_MANAGEMENT", name: "Asset / Equipment", summary: "IQ/OQ/PQ, calibration, preventive maintenance.", tint: "#14b8a6" },
  { key: "SUPPLIER_QUALITY", name: "Supplier Quality", summary: "External supplier qualification, periodic evaluation, audit program.", tint: "#f97316" },
  { key: "REGULATORY_INTEL", name: "Regulatory Intel", summary: "FDA / EMA feeds, warning letters, import alerts. AI-summarised.", tint: "#be185d" },
  { key: "CHAIN_OF_CUSTODY", name: "Chain of Custody", summary: "Sample + material transfer tracking between departments and labs.", tint: "#475569" },
  { key: "TRANSACTION_REVIEW", name: "Transaction Review", summary: "Data-integrity review of critical records.", tint: "#0891b2" },
  { key: "AI_ASSISTANT", name: "AskHawk AI Assistant", summary: "RAG over SOPs, GxP guidance, audit findings.", tint: "#6366f1" },
  { key: "RFQ_PROCUREMENT", name: "RFQ / Procurement", summary: "Supplier RFQs, quote comparison, award workflow.", tint: "#16a34a" },
];

const SCENARIOS = [
  {
    id: 1,
    title: "Internal GMP Audit of Production",
    modules: ["AUDIT_MANAGEMENT", "CAPA_MANAGEMENT"],
    personas: ["audit-program", "audit-lead", "production-head", "qc-lab", "maintenance"],
    summary:
      "End-to-end internal audit of the Production department, from scheduling to final report and CAPA.",
    steps: [
      "Priya schedules an internal audit of Production, selecting the Cambridge Manufacturing site.",
      "Maria is assigned as Lead Internal Auditor, accepts the assignment.",
      "Maria sends the GMP questionnaire (template PSCI) to Michael (auditee head).",
      "Michael fans sections out: QC questions → Aisha, Engineering questions → Lars.",
      "Aisha and Lars complete their sections, upload evidence (SOPs, IQ/OQ records, logbook PDFs).",
      "Michael consolidates and submits the full response to Maria.",
      "Maria reviews, raises 3 observations (1 major, 2 minor), attaches findings to audit report.",
      "Report is issued; Priya opens 3 CAPAs auto-linked to the findings.",
    ],
  },
  {
    id: 2,
    title: "OOS Deviation → CAPA Investigation",
    modules: ["EVENT_MANAGEMENT", "CAPA_MANAGEMENT", "RISK_MANAGEMENT"],
    personas: ["qc-lab", "qa-specialist", "qa-head", "vp-quality"],
    summary:
      "An Out-of-Specification result triggers a full investigation, CAPA plan, and risk re-assessment.",
    steps: [
      "Aisha (QC) observes OOS result on assay for batch NVX-2026-B014; files deviation.",
      "System auto-notifies Kenji (QA Specialist) as deviation investigator.",
      "Kenji runs 5-why + fishbone; root cause traced to supplier reagent lot variability.",
      "Kenji drafts CAPA: update incoming-material specification + add supplier CAR.",
      "Risk reassessment opens: Kenji raises severity of reagent-failure risk from Low → Medium.",
      "James (Head QA) reviews and approves CAPA plan; target-close in 30 days.",
      "Elena (VP) notified for trend review in next MRM.",
      "Effectiveness check scheduled for +90 days; CAPA closed.",
    ],
  },
  {
    id: 3,
    title: "SOP Revision with Training Rollout",
    modules: ["DOCUMENT_CONTROL", "CHANGE_CONTROL", "TRAINING_MANAGEMENT"],
    personas: ["doc-control", "regulatory", "vp-quality", "training-coord"],
    summary:
      "New SOP revision passes through change control, regulatory review, VP approval, and training deployment.",
    steps: [
      "Sarah (Doc Control) drafts SOP-QC-014 rev 3 — updated analytical method.",
      "Change-control request auto-raised; routes to regulatory and QA heads.",
      "Marcus (Regulatory) flags the change as NOT FDA-reportable (notifiable only).",
      "Elena (VP) approves the rev with e-signature.",
      "Sarah publishes rev 3, supersedes rev 2, auto-archives.",
      "Rebecca (Training) creates read-and-understood assignment to all QC lab personnel.",
      "Each QC user completes the assignment within 7-day due date.",
      "Compliance dashboard updates: 100% trained on new rev.",
    ],
  },
  {
    id: 4,
    title: "Equipment Qualification (IQ/OQ/PQ)",
    modules: ["ASSET_MANAGEMENT", "RISK_MANAGEMENT", "DOCUMENT_CONTROL"],
    personas: ["maintenance", "qa-specialist", "qa-head"],
    summary:
      "A new tablet press is registered, risk-assessed, qualified, and released for GMP operations.",
    steps: [
      "Lars (Maintenance) registers new Korsch XL-400 tablet press in Asset Management.",
      "Kenji runs risk assessment: ICH Q9 FMEA on the press (critical-to-quality attributes).",
      "Lars executes IQ protocol; PDF attached with signed checklists.",
      "Lars runs OQ (operational) and PQ (performance) — 3 validation batches.",
      "Deviations raised: none. All within acceptance criteria.",
      "James (Head QA) reviews validation package, issues GMP-release certificate.",
      "Press status moved to QUALIFIED; preventive-maintenance schedule activated.",
      "Asset is now available for batch production.",
    ],
  },
  {
    id: 5,
    title: "Quarterly Management Review Meeting",
    modules: ["MANAGEMENT_REVIEW", "AUDIT_MANAGEMENT", "CAPA_MANAGEMENT", "RISK_MANAGEMENT"],
    personas: ["vp-quality", "qa-head", "audit-program", "qa-specialist"],
    summary:
      "Elena chairs the quarterly MRM; the platform aggregates KPIs, open CAPAs, training, risks, and audit findings.",
    steps: [
      "Elena opens MRM Q2-2026 in the Management Review module.",
      "System auto-populates inputs: 14 open CAPAs, 3 overdue, 2 open audits, 5 deviations this quarter.",
      "James presents audit-program status and CAPA aging.",
      "Kenji presents top-5 risk-register items and mitigation progress.",
      "Elena records decisions: allocate QA headcount, approve new training curriculum.",
      "Actions are linked to named owners with due dates.",
      "Meeting minutes are e-signed, stored in QMS vault, next MRM auto-scheduled.",
    ],
  },
  {
    id: 6,
    title: "Change Control with FDA Regulatory Impact",
    modules: ["CHANGE_CONTROL", "REGULATORY_INTEL", "DOCUMENT_CONTROL"],
    personas: ["doc-control", "regulatory", "vp-quality", "qa-head"],
    summary:
      "A formulation change is proposed; regulatory flag triggers FDA supplement filing before approval.",
    steps: [
      "Sarah drafts change: replace excipient supplier for Novexolimus 1 mg tablet.",
      "Marcus reviews — flags as major change, requires CBE-30 supplement to FDA.",
      "James (Head QA) holds the change pending filing.",
      "Supplement prepared and filed via Regulatory Intel workflow.",
      "FDA acknowledges receipt; 30-day CBE clock starts.",
      "After 30 days and no objection, Elena approves implementation.",
      "Sarah updates related SOPs and specifications, supersedes prior versions.",
      "Rebecca assigns training, closing the change-control loop.",
    ],
  },
  {
    id: 7,
    title: "Customer Complaint → CAPA → Process Change",
    modules: ["COMPLAINT_MGR", "CAPA_MANAGEMENT", "RISK_MANAGEMENT"],
    personas: ["qa-head", "qa-specialist", "production-head", "vp-quality"],
    summary:
      "A field complaint about tablet chipping triggers investigation, CAPA, and process change.",
    steps: [
      "External complaint logged: tablet chipping observed in wholesale lot.",
      "James acknowledges within 24 hrs per complaint-handling SOP.",
      "Kenji investigates: root cause traced to new packaging-line conveyor speed.",
      "Michael (Production) adjusts SOP, revalidates packaging speed.",
      "CAPA opened to update risk register + harmonize speed limits across lines.",
      "Elena reviews complaint trend in next MRM: 1 vs 0 baseline — monitors.",
      "Effectiveness verified after 60 days (no recurrence); CAPA closed.",
    ],
  },
  {
    id: 8,
    title: "Non-Conformance Batch Investigation",
    modules: ["EVENT_MANAGEMENT", "CAPA_MANAGEMENT", "AUDIT_MANAGEMENT"],
    personas: ["qc-lab", "qa-specialist", "qa-head", "production-head"],
    summary:
      "A QC failure triggers non-conformance, batch investigation, disposition decision, and linked CAPA.",
    steps: [
      "Aisha reports batch NVX-2026-B017 fails dissolution spec.",
      "Non-conformance auto-opened; batch quarantined in ERP.",
      "Kenji investigates: production record audit + raw-material trace-back.",
      "Root cause: blending-time drift from target on the production line.",
      "James and Michael jointly decide: REJECT batch, release materials for rework.",
      "CAPA: install real-time blending-time alarm on line 2.",
      "Non-conformance closed with linked CAPA; trending visible in MRM.",
    ],
  },
  {
    id: 9,
    title: "Chain-of-Custody for QC Sample Transfer",
    modules: ["CHAIN_OF_CUSTODY", "TRANSACTION_REVIEW"],
    personas: ["qc-lab", "production-head", "maintenance"],
    summary:
      "Sample move from Production → QC → stability lab tracked with full custody + transaction audit.",
    steps: [
      "Michael sends stability sample to QC Lab; CoC form auto-generated with barcode.",
      "Aisha scans barcode on receipt; chain-of-custody timestamped.",
      "Sample stored under 25°C/60% RH; IoT sensor logs entered against CoC record.",
      "After 30 days, sub-sample transferred to stability-ageing chamber (Lars IoT-linked).",
      "Transaction review flags any custody gap >15 min; none found.",
      "Stability result posted; CoC record audit-complete, e-signed.",
    ],
  },
  {
    id: 10,
    title: "External Supplier Qualification + Audit",
    modules: ["SUPPLIER_QUALITY", "AUDIT_MANAGEMENT", "RFQ_PROCUREMENT"],
    personas: ["audit-program", "audit-lead", "regulatory"],
    summary:
      "Re-qualification of an API supplier — RFQ round, paper audit, on-site audit, approval.",
    steps: [
      "Priya triggers 2-year re-evaluation of API supplier on approved list.",
      "RFQ sent to 3 candidate suppliers; quotes returned.",
      "Priya launches paper audit (questionnaire) against the incumbent.",
      "Marcus reviews regulatory compliance status (DMF, WHO-PQ).",
      "On-site audit scheduled; Maria conducts 2-day audit at supplier plant.",
      "Findings: 1 minor; supplier CAPA accepted.",
      "Supplier remains on approved list; expires 2 years out.",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS FLOWS (Mermaid)
// ═══════════════════════════════════════════════════════════════════════════════

const FLOWS = {
  overview: `flowchart LR
    classDef lead fill:#7c3aed,color:#fff,stroke:#4c1d95
    classDef spec fill:#059669,color:#fff,stroke:#047857
    classDef audit fill:#2563eb,color:#fff,stroke:#1e3a8a
    classDef auditee fill:#ea580c,color:#fff,stroke:#9a3412
    VP[Dr Elena Vasquez<br/>VP Quality]:::lead
    QAH[James Thompson<br/>Head of QA]:::lead
    QAS[Kenji Tanaka<br/>QA Specialist]:::spec
    DOC[Sarah O'Brien<br/>Doc Control]:::spec
    TRN[Rebecca Kim<br/>Training]:::spec
    REG[Marcus Brown<br/>Regulatory]:::spec
    APM[Priya Nair<br/>Audit Program]:::audit
    ALE[Maria Santos<br/>Lead Auditor]:::audit
    PRD[Michael Foster<br/>Production]:::auditee
    QCL[Dr Aisha Patel<br/>QC Lab]:::auditee
    MNT[Lars Nilsson<br/>Maintenance]:::auditee
    APM -->|schedule + assign| ALE
    ALE -->|questionnaire| PRD
    PRD -->|fan-out sections| QCL & MNT
    QCL & MNT -->|responses + evidence| PRD
    PRD -->|consolidated| ALE
    ALE -->|findings| QAS
    QAS -->|CAPA plan| QAH
    QAH -->|approve| VP
    DOC -->|SOP revisions| QAH
    DOC -->|training trigger| TRN
    REG -->|reg impact| QAH
    VP -->|MRM decisions| QAH`,

  auditLifecycle: `flowchart TD
    classDef step fill:#2563eb,color:#fff,stroke:#1e3a8a
    A[1. Audit Program Mgr<br/>creates internal audit]:::step
    B[2. Lead Auditor<br/>accepts + plans]:::step
    C[3. Auditor sends<br/>questionnaire]:::step
    D[4. Auditee Head<br/>assigns sections]:::step
    E[5. Dept members<br/>respond + attach]:::step
    F[6. Auditee consolidates<br/>+ submits]:::step
    G[7. Auditor reviews<br/>+ raises findings]:::step
    H[8. Report issued<br/>+ CAPAs opened]:::step
    A --> B --> C --> D --> E --> F --> G --> H`,

  deviationCapa: `flowchart LR
    classDef red fill:#dc2626,color:#fff,stroke:#7f1d1d
    classDef grn fill:#059669,color:#fff,stroke:#065f46
    D[Deviation filed<br/>by QC]:::red
    I[Investigation<br/>by QA Spec]:::red
    R[Root-cause identified]:::red
    C[CAPA plan drafted]:::grn
    A[Approval by<br/>Head of QA]:::grn
    E[Effectiveness check<br/>+90 days]:::grn
    D --> I --> R --> C --> A --> E`,

  docControl: `flowchart LR
    classDef blue fill:#0ea5e9,color:#fff,stroke:#075985
    classDef amber fill:#f59e0b,color:#fff,stroke:#92400e
    classDef purple fill:#8b5cf6,color:#fff,stroke:#5b21b6
    D[Sarah drafts<br/>SOP revision]:::blue
    C[Change control<br/>raised]:::amber
    R[Regulatory impact<br/>assessment]:::amber
    V[VP approval<br/>e-signature]:::amber
    P[Publish<br/>supersede prior]:::blue
    T[Training assigned<br/>read-and-understood]:::purple
    K[Competency<br/>tracked]:::purple
    D --> C --> R --> V --> P --> T --> K`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT LOADING
// ═══════════════════════════════════════════════════════════════════════════════

function loadShots() {
  if (!existsSync(SHOTS_DIR)) {
    console.log(`  (no screenshots at ${SHOTS_DIR} — continuing without them)`);
    return {};
  }
  const files = readdirSync(SHOTS_DIR).filter((f) => f.endsWith(".png"));
  console.log(`  loaded ${files.length} screenshots from ${SHOTS_DIR}`);
  const map = {};
  for (const f of files) {
    const data = readFileSync(join(SHOTS_DIR, f)).toString("base64");
    map[f] = `data:image/png;base64,${data}`;
  }
  return map;
}

function shotsFor(personaSlug, shots) {
  const prefix = `${personaSlug}__`;
  return Object.keys(shots)
    .filter((k) => k.startsWith(prefix))
    .sort();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════════

function buildHtml(shots) {
  const css = /* css */ `
    :root {
      --bg: #f8fafc;
      --panel: #ffffff;
      --ink: #0f172a;
      --dim: #64748b;
      --blue: #2563eb;
      --green: #059669;
      --purple: #7c3aed;
      --orange: #ea580c;
      --red: #dc2626;
      --amber: #f59e0b;
      --border: #e2e8f0;
      --hover: #f1f5f9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px; line-height: 1.5; color: var(--ink); background: var(--bg);
    }
    .page { max-width: 1100px; margin: 0 auto; padding: 28px; }
    .cover {
      background: linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%);
      color: #fff; padding: 56px 48px; border-radius: 12px; margin-bottom: 32px;
    }
    .cover h1 { margin: 0 0 10px 0; font-size: 32px; letter-spacing: -0.02em; }
    .cover p { margin: 4px 0; font-size: 15px; opacity: 0.94; }
    .cover .meta { margin-top: 24px; display: flex; gap: 20px; flex-wrap: wrap; font-size: 12px; }
    .cover .meta span { background: rgba(255,255,255,0.15); padding: 6px 12px; border-radius: 6px; }

    h2 { font-size: 22px; margin: 0 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid var(--blue); color: var(--ink); }
    h3 { font-size: 16px; margin: 20px 0 10px 0; }
    h4 { font-size: 14px; margin: 14px 0 6px 0; color: var(--dim); text-transform: uppercase; letter-spacing: 0.04em; }
    p { margin: 6px 0; }

    /* Tabs (CSS-only, radio-button pattern) */
    .tabs { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 32px; }
    .tabs input[type=radio] { display: none; }
    .tab-labels { display: flex; background: #f1f5f9; border-bottom: 1px solid var(--border); }
    .tab-labels label {
      flex: 1; padding: 14px 18px; cursor: pointer; font-weight: 600; font-size: 13px;
      text-align: center; color: var(--dim); border-right: 1px solid var(--border); transition: all 0.15s;
    }
    .tab-labels label:last-child { border-right: none; }
    .tab-labels label:hover { background: #e2e8f0; color: var(--ink); }
    .tab-content { display: none; padding: 28px; background: var(--panel); }
    #tab1:checked ~ .tab-labels label[for=tab1],
    #tab2:checked ~ .tab-labels label[for=tab2],
    #tab3:checked ~ .tab-labels label[for=tab3],
    #tab4:checked ~ .tab-labels label[for=tab4],
    #tab5:checked ~ .tab-labels label[for=tab5] {
      background: var(--panel); color: var(--blue); border-bottom: 3px solid var(--blue);
    }
    #tab1:checked ~ #c-tab1,
    #tab2:checked ~ #c-tab2,
    #tab3:checked ~ #c-tab3,
    #tab4:checked ~ #c-tab4,
    #tab5:checked ~ #c-tab5 { display: block; }

    /* Cards + grids */
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; margin-bottom: 14px; }
    .card.pinstripe { border-left: 4px solid var(--blue); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; margin-right: 4px; margin-bottom: 2px; }
    .pill { display: inline-block; padding: 3px 10px; border-radius: 12px; background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 600; }

    /* Persona card */
    .persona { border-top: 4px solid #2563eb; border-radius: 8px; background: var(--panel); border-left: 1px solid var(--border); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 18px; margin-bottom: 22px; }
    .persona header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
    .persona h3 { margin: 0; font-size: 17px; }
    .persona .role-chip { font-size: 11px; background: #e2e8f0; padding: 3px 9px; border-radius: 10px; color: #334155; font-family: monospace; }
    .persona .email { color: var(--dim); font-family: monospace; font-size: 12px; margin-bottom: 10px; }
    .persona ul { margin: 6px 0; padding-left: 20px; }
    .persona li { margin: 3px 0; }
    .persona .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .persona .shots figure { margin: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: #fafafa; }
    .persona .shots img { width: 100%; height: auto; display: block; }
    .persona .shots figcaption { padding: 6px 10px; font-size: 11px; color: var(--dim); background: #f8fafc; border-top: 1px solid var(--border); }

    /* Scenario */
    .scenario { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 18px; page-break-inside: avoid; }
    .scenario header { margin-bottom: 8px; }
    .scenario .num { display: inline-block; width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: var(--blue); color: #fff; text-align: center; font-weight: 700; margin-right: 10px; }
    .scenario ol { margin: 10px 0 0 0; padding-left: 42px; }
    .scenario ol li { margin: 6px 0; }
    .scenario .mods { margin-top: 10px; }

    /* Module card */
    .module { padding: 14px 16px; border-radius: 8px; background: var(--panel); border: 1px solid var(--border); border-left: 5px solid var(--blue); }
    .module h4 { margin: 0 0 4px 0; text-transform: none; letter-spacing: 0; font-size: 14px; color: var(--ink); }
    .module p { margin: 0; color: var(--dim); font-size: 12px; }

    /* Process-flow wrapper */
    .flow { background: #fafafa; border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 12px 0; }
    .flow h4 { margin-top: 0; color: var(--ink); text-transform: none; letter-spacing: 0; font-size: 14px; font-weight: 700; }

    /* Credentials table */
    table.creds { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    table.creds th, table.creds td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }
    table.creds th { background: #f1f5f9; font-weight: 600; color: var(--dim); text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    table.creds tr:nth-child(even) { background: #fafafa; }
    code { font-family: "Menlo", "Consolas", monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 11px; }

    /* PRINT — unfold tabs, stack everything, portrait */
    @media print {
      body { background: #fff; font-size: 11px; }
      .page { padding: 8px; max-width: 100%; }
      .tabs { border: none; margin: 0; box-shadow: none; border-radius: 0; }
      .tab-labels { display: none; }
      .tab-content { display: block !important; padding: 0; border-top: 2px solid var(--blue); margin-top: 24px; padding-top: 16px; page-break-before: always; }
      .tab-content:first-of-type { page-break-before: auto; }
      .tab-content::before {
        content: attr(data-title);
        display: block; font-size: 26px; font-weight: 700; color: var(--blue);
        border-bottom: 2px solid var(--blue); padding-bottom: 6px; margin-bottom: 16px;
      }
      .cover { padding: 40px 32px; page-break-after: always; }
      .scenario { page-break-inside: avoid; }
      .persona { page-break-inside: avoid; }
      .module { page-break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
  `;

  const personaBlock = (p) => {
    const shotKeys = shotsFor(p.slug, shots);
    const figs = shotKeys
      .map((k) => {
        const label = k.replace(`${p.slug}__`, "").replace(".png", "").replace(/^[0-9]+-/, "");
        return `<figure><img src="${shots[k]}" alt="${label}" /><figcaption>${label}</figcaption></figure>`;
      })
      .join("");
    return `
      <section class="persona" style="border-top-color:${p.groupColor}">
        <header>
          <h3>${p.name} · ${p.title}</h3>
          <span class="role-chip">${p.role}</span>
        </header>
        <div class="email">${p.email}</div>
        <div style="margin: 4px 0 8px 0;">
          <span class="badge" style="background:${p.groupColor}">${p.group}</span>
          ${p.modules.map((m) => `<span class="pill">${m}</span>`).join(" ")}
        </div>
        <h4>Core responsibilities</h4>
        <ul>${p.responsibilities.map((r) => `<li>${r}</li>`).join("")}</ul>
        ${shotKeys.length ? `<h4>Screens</h4><div class="shots">${figs}</div>` : ""}
      </section>
    `;
  };

  const scenarioBlock = (s) => `
    <div class="scenario">
      <header>
        <h3><span class="num">${s.id}</span>${s.title}</h3>
      </header>
      <p><em>${s.summary}</em></p>
      <div class="mods">
        ${s.modules.map((m) => `<span class="pill">${m}</span>`).join(" ")}
      </div>
      <ol>${s.steps.map((st) => `<li>${st}</li>`).join("")}</ol>
      <div style="margin-top:10px; font-size:11px; color:var(--dim);">
        <strong>Personas:</strong> ${s.personas
          .map((pid) => {
            const p = PERSONAS.find((x) => x.slug === pid);
            return p ? `${p.name} (${p.title})` : pid;
          })
          .join(" · ")}
      </div>
    </div>
  `;

  const moduleBlock = (m) => `
    <div class="module" style="border-left-color:${m.tint}">
      <h4>${m.name} <span style="font-family:monospace; color:${m.tint}; font-size:11px; margin-left:6px;">${m.key}</span></h4>
      <p>${m.summary}</p>
    </div>
  `;

  const credsRows = PERSONAS.map(
    (p) => `
    <tr>
      <td><code>${p.email}</code></td>
      <td><span class="role-chip">${p.role}</span></td>
      <td>${p.name}</td>
      <td>${p.title}</td>
      <td><span class="badge" style="background:${p.groupColor}">${p.group}</span></td>
    </tr>
  `
  ).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Novex Pharma · EQMS Demo</title>
<style>${css}</style>
<script type="module" src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "default" });
</script>
</head>
<body>
<div class="page">
  <section class="cover">
    <h1>${TENANT.name}</h1>
    <p style="font-size:18px; font-weight:500; margin-top:6px;">Full-EQMS + Internal Audit · Live Demo Guide</p>
    <p>Tenant type: ${TENANT.type}</p>
    <p>Industry profile: ${TENANT.industryProfile} · All 15 EQMS modules enabled</p>
    <div class="meta">
      <span>Tenant ID: ${TENANT.id}</span>
      <span>Password: ${TENANT.password}</span>
      <span>Frontend: ${TENANT.frontendUrl}</span>
      <span>Generated: ${new Date().toISOString().slice(0, 10)}</span>
    </div>
  </section>

  <div class="tabs">
    <input type="radio" id="tab1" name="tabs" checked>
    <input type="radio" id="tab2" name="tabs">
    <input type="radio" id="tab3" name="tabs">
    <input type="radio" id="tab4" name="tabs">
    <input type="radio" id="tab5" name="tabs">

    <div class="tab-labels">
      <label for="tab1">1 · Overview</label>
      <label for="tab2">2 · Demo Scenarios</label>
      <label for="tab3">3 · Personas</label>
      <label for="tab4">4 · Modules</label>
      <label for="tab5">5 · Credentials</label>
    </div>

    <!-- ═══════════════ TAB 1 — OVERVIEW ═══════════════ -->
    <div class="tab-content" id="c-tab1" data-title="1 · Overview">
      <h2>Platform overview</h2>
      <p><strong>Novex Pharma Inc.</strong> is a full-EQMS demo tenant for pharma manufacturing. It demonstrates how an internal QA team runs audits, handles deviations, controls documents, drives training, manages risk, qualifies equipment, and reviews performance — all from one platform.</p>

      <div class="grid2">
        <div class="card pinstripe">
          <h4>11 personas</h4>
          <p>Spanning QA leadership, EQMS specialists, internal audit, and auditee departments (Production, QC Lab, Maintenance).</p>
        </div>
        <div class="card pinstripe">
          <h4>15 modules enabled</h4>
          <p>Audit, Deviations, CAPA, Doc Control, Change Control, Training, Risk, Supplier Quality, Management Review, Asset Mgmt, CoC, Transaction Review, Regulatory Intel, AI, RFQ.</p>
        </div>
      </div>

      <h3>End-to-end flow across personas</h3>
      <div class="flow">
        <h4>High-level persona interaction map</h4>
        <div class="mermaid">${FLOWS.overview}</div>
      </div>

      <div class="grid2">
        <div class="flow">
          <h4>Internal-audit lifecycle</h4>
          <div class="mermaid">${FLOWS.auditLifecycle}</div>
        </div>
        <div class="flow">
          <h4>Deviation → CAPA cycle</h4>
          <div class="mermaid">${FLOWS.deviationCapa}</div>
        </div>
      </div>

      <div class="flow">
        <h4>Doc-control + training rollout</h4>
        <div class="mermaid">${FLOWS.docControl}</div>
      </div>
    </div>

    <!-- ═══════════════ TAB 2 — SCENARIOS ═══════════════ -->
    <div class="tab-content" id="c-tab2" data-title="2 · Demo Scenarios">
      <h2>10 end-to-end demo scenarios</h2>
      <p>Each scenario is a complete, persona-driven story that exercises one or more modules. Run them in order for a full tour, or pick three for a 30-minute demo.</p>
      ${SCENARIOS.map(scenarioBlock).join("\n")}
    </div>

    <!-- ═══════════════ TAB 3 — PERSONAS ═══════════════ -->
    <div class="tab-content" id="c-tab3" data-title="3 · Personas">
      <h2>11 personas · role + screens</h2>
      <p>Log in as any of these users with password <code>${TENANT.password}</code>. Each has a curated responsibility set and a dashboard tuned to their role.</p>
      ${PERSONAS.map(personaBlock).join("\n")}
    </div>

    <!-- ═══════════════ TAB 4 — MODULES ═══════════════ -->
    <div class="tab-content" id="c-tab4" data-title="4 · Modules">
      <h2>15 EQMS modules — all enabled</h2>
      <p>The Novex Pharma tenant has every EQMS module switched on. Nothing is gated off.</p>
      <div class="grid3">
        ${MODULES.map(moduleBlock).join("\n")}
      </div>
    </div>

    <!-- ═══════════════ TAB 5 — CREDENTIALS ═══════════════ -->
    <div class="tab-content" id="c-tab5" data-title="5 · Credentials">
      <h2>Login credentials · all personas</h2>
      <p>Frontend: <a href="${TENANT.frontendUrl}" target="_blank">${TENANT.frontendUrl}</a> · Backend: <code>${TENANT.backendUrl}</code></p>
      <p><strong>Password for all users:</strong> <code>${TENANT.password}</code></p>
      <table class="creds">
        <thead><tr><th>Email</th><th>Role</th><th>Name</th><th>Title</th><th>Group</th></tr></thead>
        <tbody>${credsRows}</tbody>
      </table>
      <h3>Seed script</h3>
      <p>Re-run the seed anytime with:</p>
      <pre><code>node scripts/seed-eqms-full-users.mjs</code></pre>
      <p>The script is idempotent — existing users keep their IDs; the module config is upserted; sites and products are created once.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

mkdirSync(dirname(OUT_HTML), { recursive: true });
const shots = loadShots();
const html = buildHtml(shots);
writeFileSync(OUT_HTML, html);
console.log(`\n  ✓ HTML written: ${OUT_HTML} (${Math.round(html.length / 1024)} KB)`);

if (htmlOnly) {
  console.log("  (--html-only — skipping PDF step)");
  process.exit(0);
}

console.log("  rendering PDF via headless Chromium…");
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`file:///${OUT_HTML.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
// Let Mermaid finish rendering
await page.waitForTimeout(2500);
await page.pdf({
  path: OUT_PDF,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
});
await browser.close();
console.log(`  ✓ PDF written: ${OUT_PDF}`);
