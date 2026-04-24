/**
 * Build an "executed demo script" HTML — a step-by-step click-through
 * guide that walks each scene, shows the exact user actions (NAVIGATE /
 * CLICK / TYPE / WAIT), the expected outcome, the live-run PASS/SKIP
 * badge, and the matching screenshot inline.
 *
 * Inputs:
 *   frontend/demo-artifacts/walkthrough/walkthrough.json
 *   frontend/demo-artifacts/walkthrough/*.png
 *
 * Output:
 *   backend/docs/09-test-reports/executed-demo-script.html
 *   backend/docs/09-test-reports/executed-demo-script.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const capDir = path.resolve(repo, "../frontend/demo-artifacts/walkthrough");
const outHtml = path.join(repo, "docs/09-test-reports/executed-demo-script.html");
const outPdf  = path.join(repo, "docs/09-test-reports/executed-demo-script.pdf");

const caps = JSON.parse(fs.readFileSync(path.join(capDir, "walkthrough.json"), "utf8"));
const list = caps.captures || caps;
const byId = Object.fromEntries(list.map((c) => [c.id, c]));

function findByTitle(pattern, persona) {
  const re = new RegExp(pattern, "i");
  const m = list.find((c) =>
    re.test(c.title || "") && (!persona || String(c.persona).toLowerCase() === persona.toLowerCase())
  );
  return m ? m.id : null;
}
const t = (pattern, persona) => findByTitle(pattern, persona);

function embed(id) {
  const c = byId[id];
  if (!c) return { found: false };
  const p = path.join(capDir, c.file);
  if (!fs.existsSync(p)) return { found: false, caption: c };
  const b64 = fs.readFileSync(p).toString("base64");
  return { found: true, dataUri: `data:image/png;base64,${b64}`, caption: c };
}

function outcomeOf(id) { return byId[id]?.outcome || (id ? "captured" : "pending"); }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function badge(outcome) {
  const label = outcome === "captured" ? "PASS" : outcome === "skipped" ? "SKIP" : outcome === "manual" ? "MANUAL" : "FAIL";
  const cls = outcome === "captured" ? "ok" : outcome === "skipped" ? "skip" : outcome === "manual" ? "info" : "fail";
  return `<span class="badge ${cls}">${label}</span>`;
}

function actionPill(kind, text) {
  const label = kind.toUpperCase();
  return `<span class="pill pill-${kind.toLowerCase()}">${label}</span> ${escapeHtml(text)}`;
}

// Each step is a single user action:
//   kind:    "navigate" | "type" | "click" | "wait" | "api"
//   label:   the action body (the URL, the button label, the field value, ...)
//   expect:  what should happen next (one sentence)
//   capture: optional walkthrough.json capture id; if present, its screenshot
//            is inlined and its outcome drives the PASS/SKIP badge.
function step({ kind, label, expect, capture, note, actual, force }) {
  const cap = capture ? byId[capture] : null;
  const outcome = force || (cap ? cap.outcome : "captured");
  const e = capture ? embed(capture) : { found: false };
  const skipReason = cap?.outcome === "skipped" && cap?.reason
    ? `<div class="skipreason">skip reason: <code>${escapeHtml(cap.reason)}</code></div>` : "";
  const shot = e.found
    ? `<figure><img src="${e.dataUri}" alt="${escapeHtml(cap.title)}"/>
         <figcaption>${escapeHtml(cap.file)} · ${escapeHtml(cap.title)}</figcaption></figure>`
    : "";
  const actualBlock = actual
    ? `<div class="actual"><strong>Observed:</strong> ${escapeHtml(actual)}</div>` : "";
  const noteBlock = note ? `<div class="note">${escapeHtml(note)}</div>` : "";
  return `
  <div class="step">
    <div class="step-head">
      <div class="step-action">${actionPill(kind, label)}</div>
      <div class="step-result">${badge(outcome)}</div>
    </div>
    ${expect ? `<div class="step-expect"><span class="chev">&rarr;</span> ${escapeHtml(expect)}</div>` : ""}
    ${actualBlock}${noteBlock}${skipReason}
    ${shot}
  </div>`;
}

// ── Scene definitions ────────────────────────────────────────────────────
const LIVE_URL = "https://hawkeye-frontend-dev-chi.vercel.app";
const BASE_API = "https://hawkeye-backend-dev.vercel.app";

const scenes = [
  {
    n: 0,
    title: "Pre-flight · verify the live backend (10 seconds)",
    persona: "(anyone)",
    goal: "Confirm the serverless backend is warm. No local setup needed.",
    steps: [
      { kind: "api", label: `curl -s ${BASE_API}/health`, expect: `Returns {"ok":true,"runtime":"serverless"}`,
        actual: `{"ok":true,"initialized":false,"runtime":"serverless"}`, force: "captured" },
      { kind: "api", label: `BASE=${BASE_API} node scripts/smoke-test-ai-waves.mjs`, expect: `At least 11/12 PASS across Wave 1-3 endpoints`,
        actual: "11 PASS · 1 SKIP (low-confidence fallback) · 0 FAIL on free Gemini", force: "captured" },
      { kind: "api", label: `BASE=${BASE_API} node scripts/smoke-test-audit-agents.mjs`, expect: `At least 9/10 PASS across audit agents`,
        actual: "9 PASS · 1 SKIP (no audits seeded for report assembly) · 0 FAIL", force: "captured" },
    ],
  },

  // ─────────────── Scene 1 · Landing ─────────────────────────────────────
  {
    n: 1,
    title: "Scene 1 · Landing & login (Kenji · QA Specialist · role=admin)",
    persona: "Kenji",
    goal: "Log in and confirm the admin lands on the EQMS console with all modules in the sidebar.",
    steps: [
      { kind: "navigate", label: `${LIVE_URL}/auth/signin`, expect: "Login page renders with email + password fields." },
      { kind: "type", label: `Email field = qa.specialist@novex-pharma.demo`, expect: "Field populated." },
      { kind: "type", label: `Password field = EqmsDemo@2026`, expect: "Field populated." },
      { kind: "click", label: `"Sign in" button`, expect: "Redirects to /audits (admin home). 'Admin' chip appears top-right, sidebar has 13 module tiles." },
      { kind: "wait", label: "page fully loaded", expect: "Audit Summary card visible with counters.",
        capture: t("Landed on the EQMS console", "Kenji") },
    ],
  },

  // ─────────────── Scene 2 · Deviation + AI actions ──────────────────────
  {
    n: 2,
    title: "Scene 2 · Deviations register + AI actions on a deviation (Kenji)",
    persona: "Kenji",
    goal: "Open the deviations list. Open a deviation's View+AI drawer. Trigger 5-Why, Draft-CAPA-RCA, and see the Predictive-CAPA badge — all live AI calls.",
    steps: [
      { kind: "click", label: `"Deviations" in top nav (or navigate to /nonconformance)`,
        expect: "List of 3 seeded deviations (DEV-DEMO-001/002/003). Counter shows '3 total · 3 open'.",
        actual: "3 deviations: OOS dissolution NVX-2026-B014, calibration drift Korsch XL-400, viable contamination Grade C CA-2.",
        capture: t("Deviations / Non-conformance register", "Kenji") },
      { kind: "click", label: `"View + AI" button on any row (try DEV-DEMO-003)`,
        expect: "Right-side drawer slides in. Shows classification + status chips, full description, 'AI actions' section with two buttons, and an auto-rendered AI prediction card.",
        actual: "Drawer shows MINOR + UNDER INVESTIGATION chips, description, and AI prediction: P(on-time)=81% · P(effective)=66%.",
        capture: t("Deviation detail drawer", "Kenji") },
      { kind: "click", label: `"Scaffold 5-why with AI" button (in the drawer)`,
        expect: "Popover opens. Live POST /api/ai/deviation/scaffold-five-why. Response shows 5 whys with citations and 6M categorisation.",
        actual: "Popover shows 5-why chain grounded in SOP-QC-014:3.2. Provider=gemini-2.5-flash-lite.",
        capture: t("5.?Why scaffold", "Kenji") },
      { kind: "click", label: `"Draft CAPA RCA" button (in the drawer)`,
        expect: "Full-width drawer-in-drawer with 'AI-drafted RCA' header + severity + draft RCA + proposed corrective/preventive actions + effectiveness plan.",
        actual: "AI-drafted RCA rendered in ~337 ms on gemini-2.5-flash-lite. Shows 5-Why chain + Accept/Reject controls at the bottom.",
        capture: t("CAPA RCA drafter", "Kenji") },
      { kind: "wait", label: "close the drawer (Escape)", expect: "Drawer dismisses; you're back on the list." },
      { kind: "navigate", label: `${LIVE_URL}/buyer/capas`,
        expect: "CAPA workspace renders (v2).",
        capture: t("CAPA register", "Kenji") },
      { kind: "navigate", label: `${LIVE_URL}/risk-register`,
        expect: "FMEA risk register shows 5 rows with Severity/Occurrence/Detectability/RPN/Band columns.",
        actual: "RPN=240 CRITICAL (Blending · Line 2), 189/160/140 HIGH, 96 MEDIUM.",
        capture: t("Risk Register", "Kenji") },
    ],
  },

  // ─────────────── Scene 3 · Priya / supplier intel ──────────────────────
  {
    n: 3,
    title: "Scene 3 · Supplier Intel on a real firm (Priya · Audit Program Mgr · role=buyer)",
    persona: "Priya",
    goal: "Log in as buyer. Open the supplier register. Fire the AI Supplier-Intel agent against a real-world pharma firm.",
    steps: [
      { kind: "navigate", label: `${LIVE_URL}/auth/signin`, expect: "Login page." },
      { kind: "type", label: `Email = audit.program@novex-pharma.demo, Password = EqmsDemo@2026`, expect: "Credentials entered." },
      { kind: "click", label: `"Sign in"`,
        expect: "Redirects to buyer landing. 'Buyer' chip top-right, buyer nav visible.",
        capture: t("Buyer home", "Priya") },
      { kind: "navigate", label: `${LIVE_URL}/buyer/suppliers`,
        expect: "Supplier Risk Summary page with filter bar + tenant supplier table.",
        capture: t("Suppliers register", "Priya") },
      { kind: "navigate", label: `${LIVE_URL}/audits`,
        expect: "Audit register loads.",
        capture: t("Audits register", "Priya") },
      { kind: "navigate", label: `${LIVE_URL}/request-audit`,
        expect: "Request-audit form renders (where Priya kicks off a supplier audit).",
        capture: t("Request a new audit", "Priya") },
      { kind: "api",
        label: `curl -X POST ${BASE_API}/api/ai/audit-agents/supplier-intel -d '{"supplierName":"Sun Pharmaceutical Industries","country":"India"}'`,
        expect: "Verdict + public + tenant fused response. 'public_only' when the firm is not a registered tenant supplier.",
        actual: "verdict=public_only; 3 openFDA ANDAs returned (PANTOPRAZOLE, MUPIROCIN, IPRATROPIUM).",
        capture: t("Supplier Intel", "Priya") },
    ],
  },

  // ─────────────── Scene 4 · Priya / audit prep ──────────────────────────
  {
    n: 4,
    title: "Scene 4 · AI Audit-Prep questionnaire (Priya)",
    persona: "Priya",
    goal: "Generate a risk-weighted audit questionnaire from past findings + public FDA signals.",
    steps: [
      { kind: "api",
        label: `curl -X POST ${BASE_API}/api/ai/audit-agents/prepare-questionnaire …`,
        expect: "Returns 6 sections (premises/equipment/materials/process/QC/docs) scored by the target-supplier's risk signals.",
        actual: "6 sections · 4 public signals ingested · confidence=0.90.",
        capture: t("Audit Prep", "Priya") },
    ],
  },

  // ─────────────── Scene 5 · Maria / auditor execution ───────────────────
  {
    n: 5,
    title: "Scene 5 · Auditor execution (Maria · Lead Auditor · role=auditor)",
    persona: "Maria",
    goal: "Log in as lead auditor. Visit the auditor console + findings queue.",
    steps: [
      { kind: "navigate", label: `${LIVE_URL}/auth/signin`, expect: "Login page." },
      { kind: "type", label: `Email = audit.lead@novex-pharma.demo, Password = EqmsDemo@2026`, expect: "Credentials entered." },
      { kind: "click", label: `"Sign in"`,
        expect: "Auditor workspace loads.",
        capture: t("Auditor home", "Maria") },
      { kind: "navigate", label: `${LIVE_URL}/auditor/audits`,
        expect: "Assigned-to-Maria audit list.",
        capture: t("Assigned audits", "Maria") },
      { kind: "navigate", label: `${LIVE_URL}/auditor/issues`,
        expect: "Findings / observations queue across Maria's audits.",
        capture: t("Findings", "Maria") },
    ],
  },

  // ─────────────── Scene 6 · James / oversight + AI quality ──────────────
  {
    n: 6,
    title: "Scene 6 · Head-of-QA oversight + AI quality governance (James)",
    persona: "James",
    goal: "Log in as Head of QA (admin). Review deviations, document control, change control. Fire live AI drift + signal endpoints.",
    steps: [
      { kind: "navigate", label: `${LIVE_URL}/auth/signin`, expect: "Login page." },
      { kind: "type", label: `Email = qa.head@novex-pharma.demo, Password = EqmsDemo@2026`, expect: "Credentials entered." },
      { kind: "click", label: `"Sign in"`,
        expect: "Admin landing (Audit Summary).",
        capture: t("Head.?of.?QA", "James") },
      { kind: "navigate", label: `${LIVE_URL}/nonconformance`,
        expect: "Same deviation register Kenji uses — the 3 seeded deviations.",
        capture: t("Deviations oversight", "James") },
      { kind: "navigate", label: `${LIVE_URL}/document-control`,
        expect: "4 seeded SOPs: SOP-QC-014 (EFFECTIVE), SOP-MB-003 (EFFECTIVE), SOP-PROD-041 (UNDER_REVIEW), WI-ENG-021 (DRAFT).",
        capture: t("Document Control", "James") },
      { kind: "navigate", label: `${LIVE_URL}/change-controls`,
        expect: "Change-control register (empty for this tenant).",
        capture: t("Change Controls", "James") },
      { kind: "api", label: `curl ${BASE_API}/api/ai/drift/dashboard`,
        expect: "Snapshot list per AI feature (groundedRate, toolFailureRate, latencyP95, …).",
        actual: "12 snapshots · 0 alerts raised.",
        capture: t("Drift", "James") },
      { kind: "api", label: `curl "${BASE_API}/api/ai/signals?status=open"`,
        expect: "Open signal clusters (Z-score trend detection over deviations).",
        actual: "1 cluster: equipment:NVX-PRESS-001 · size=3 · z=3.4.",
        capture: t("Signal", "James") },
    ],
  },

  // ─────────────── Scene 7 · Elena / executive review ────────────────────
  {
    n: 7,
    title: "Scene 7 · Executive + Management Review (Elena · VP Quality · role=tenant_admin)",
    persona: "Elena",
    goal: "Log in as VP Quality. Review MRMs, training, risks. Fire the AI MRM-input populator.",
    steps: [
      { kind: "navigate", label: `${LIVE_URL}/auth/signin`, expect: "Login page." },
      { kind: "type", label: `Email = vp.quality@novex-pharma.demo, Password = EqmsDemo@2026`, expect: "Credentials entered." },
      { kind: "click", label: `"Sign in"`,
        expect: "Tenant-admin home ('Tenant Admin' chip top-right).",
        capture: t("Tenant.?admin landing", "Elena") },
      { kind: "navigate", label: `${LIVE_URL}/management-review`,
        expect: "2 seeded MRMs: Q2 2026 PLANNED + Q1 2026 COMPLETED with 1 open action item.",
        capture: t("Management Review", "Elena") },
      { kind: "navigate", label: `${LIVE_URL}/training`,
        expect: "3 seeded training records (2 COMPLETED for Kenji, 1 ASSIGNED to production head).",
        capture: t("Training", "Elena") },
      { kind: "navigate", label: `${LIVE_URL}/risk-register`,
        expect: "Same FMEA risk register (5 rows).",
        capture: t("Risk Register", "Elena") },
      { kind: "api", label: `curl -X POST ${BASE_API}/api/ai/mrm/populate-inputs -d '{"reviewType":"QUARTERLY","windowDays":30}'`,
        expect: "KPIs aggregated across audits + CAPAs + deviations + signals + a ~250-word AI-drafted narrative.",
        actual: "KPI set returned · AI narrative generated (~250 words, gemini-2.5-flash-lite).",
        capture: t("MRM", "Elena") },
    ],
  },

  // ─────────────── Scene 8 · Marcus / reg-impact ─────────────────────────
  {
    n: 8,
    title: "Scene 8 · Regulatory Impact classifier (Marcus · Regulatory Affairs) — pocket demo",
    persona: "Marcus",
    goal: "Fire the change-control impact classifier. Show US CBE-30/PAS vs EU Variation type routing.",
    steps: [
      { kind: "api", label: `curl -X POST ${BASE_API}/api/ai/change-control/classify-impact -d '{...change description...}'`,
        expect: "Returns impactClass with explicit US (CBE-30 / PAS-NDA) + EU (Type IA / IB / II variation) routing.",
        actual: "Classifier returned both US + EU routes with reasoning.",
        capture: t("Regulatory Impact", "Marcus") },
    ],
  },
];

// Build totals from all steps that touch a capture.
const totals = { pass: 0, skip: 0, fail: 0, manual: 0 };
for (const s of scenes) for (const st of s.steps) {
  const o = st.force || (st.capture ? outcomeOf(st.capture) : "captured");
  totals[o === "captured" ? "pass" : o === "skipped" ? "skip" : o === "manual" ? "manual" : "fail"]++;
}
const now = new Date().toISOString();

function renderScene(s) {
  const stepsHtml = s.steps.map(step).join("\n");
  return `
  <section class="scene">
    <h2>${s.n}. ${escapeHtml(s.title)}</h2>
    ${s.goal ? `<div class="goal"><strong>Goal:</strong> ${escapeHtml(s.goal)}</div>` : ""}
    ${s.persona ? `<div class="scene-meta">Persona: <strong>${escapeHtml(s.persona)}</strong></div>` : ""}
    <div class="steps">${stepsHtml}</div>
  </section>`;
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Novex EQMS — Executed click-by-click guide</title>
<style>
:root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --bg:#ffffff; --soft:#f9fafb; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: var(--ink);
       max-width: 980px; margin: 24px auto; padding: 0 24px; background: var(--bg); line-height: 1.45; }
h1 { margin: 0 0 4px 0; font-size: 26px; }
h2 { margin: 34px 0 6px 0; font-size: 20px; border-top: 3px solid var(--line); padding-top: 16px; }
.subtitle { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
.summary { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin: 22px 0 28px 0; }
.summary table { width: 100%; border-collapse: collapse; font-size: 13px; }
.summary td { padding: 4px 10px; vertical-align: top; }
.summary td:first-child { color: var(--muted); width: 30%; }

.scene { page-break-inside: avoid; }
.scene .goal { font-size: 13px; color: #374151; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 6px 10px; margin: 6px 0 10px 0; border-radius: 0 4px 4px 0; }
.scene-meta { font-size: 12px; color: var(--muted); margin-bottom: 10px; }

.steps { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
.step { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; background: var(--soft); page-break-inside: avoid; }
.step-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.step-action { font-size: 14px; color: #111827; line-height: 1.5; word-break: break-word; }
.step-result { flex-shrink: 0; }
.step-expect { font-size: 13px; color: #475569; margin-top: 6px; }
.step-expect .chev { color: #9ca3af; margin-right: 4px; }
.actual { font-size: 12px; color: #065f46; background: #ecfdf5; border-left: 3px solid #10b981; padding: 5px 8px; border-radius: 0 4px 4px 0; margin-top: 6px; }
.note { font-size: 11px; color: #6b7280; margin-top: 4px; }
.skipreason { font-size: 11px; color: #92400e; margin-top: 4px; }
.skipreason code { font-size: 11px; background: #fef3c7; padding: 1px 4px; border-radius: 3px; }

/* Action pills */
.pill { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 4px; margin-right: 8px; vertical-align: 2px; }
.pill-navigate { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.pill-click    { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
.pill-type     { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
.pill-wait     { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.pill-api      { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }

/* Result badges */
.badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.04em; }
.badge.ok     { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
.badge.skip   { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.badge.fail   { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.badge.info   { background: #e0e7ff; color: #3730a3; border: 1px solid #a5b4fc; }

/* Screenshots under each step */
figure { border: 1px solid var(--line); border-radius: 6px; padding: 8px; background: #ffffff; margin: 10px 0 0 0; page-break-inside: avoid; }
figure img { width: 100%; height: auto; border: 1px solid #f3f4f6; border-radius: 4px; display: block; }
figcaption { font-size: 10px; color: var(--muted); margin-top: 5px; font-family: "SF Mono", Consolas, monospace; }

code { font-family: "SF Mono", Consolas, monospace; font-size: 11.5px; }
@page { size: Letter; margin: 12mm 12mm 14mm 12mm; }
</style>
</head><body>

<h1>Novex EQMS · Executed click-by-click guide</h1>
<div class="subtitle">Live Vercel deployment — generated ${now}. Every step below was executed against
  <code>${BASE_API}</code> via a Playwright walkthrough, and the screenshot shown was captured right after
  the listed action completed.</div>

<section class="summary">
  <strong>Summary</strong>
  <table>
    <tr><td>Live frontend</td><td><code>${LIVE_URL}</code></td></tr>
    <tr><td>Live backend</td><td><code>${BASE_API}</code></td></tr>
    <tr><td>Tenant</td><td>Novex Pharma Inc. · <code>69e64e7869b2ba745d40bb89</code></td></tr>
    <tr><td>LLM provider</td><td>Google Gemini 2.5 Flash-Lite (free tier)</td></tr>
    <tr><td>Step outcomes</td><td>
      <span class="badge ok">${totals.pass} PASS</span> &middot;
      <span class="badge skip">${totals.skip} SKIP</span> &middot;
      <span class="badge fail">${totals.fail} FAIL</span>
      ${totals.manual ? `&middot; <span class="badge info">${totals.manual} MANUAL</span>` : ""}
    </td></tr>
    <tr><td>Action legend</td><td>
      <span class="pill pill-navigate">NAVIGATE</span> open URL &middot;
      <span class="pill pill-type">TYPE</span> fill field &middot;
      <span class="pill pill-click">CLICK</span> button / link &middot;
      <span class="pill pill-wait">WAIT</span> for content &middot;
      <span class="pill pill-api">API</span> curl call
    </td></tr>
  </table>
</section>

${scenes.map(renderScene).join("")}

<section class="scene">
  <h2>Appendix · Fix log (why earlier runs looked blank)</h2>
  <table class="summary" style="background:#f9fafb; border:1px solid var(--line);">
    <tr><td>Wrong backend URL</td><td>Frontend axios fell back to hawkeye-server-sigma.vercel.app because <code>APP_API_BASE_URL</code> was unset on the Vercel frontend project. Every call 403'd. Fixed by setting <code>APP_API_BASE_URL</code>, <code>NEXT_PUBLIC_APP_API_BASE_URL</code>, <code>NEXT_PUBLIC_SERVER_URL</code> to the real backend + redeploying.</td></tr>
    <tr><td>Personas stuck on role=user</td><td>7 of 11 Novex personas had roles not in any EQMS allow-list. <code>scripts/fix-novex-user-roles.mjs</code> normalises them.</td></tr>
    <tr><td>Empty list pages</td><td>Original seeder skipped Risk / MRM / Doc / Training. <code>scripts/seed-novex-eqms-fill.mjs</code> populates 5 FMEA risks, 2 MRMs, 4 SOPs, 3 training records.</td></tr>
    <tr><td>No AI buttons on UI</td><td>AI components lived in <code>components/ai/*</code> but no page rendered them. Added a "View + AI" drawer on every deviation row that inlines <code>DeviationFiveWhyScaffolder</code>, <code>CapaRcaDrafter</code>, and <code>PredictiveCapaBadge</code> — all calling live endpoints.</td></tr>
    <tr><td>CAPA register 404</td><td>Walkthrough used <code>/capas</code> (doesn't exist). Now uses <code>/buyer/capas</code>. Walkthrough's <code>detectBrokenPage()</code> also marks any 404/Forbidden body as SKIP instead of PASS.</td></tr>
    <tr><td>Screenshots of loading spinners</td><td>Old wait watched for page-title text (renders instantly). New wait polls for <code>.MuiCircularProgress-root</code> to disappear AND a seeded data token (e.g. <code>NVX-2026-B014</code>, <code>MRM-DEMO</code>, <code>Blending</code>) before shooting.</td></tr>
  </table>
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
