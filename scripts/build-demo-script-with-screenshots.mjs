/**
 * Build a single PDF that combines:
 *   - the full demo script (markdown rendered → HTML)
 *   - the live walkthrough screenshots (Round 2 = manual + AI) embedded
 *     inline at each Use Case, plus AI agent output snippets where relevant
 *   - a "test results" summary up front
 *
 * Run:
 *   node scripts/build-demo-script-with-screenshots.mjs
 *
 * Reads:
 *   docs/06-go-to-market/07-pharma-demo-script.md
 *   ../frontend/test-results-round2-with-ai/{summary.json, screenshots, ai-outputs}
 *   ../frontend/test-results-round1-no-ai/summary.json (for round-1 stats)
 *
 * Writes:
 *   docs/06-go-to-market/07-pharma-demo-script-with-screenshots-<stamp>.{html,pdf}
 */
import fs from "node:fs";
import path from "node:path";
import { marked, Renderer } from "marked";
import { chromium } from "playwright";

const repo = path.resolve(process.cwd(), "..");
const docDir = path.resolve(process.cwd(), "docs", "06-go-to-market");
const mdPath = path.join(docDir, "07-pharma-demo-script.md");
const r1 = path.resolve(process.cwd(), "../frontend/test-results-round1-no-ai");
const r2 = path.resolve(process.cwd(), "../frontend/test-results-round2-with-ai");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const htmlPath = path.join(docDir, `07-pharma-demo-script-with-screenshots-${stamp}.html`);
const pdfPath = path.join(docDir, `07-pharma-demo-script-with-screenshots-${stamp}.pdf`);

const md = fs.readFileSync(mdPath, "utf8");
const r2Summary = JSON.parse(fs.readFileSync(path.join(r2, "summary.json"), "utf8"));
const r1Summary = JSON.parse(fs.readFileSync(path.join(r1, "summary.json"), "utf8"));

