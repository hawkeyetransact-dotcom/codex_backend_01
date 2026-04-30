/**
 * build-sanpras-demo-runbook-pdf.mjs
 *
 * One-page demo runbook for the Sanpras pitch — exact click paths +
 * narration lines for showing Part 11 + AI live in ~8 minutes.
 *
 * Output:
 *   backend/docs/06-go-to-market/13-sanpras-demo-runbook.html
 *   backend/docs/06-go-to-market/13-sanpras-demo-runbook.pdf
 *
 * Usage: node scripts/build-sanpras-demo-runbook-pdf.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "06-go-to-market");
const OUT_HTML = join(OUT_DIR, "13-sanpras-demo-runbook.html");
const OUT_PDF = join(OUT_DIR, "13-sanpras-demo-runbook.pdf");
mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT — keep tight. One page. Click → narrate. Nothing else.
// ─────────────────────────────────────────────────────────────────────────────
const PRE_DEMO = [
  "Open: https://hawkeye-frontend-dev-chi.vercel.app",
  "Login as Priya — audit.program@acme-pharma.demo · AuditDemo@2026",
  "Have 2nd tab ready: Asha (qa.head@globalpharma.demo) · Maria (audit.lead@auditcorp.demo)",
  "Pick one audit ahead of time — recommend HK-0000000092-2026 (already in PREPARATION phase)",
];

const PART11 = {
  budget: "≈ 3 minutes",
  steps: [
    {
      who: "Priya (buyer)",
      click: "Open audit HK-0000000092-2026 → click the **Audit Log** tab.",
      say: "This is your 21 CFR 11 audit trail. Every action — who, when, what changed, why. Immutable, append-only. Inspector asks for it, this is what they get.",
    },
    {
      who: "Switch tab → Asha (supplier)",
      click: "Open the same audit → open the intimation letter → click **Sign**.",
      say: "Watch the prompt: username, password, reason-for-signing. That's a Part 11 e-signature — same legal weight as a wet signature.",
    },
    {
      who: "Back to Priya (buyer)",
      click: "Audit detail → **Tracking** tab (the green/blue/yellow timeline).",
      say: "Every milestone is time-stamped at the server, immutable, ALCOA+. We give you the full IQ/OQ/PQ pack on day one — same evidence covers Part 11 AND EU Annex 11.",
    },
  ],
  bridge:
    "Bridge line: \"That's three of eight Part 11 controls — the rest (RBAC, encryption, backup, validation) are in the compliance binder we'll leave with you.\"",
};

const AI = {
  budget: "≈ 5 minutes",
  steps: [
    {
      who: "Maria (auditor)",
      click: "Open the EXECUTION-phase audit → pick a finding → click **Draft observation with AI**.",
      say: "Six to ten hours of report drafting → about an hour of editing. Notice the inline citations like [Q1] [S1] — every claim links back to the source evidence. No black-box AI. Every assertion is auditor-traceable.",
    },
    {
      who: "Switch tab → Asha (supplier)",
      click: "Open the PAQ on the seeded EXECUTION audit → click **AI prefill from prior submissions**.",
      say: "Watch fields populate from earlier responses. You fill the PAQ once. The next buyer's PAQ inherits where it can. Audit prep — 2-3 weeks → 3 days.",
    },
  ],
  closing:
    "Closing line: \"Same pattern in every module — Deviation 5-why, CAPA RCA, Doc-control gap detection, MRM auto-aggregator, Reg-intel watcher. Twelve agents in total. Drafts, summarises, classifies, pre-fills. Humans approve. Citations always.\"",
};

const FALLBACKS = [
  { if: "AI button is hidden", then: "It's gated by AgentPermission — confirm tenant has AI_ASSISTANT module enabled in Admin Panel." },
  { if: "Audit Log tab missing", then: "Use the Tracking tab instead — same time-stamped immutable record, just the milestone view." },
  { if: "Maria can't see the audit", then: "Cross-tenant bug (logged Issue #12). Re-assign via DB — script ready: scripts/diagnose-auditor-inbox.mjs." },
  { if: "Sign button does nothing", then: "Known UX bug (Issue #11). Data DOES persist. Refresh the page to see updated state." },
];

const SHORT_VERSION =
  "If you're tight on time: just do Part 11 step 1 (Audit Log) + AI step 1 (Observation Drafter). 3 minutes total. Both land the strongest punch.";

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #0f172a; background: #fff; margin: 0; line-height: 1.45; font-size: 11px;
  }
  .page { max-width: 880px; margin: 0 auto; padding: 16px 22px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
  h2 {
    font-size: 14px; margin: 14px 0 6px; padding: 6px 10px;
    color: #fff; border-radius: 4px;
  }
  h2.part11 { background: #2563eb; }
  h2.ai     { background: #059669; }
  h2.misc   { background: #475569; }
  h3 { font-size: 12px; margin: 4px 0; color: #1e3a8a; }
  p  { margin: 4px 0; }

  .header {
    background: linear-gradient(135deg, #1e3a8a, #2563eb);
    color: #fff; padding: 12px 18px; border-radius: 6px;
    margin-bottom: 12px;
  }
  .header h1 { color: #fff; }
  .header .sub { font-size: 11px; opacity: 0.9; margin-top: 2px; }

  .pre {
    background: #fef9c3; border-left: 4px solid #ca8a04;
    padding: 8px 12px; border-radius: 0 4px 4px 0; margin-bottom: 12px;
  }
  .pre h4 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #78350f; }
  .pre ol { margin: 4px 0 0 0; padding-left: 18px; }
  .pre ol li { margin: 2px 0; font-size: 11px; }

  .step {
    border: 1px solid #e2e8f0; border-left: 3px solid #2563eb;
    border-radius: 4px; padding: 8px 12px; margin: 6px 0;
    page-break-inside: avoid;
  }
  .step.ai { border-left-color: #059669; }
  .step .who {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em;
    color: #64748b; font-weight: 700; margin-bottom: 2px;
  }
  .step .click { font-size: 11px; margin: 2px 0 4px; }
  .step .click strong { color: #2563eb; }
  .step.ai .click strong { color: #059669; }
  .step .say {
    background: #f1f5f9; padding: 6px 10px; border-radius: 4px;
    font-size: 11px; font-style: italic; color: #334155;
    border-left: 3px solid #94a3b8; margin-top: 4px;
  }
  .step .say::before { content: "💬  "; font-style: normal; }

  .bridge {
    font-size: 10px; color: #475569; font-style: italic;
    padding: 6px 10px; background: #fafafa; border-radius: 3px;
    margin-top: 6px;
  }
  .bridge::before { content: "→  "; font-style: normal; font-weight: 700; }

  .budget {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 9px; background: rgba(255,255,255,0.25); color: #fff;
    margin-left: 8px; vertical-align: middle;
  }

  table.fall {
    width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px;
  }
  table.fall th, table.fall td {
    padding: 4px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top;
  }
  table.fall th {
    background: #f1f5f9; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;
  }
  table.fall td:first-child { width: 30%; font-weight: 600; color: #dc2626; }

  .short {
    background: #ecfdf5; border: 1px solid #059669;
    padding: 8px 12px; border-radius: 4px; margin-top: 12px;
    font-size: 11px;
  }
  .short strong { color: #059669; }

  @page { size: A4; margin: 10mm 12mm; }
`;

const renderStep = (s, kind) => `
  <div class="step ${kind}">
    <div class="who">${s.who}</div>
    <div class="click"><strong>CLICK ›</strong> ${s.click}</div>
    <div class="say">${s.say}</div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Sanpras pitch — demo runbook</title><style>${css}</style></head><body>
<div class="page">
  <div class="header">
    <h1>Demo runbook — Sanpras pitch</h1>
    <div class="sub">~8 min live. Two topics: 21 CFR Part 11 (3 min) + AI features (5 min). Click → narrate.</div>
  </div>

  <div class="pre">
    <h4>Pre-demo setup (do this 2 min before the call)</h4>
    <ol>${PRE_DEMO.map((s) => `<li>${s}</li>`).join("")}</ol>
  </div>

  <h2 class="part11">1 · 21 CFR Part 11 — show, don't tell <span class="budget">${PART11.budget}</span></h2>
  ${PART11.steps.map((s) => renderStep(s, "")).join("")}
  <div class="bridge">${PART11.bridge}</div>

  <h2 class="ai">2 · AI features — the strongest live demo <span class="budget">${AI.budget}</span></h2>
  ${AI.steps.map((s) => renderStep(s, "ai")).join("")}
  <div class="bridge">${AI.closing}</div>

  <h2 class="misc">3 · Fallbacks — if something breaks live</h2>
  <table class="fall">
    <thead><tr><th>If…</th><th>Then…</th></tr></thead>
    <tbody>
      ${FALLBACKS.map((f) => `<tr><td>${f.if}</td><td>${f.then}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="short"><strong>3-minute version:</strong> ${SHORT_VERSION}</div>
</div></body></html>`;

writeFileSync(OUT_HTML, html, "utf-8");
console.log(`✓ HTML: ${OUT_HTML}`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`file:///${OUT_HTML.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.pdf({ path: OUT_PDF, format: "A4", printBackground: true,
  margin: { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" } });
await browser.close();
console.log(`✓ PDF:  ${OUT_PDF}`);