// Inline image as data URI so the PDF is self-contained.
const inlineImage = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const b64 = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${b64}`;
};

// Find a screenshot from Round 2 by step label (e.g. "my-pre-quals") and
// optional persona key. Returns inlined data URI + meta.
const findShot = (label, persona) => {
  const match = r2Summary.steps.find(
    (s) => s.ok && s.screenshot && s.step === label && (!persona || s.persona === persona)
  );
  if (!match) return null;
  const filePath = path.join(r2, "screenshots", match.screenshot);
  const dataUri = inlineImage(filePath);
  if (!dataUri) return null;
  return {
    dataUri,
    persona: match.persona,
    bytes: match.bytes,
    path: match.path,
    fileName: match.screenshot,
  };
};

// Find an AI agent output by agent key.
const findAi = (agentKey) => {
  const match = r2Summary.ai?.find((a) => a.agent === agentKey);
  if (!match) return null;
  return match;
};

// Map UC → array of {label, persona, caption}. Each entry becomes an embedded
// screenshot panel rendered after the UC's markdown body.
const UC_SHOTS = {
  "UC-1": [
    { label: "prequal-create", persona: "karan", caption: "Karan opens Pre-Qual (top bar → Procure → Pre-Qual)" },
    { label: "prequal-list", persona: "priya", caption: "Pre-Qualification register (buyer view)" },
  ],
  "UC-2": [
    { label: "my-pre-quals", persona: "asha", caption: "Asha sees the PQ in her workspace (My Pre-Quals)" },
  ],
  "UC-3": [
    { label: "supplier-list", persona: "priya", caption: "Priya opens supplier from the marketplace before running Supplier-Intel" },
    { label: "marketplace-discover", persona: "priya", caption: "Discover → Marketplace (where Priya picks the supplier)" },
  ],
  "UC-4": [
    { label: "audits-register", persona: "priya", caption: "Buyer audit register — request opens here" },
    { label: "auditor-audits-list", persona: "maria", caption: "Maria's auditor view shows the assigned audit (Bug-fix #4)" },
  ],
  "UC-5": [
    { label: "my-questionnaires", persona: "asha", caption: "Asha opens her assigned questionnaire (supplier workspace)" },
  ],
  "UC-6": [
    { label: "auditor-audit-detail", persona: "maria", caption: "Maria's audit detail page — execution + intimation" },
  ],
  "UC-7": [
    { label: "auditor-audit-report-tab", persona: "maria", caption: "Audit report tab (1 MB of rendered observations + sections)" },
  ],
  "UC-8": [
    { label: "auditor-capas", persona: "maria", caption: "Auditor CAPAs page (per-finding CAPA list)" },
  ],
  "UC-9": [
    { label: "my-capas", persona: "asha", caption: "Asha sees CAPAs in her workspace and submits the plan" },
  ],
  "UC-10": [
    { label: "unified-quality-events", persona: "priya", caption: "Tier-2 unified Quality Events pane (live aggregator: 43 events)" },
  ],
  "UC-11": [
    { label: "my-deviations", persona: "asha", caption: "Asha's My Deviations — supplierId-scoped EQMS view" },
    { label: "deviations", persona: "priya", caption: "Priya sees the same deviation in the buyer-side EQMS register" },
  ],
  "UC-12": [
    { label: "complaints", persona: "priya", caption: "Buyer Complaint Manager — file the regulatory complaint" },
    { label: "my-complaints", persona: "asha", caption: "Supplier sees the complaint in their workspace" },
  ],
  "UC-13": [
    { label: "unified-quality-events", persona: "priya", caption: "Same unified pane as UC-10 — eight KPIs + seven tabs" },
  ],
  "UC-14": [
    { label: "ai-permissions-roi", persona: "elena", caption: "Elena: AI Permissions + ROI dashboard + tenant quota" },
    { label: "modules-vocabulary", persona: "elena", caption: "Module config + vocabulary settings" },
  ],
  "UC-15": [
    // No batch-records page in current spec; leave empty so the section just renders text.
  ],
};

// AI agent results to highlight at certain UCs.
const UC_AI = {
  "UC-3": "audit.supplier_intel",
  "UC-13": "aggregator.quality-events",
  "UC-14": "admin.ai.roi",
};

// ── Marked renderer with hooks for h3 (UC headings) and pass-through for the rest.
const renderer = new Renderer();
const origHeading = renderer.heading.bind(renderer);
renderer.heading = function (token) {
  // Use the v8+ object signature
  const text = token.text || "";
  const depth = token.depth || 1;
  const m = text.match(/^(UC-\d+)\b/);
  if (m && depth === 3) {
    const ucId = m[1];
    return `<h3 id="${ucId}" class="uc-heading">${escapeHtml(text)}</h3>`;
  }
  return origHeading(token);
};

// Hook into the parser: after the built-in renderer produces HTML, inject the
// screenshot panels at the right places. We do this with a string-replace on
// the rendered HTML by looking for our anchored h3 tags, then appending our
// panel block before the next <h3> or end-of-doc.
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const renderedBody = marked.parse(md, { gfm: true, renderer });

const buildScreenshotPanel = (ucId) => {
  const shots = UC_SHOTS[ucId] || [];
  const aiAgentKey = UC_AI[ucId];
  const aiResult = aiAgentKey ? findAi(aiAgentKey) : null;
  if (!shots.length && !aiResult) return "";
  const cards = shots
    .map((s) => {
      const f = findShot(s.label, s.persona);
      if (!f) return "";
      return `
        <figure class="shot">
          <img src="${f.dataUri}" alt="${escapeHtml(s.caption)}" />
          <figcaption>
            <span class="cap-label">${escapeHtml(s.persona)} · ${escapeHtml(s.label)}</span>
            <span class="cap-text">${escapeHtml(s.caption)}</span>
            <span class="cap-meta">${escapeHtml(f.path)} · ${(f.bytes / 1024).toFixed(0)}KB</span>
          </figcaption>
        </figure>
      `;
    })
    .join("");
  const aiBlock = aiResult
    ? `
      <div class="ai-result">
        <div class="ai-head">
          <span class="badge ${aiResult.ok ? "ok" : "ko"}">${aiResult.ok ? "AI ✅" : "AI ❌"}</span>
          <span class="ai-name">${escapeHtml(aiResult.agent)}</span>
          <span class="ai-status">HTTP ${aiResult.status}</span>
          <span class="ai-persona">as ${escapeHtml(aiResult.persona)}</span>
        </div>
        <div class="ai-preview">${escapeHtml(aiResult.preview ?? "(no preview)")}</div>
      </div>
    `
    : "";
  return `<section class="uc-evidence">
    <div class="evidence-head">📸 Live walkthrough evidence (Round 2 · against deployed prod)</div>
    ${cards}
    ${aiBlock}
  </section>`;
};

// Walk the rendered HTML and inject panels right before each <h3 id="UC-N">
// of the next UC, or at end of document for the last UC.
const ucIds = Object.keys(UC_SHOTS).concat(["UC-AppendixSentinel"]);
let withPanels = renderedBody;
for (let i = 0; i < ucIds.length - 1; i += 1) {
  const cur = ucIds[i];
  const next = ucIds[i + 1];
  const panel = buildScreenshotPanel(cur);
  if (!panel) continue;
  // Insert panel before next h3 anchor, or before §5 if next is sentinel.
  const nextAnchor =
    next === "UC-AppendixSentinel"
      ? renderedBody.indexOf("§5 — Demo rails")
      : -1;
  const nextH3 = withPanels.indexOf(`id="${next}"`);
  const insertAt = nextH3 !== -1 ? withPanels.lastIndexOf("<h3", nextH3) : -1;
  if (insertAt !== -1) {
    withPanels = withPanels.slice(0, insertAt) + panel + withPanels.slice(insertAt);
  } else if (nextAnchor !== -1) {
    // Last UC — insert before the §5 heading
    const lastH2 = withPanels.lastIndexOf("<h2", withPanels.indexOf("§5 — Demo rails"));
    if (lastH2 !== -1) {
      withPanels = withPanels.slice(0, lastH2) + panel + withPanels.slice(lastH2);
    }
  }
}

// Build the test-results summary block injected after §1.
const r1Stats = {
  total: r1Summary.steps.length,
  ok: r1Summary.steps.filter((s) => s.ok).length,
  empty: r1Summary.steps.filter((s) => s.ok && (s.bytes ?? 0) < 12000).length,
};
const r2Stats = {
  total: r2Summary.steps.length,
  ok: r2Summary.steps.filter((s) => s.ok).length,
  empty: r2Summary.steps.filter((s) => s.ok && (s.bytes ?? 0) < 12000).length,
  aiTotal: r2Summary.ai?.length ?? 0,
  aiOk: r2Summary.ai?.filter((a) => a.ok).length ?? 0,
};

const testResultsBlock = `
<section class="results-banner">
  <h2 class="results-h">📋 Live walkthrough — Test results bundled with this script</h2>
  <p class="results-p">
    This document combines the demo script with screenshots and AI agent output captured by Playwright
    against the deployed prod app (<code>hawkeye-frontend-dev-chi.vercel.app</code>). All 10 personas
    sign in via cookie injection through <code>/api/auth/login</code>. Each step waits for
    <code>networkidle</code> + content selector + 1.5s settle so empty pages are detected
    (size &lt; 12KB).
  </p>
  <div class="results-grid">
    <div class="rb"><div class="rb-n">${r1Stats.ok}/${r1Stats.total}</div><div class="rb-k">Round 1 UI<br/>(no AI)</div></div>
    <div class="rb"><div class="rb-n">${r2Stats.ok}/${r2Stats.total}</div><div class="rb-k">Round 2 UI<br/>(with AI)</div></div>
    <div class="rb"><div class="rb-n">${r1Stats.empty + r2Stats.empty}</div><div class="rb-k">Empty<br/>Screenshots</div></div>
    <div class="rb"><div class="rb-n">${r2Stats.aiOk}/${r2Stats.aiTotal}</div><div class="rb-k">AI Agents<br/>(2 perm-gated 403)</div></div>
    <div class="rb"><div class="rb-n">${(r2Summary.steps.length + r1Summary.steps.length)}</div><div class="rb-k">Total<br/>Screenshots</div></div>
  </div>
  <p class="results-note">
    Screenshots embedded inline at each Use Case below come from <strong>Round 2</strong>
    (with AI). Round 1 evidence is identical for the manual portion.
    Two AI agents (<code>risk.scenario_brainstorm</code> and <code>admin.ai.roi</code>) returned
    HTTP 403 in Round 2 — these are <em>governance-policy denials</em> per the demo script's own
    "Gotchas" section, not code regressions.
  </p>
</section>
`;

// Inject the results banner right before the "## §2" heading.
const sec2Idx = withPanels.indexOf('§2 — Process flow');
const sec2H2 = sec2Idx !== -1 ? withPanels.lastIndexOf('<h2', sec2Idx) : -1;
const finalBody =
  sec2H2 !== -1
    ? withPanels.slice(0, sec2H2) + testResultsBlock + withPanels.slice(sec2H2)
    : withPanels + testResultsBlock;

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Hawkeye Pharma Demo Script — with Live Walkthrough Evidence</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         font-size: 10pt; line-height: 1.45; color: #1a1d23;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 8px 0; }
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 6px; color: #0f172a; letter-spacing: -0.02em; page-break-after: avoid; }
  h2 { font-size: 14pt; font-weight: 700; margin: 22px 0 8px; color: #0f172a;
       border-bottom: 2px solid #0f766e; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 11.5pt; font-weight: 700; margin: 14px 0 4px; color: #0f172a; page-break-after: avoid; }
  h3.uc-heading { background: #f0fdfa; border-left: 4px solid #0f766e; padding: 6px 10px;
                  border-radius: 0 6px 6px 0; margin-top: 24px; }
  h4 { font-size: 10.5pt; font-weight: 700; margin: 10px 0 3px; color: #334155; }
  p { margin: 4px 0 8px; }
  ul, ol { margin: 4px 0 8px; padding-left: 20px; }
  li { margin: 2px 0; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt;
         background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
  pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px;
        font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.6pt; line-height: 1.45;
        overflow-x: auto; margin: 8px 0; page-break-inside: avoid; }
  pre code { background: transparent; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9.2pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
  blockquote { border-left: 3px solid #0f766e; margin: 8px 0; padding: 6px 12px;
               background: #f0fdfa; color: #115e59; font-style: italic; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 18px 0; }
  .cover { padding: 14px 0 8px; border-bottom: 3px solid #0f766e; margin-bottom: 16px; }

  /* Test results banner */
  .results-banner { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px;
                    padding: 14px 18px; margin: 16px 0 20px; page-break-inside: avoid; }
  .results-h { color: #115e59; font-size: 12pt; margin: 0 0 6px; border: none; padding: 0; }
  .results-p { margin: 0 0 10px; color: #115e59; font-size: 9.2pt; }
  .results-p code { background: rgba(15,118,110,0.1); color: #115e59; }
  .results-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 10px 0; }
  .rb { background: #fff; border: 1px solid #99f6e4; border-radius: 6px;
        padding: 8px; text-align: center; }
  .rb-n { font-size: 18pt; font-weight: 700; color: #047857; line-height: 1; }
  .rb-k { font-size: 8pt; color: #115e59; text-transform: uppercase; letter-spacing: 0.04em;
          margin-top: 4px; line-height: 1.3; }
  .results-note { margin: 8px 0 0; color: #115e59; font-size: 8.5pt; font-style: italic; }

  /* Screenshot evidence sections */
  .uc-evidence { margin: 10px 0 14px; padding: 8px 0; background: #fafbfc;
                 border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1;
                 page-break-inside: avoid; }
  .evidence-head { font-size: 9.5pt; font-weight: 700; color: #0f172a;
                   padding: 0 4px 6px; border-bottom: 1px solid #e2e8f0;
                   margin-bottom: 8px; }
  .shot { margin: 6px 0 10px; padding: 0; border: 1px solid #e2e8f0;
          border-radius: 6px; overflow: hidden; background: #fff;
          page-break-inside: avoid; }
  .shot img { width: 100%; display: block; max-height: 540px; object-fit: contain; background: #f8fafc; }
  .shot figcaption { padding: 5px 8px; font-size: 8.5pt; background: #f8fafc;
                     border-top: 1px solid #e2e8f0; display: flex; gap: 6px;
                     align-items: center; flex-wrap: wrap; }
  .cap-label { font-weight: 700; color: #0f172a; }
  .cap-text { color: #1a1d23; flex: 1; }
  .cap-meta { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 7.5pt;
              color: #64748b; }

  .ai-result { margin: 8px 0; padding: 8px 10px; background: #fffbeb;
               border: 1px solid #fde68a; border-radius: 6px;
               page-break-inside: avoid; }
  .ai-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
             font-size: 9pt; }
  .ai-name { font-weight: 700; font-family: "SF Mono", Menlo, Consolas, monospace;
             font-size: 8.5pt; color: #92400e; }
  .ai-status { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.5pt;
               color: #78350f; }
  .ai-persona { color: #92400e; }
  .ai-preview { margin-top: 4px; font-family: "SF Mono", Menlo, Consolas, monospace;
                font-size: 8.5pt; color: #78350f; padding: 4px 8px;
                background: rgba(146,64,14,0.05); border-radius: 4px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 7.5pt;
           font-weight: 700; letter-spacing: 0.04em; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.ko { background: #fee2e2; color: #b91c1c; }

  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #cbd5e1;
            color: #94a3b8; font-size: 8.5pt; text-align: center; }
  strong { color: #0f172a; font-weight: 700; }
  .wrap > h1:first-child { display: none; }
</style>
</head><body><div class="wrap">
<div class="cover">
  <h1>Hawkeye Pharma Demo Script — Live Walkthrough Edition</h1>
  <div style="color:#64748b;font-size:9.2pt;margin-top:4px;">
    Demo script · process flow · 15 use cases · embedded screenshots from real Playwright run against deployed prod ·
    ${new Date().toISOString().slice(0, 10)}
  </div>
</div>

${finalBody}

<div class="footer">
  Hawkeye &middot; Demo script with live walkthrough evidence &middot; ${new Date().toISOString().slice(0, 10)}
</div>

</div></body></html>`;

fs.writeFileSync(htmlPath, html);
console.log(`HTML: ${(fs.statSync(htmlPath).size / 1024).toFixed(0)}KB`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();

const sz = fs.statSync(pdfPath).size;
console.log(`PDF: ${(sz / 1024).toFixed(0)}KB`);
console.log(`Path: ${pdfPath}`);
