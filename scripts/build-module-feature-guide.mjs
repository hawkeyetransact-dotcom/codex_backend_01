/**
 * Build a comprehensive per-module Feature Guide.
 *
 * Per-module deliverable contains, in order:
 *   1. Module overview + pharma context
 *   2. Standard-vs-Hawkeye comparison matrix (gap analysis)
 *   3. Personas (who uses this module + what they do)
 *   4. Feature catalogue — every menu, every button, every field,
 *      every dialog, every drawer, click-by-click + screenshot
 *   5. Lifecycle walkthrough — one transaction created and walked
 *      through every state to terminal closure, persona by persona
 *   6. AI assistance map — which AI agent attaches at which state
 *      and what it returns
 *   7. Test results matrix — what was executed, what passed
 *   8. Known gaps + roadmap
 *
 * Each module supplies a spec object via a sibling file, e.g.
 *   scripts/specs/deviation-feature-guide.mjs
 *
 * Run:
 *   node scripts/build-module-feature-guide.mjs deviation
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");

const moduleKey = process.argv[2] || "deviation";
const specPath = path.join(__dirname, "specs", `${moduleKey}-feature-guide.mjs`);
if (!fs.existsSync(specPath)) {
  console.error(`Spec not found: ${specPath}`);
  process.exit(1);
}
const spec = (await import(pathToFileURL(specPath).href)).default;

const outDir = path.join(repo, "docs", "05-feature-guides");
fs.mkdirSync(outDir, { recursive: true });
const outHtml = path.join(outDir, `${moduleKey}-feature-guide.html`);
const outPdf  = path.join(outDir, `${moduleKey}-feature-guide.pdf`);

const captureRoot = path.resolve(repo, "..", "frontend", "demo-artifacts");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function imgEmbed(captureFile) {
  if (!captureFile) return "";
  // captureFile may be a relative path under demo-artifacts/ or an absolute path
  let p = path.isAbsolute(captureFile) ? captureFile : path.join(captureRoot, captureFile);
  if (!fs.existsSync(p)) return `<div class="noimg">screenshot not found: <code>${esc(captureFile)}</code></div>`;
  const b64 = fs.readFileSync(p).toString("base64");
  return `<figure><img src="data:image/png;base64,${b64}" alt="${esc(captureFile)}"/><figcaption>${esc(captureFile)}</figcaption></figure>`;
}

function pill(text, kind = "neutral") {
  return `<span class="pill p-${kind}">${esc(text)}</span>`;
}

function badge(outcome) {
  const map = { pass: ["ok","PASS"], skip: ["skip","SKIP"], fail: ["fail","FAIL"], partial: ["info","PARTIAL"], gap: ["fail","GAP"], met: ["ok","MET"] };
  const [cls, lbl] = map[outcome] || ["neutral", outcome.toUpperCase()];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

// ── Section renderers ───────────────────────────────────────────────────
function renderOverview(s) {
  return `
  <section>
    <h2 id="overview">1. Module overview</h2>
    <table class="kv">
      <tr><td>Module</td><td><strong>${esc(s.moduleName)}</strong></td></tr>
      <tr><td>Pharma purpose</td><td>${esc(s.purpose)}</td></tr>
      <tr><td>Compliance basis</td><td>${esc(s.compliance)}</td></tr>
      <tr><td>Hawkeye routes</td><td>${s.routes.map((r) => `<code>${esc(r)}</code>`).join(" &middot; ")}</td></tr>
      <tr><td>Hawkeye model file</td><td><code>${esc(s.modelFile)}</code></td></tr>
      <tr><td>Tenant module flag</td><td><code>${esc(s.moduleFlag)}</code></td></tr>
    </table>
    <p>${s.overviewBody || ""}</p>
  </section>`;
}

function renderComparison(s) {
  const rows = (s.comparison || []).map((c) => `
    <tr>
      <td><strong>${esc(c.expectation)}</strong><br/><span style="color:#6b7280;font-size:11px">${esc(c.standard || "")}</span></td>
      <td>${esc(c.hawkeye)}</td>
      <td>${badge(c.outcome)}</td>
      <td>${esc(c.note || "")}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 id="comparison">2. Standard pharma EQMS vs Hawkeye — gap analysis</h2>
    <p style="color:#6b7280;font-size:12px">Each row is a capability a pharma QA team would expect from an EQMS deviation module. Hawkeye column shows what's actually shipped. <span class="badge ok">MET</span> = parity, <span class="badge info">PARTIAL</span> = ships but with caveats, <span class="badge fail">GAP</span> = not implemented yet.</p>
    <table>
      <thead><tr><th style="width:30%">Pharma expectation</th><th style="width:38%">Hawkeye implementation</th><th style="width:10%">Status</th><th style="width:22%">Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderPersonas(s) {
  const rows = (s.personas || []).map((p) => `
    <tr>
      <td><strong>${esc(p.name)}</strong><br/><span style="color:#6b7280">${esc(p.role)}</span></td>
      <td><code>${esc(p.email)}</code></td>
      <td>${esc(p.responsibilities)}</td>
      <td>${(p.touches || []).map((t) => pill(t, "click")).join(" ")}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 id="personas">3. Personas + role mapping</h2>
    <p style="color:#6b7280;font-size:12px">Login password for every persona: <code>EqmsDemo@2026</code>. Roles drive which API endpoints respond — see Hawkeye <code>roleMiddleware.permit()</code>.</p>
    <table>
      <thead><tr><th style="width:18%">Persona</th><th style="width:22%">Email</th><th style="width:38%">Responsibilities in this module</th><th style="width:22%">Lifecycle states they touch</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderFeatures(s) {
  const sections = (s.features || []).map((f, i) => `
    <section class="feature">
      <h3 id="feature-${i + 1}">4.${i + 1} ${esc(f.name)}</h3>
      <table class="kv">
        <tr><td>What it does</td><td>${esc(f.what)}</td></tr>
        <tr><td>Menu / route</td><td><code>${esc(f.location)}</code></td></tr>
        <tr><td>Available to roles</td><td>${(f.roles || []).map((r) => pill(r, "click")).join(" ")}</td></tr>
        ${f.api ? `<tr><td>Backend API</td><td><code>${esc(f.api)}</code></td></tr>` : ""}
        ${f.aiAssist ? `<tr><td>AI assistance</td><td><span class="badge info">AI</span> ${esc(f.aiAssist)}</td></tr>` : ""}
      </table>

      <h4>Click-by-click</h4>
      <ol class="clicks">
        ${(f.steps || []).map((step) => `
          <li>
            <span class="pill p-${(step.kind || "click").toLowerCase()}">${(step.kind || "click").toUpperCase()}</span>
            ${esc(step.label)}
            ${step.expect ? `<div class="expect"><span class="chev">&rarr;</span> ${esc(step.expect)}</div>` : ""}
          </li>`).join("")}
      </ol>

      ${f.fields ? `
        <h4>Fields captured</h4>
        <table>
          <thead><tr><th>Field</th><th>Required</th><th>Validation / values</th><th>Notes</th></tr></thead>
          <tbody>
            ${f.fields.map((fl) => `<tr>
              <td><code>${esc(fl.name)}</code></td>
              <td>${fl.required ? "Yes" : "No"}</td>
              <td>${esc(fl.values || "")}</td>
              <td>${esc(fl.note || "")}</td>
            </tr>`).join("")}
          </tbody>
        </table>` : ""}

      ${f.screenshot ? imgEmbed(f.screenshot) : ""}
      ${f.tip ? `<div class="tip"><strong>Tip:</strong> ${esc(f.tip)}</div>` : ""}
    </section>`).join("");
  return `
  <section>
    <h2 id="features">4. Feature catalogue (click-by-click)</h2>
    ${sections}
  </section>`;
}

function renderLifecycle(s) {
  const rows = (s.lifecycle || []).map((step) => `
    <tr class="lc-step ${step.outcome || ""}">
      <td><strong>${step.step}</strong></td>
      <td><strong>${esc(step.persona || "")}</strong><br/><span style="color:#6b7280">${esc(step.role || "")}</span></td>
      <td><code>${esc(step.fromState || "—")}</code> &rarr; <code>${esc(step.toState || step.fromState || "—")}</code></td>
      <td>${esc(step.action)}</td>
      <td><code>${esc(step.api || "—")}</code></td>
      <td>${esc(step.observed || "—")}</td>
      <td>${badge(step.outcome || "pass")}</td>
    </tr>
    ${step.screenshot ? `<tr class="shotrow"><td colspan="7">${imgEmbed(step.screenshot)}</td></tr>` : ""}
  `).join("");
  return `
  <section>
    <h2 id="lifecycle">5. Full lifecycle walkthrough — one transaction, end-to-end</h2>
    <p style="color:#6b7280;font-size:12px">${esc(s.lifecycleIntro || "")}</p>
    <table class="lifecycle">
      <thead>
        <tr>
          <th style="width:4%">#</th>
          <th style="width:14%">Persona</th>
          <th style="width:18%">State transition</th>
          <th style="width:24%">Action</th>
          <th style="width:18%">API</th>
          <th style="width:14%">Observed</th>
          <th style="width:8%">Result</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderAiMap(s) {
  const rows = (s.aiAssists || []).map((a) => `
    <tr>
      <td><strong>${esc(a.name)}</strong></td>
      <td>${(a.attachedToStates || []).map((st) => `<code>${esc(st)}</code>`).join(" ")}</td>
      <td><code>${esc(a.endpoint)}</code></td>
      <td>${esc(a.where)}</td>
      <td>${esc(a.what)}</td>
      <td>${esc(a.provider || "Free Gemini 2.5 Flash-Lite")}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 id="ai">6. AI assistance map</h2>
    <p style="color:#6b7280;font-size:12px">Each AI assist is a separate endpoint. Outputs flow through the grounded-generation runtime (citation gate, confidence floor, schema validation, accept/reject audit trail).</p>
    <table>
      <thead><tr><th>AI agent</th><th>Attached to state(s)</th><th>Endpoint</th><th>Where in UI</th><th>What it returns</th><th>Provider</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderTestResults(s) {
  const rows = (s.testResults || []).map((t) => `
    <tr>
      <td>${esc(t.suite)}</td>
      <td>${esc(t.scope)}</td>
      <td>${badge(t.outcome)}</td>
      <td>${esc(t.evidence || "")}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 id="test">7. Test results matrix</h2>
    <table>
      <thead><tr><th>Suite</th><th>Scope</th><th>Result</th><th>Evidence</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function renderRoadmap(s) {
  if (!s.roadmap?.length) return "";
  const items = s.roadmap.map((r) => `<li><strong>${esc(r.title)}</strong> — ${esc(r.note)}${r.priority ? ` ${pill(r.priority, "warn")}` : ""}</li>`).join("");
  return `
  <section>
    <h2 id="roadmap">8. Known gaps + roadmap</h2>
    <ul>${items}</ul>
  </section>`;
}

// ── Main HTML scaffold ──────────────────────────────────────────────────
const now = new Date().toISOString();
const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye EQMS — ${esc(spec.moduleName)} · Feature Guide v${esc(spec.version)}</title>
<style>
:root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --soft:#f9fafb; }
* { box-sizing:border-box; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink);
       max-width:1080px; margin:24px auto; padding:0 24px; line-height:1.5; font-size:13px; }
h1 { font-size:26px; margin:0 0 4px 0; }
h2 { font-size:20px; margin:32px 0 8px 0; padding-top:14px; border-top:3px solid var(--line); }
h3 { font-size:16px; margin:20px 0 6px 0; color:#1f2937; }
h4 { font-size:12px; margin:14px 0 4px 0; color:#374151; text-transform:uppercase; letter-spacing:.05em; }
.subtitle { color:var(--muted); font-size:12px; margin-bottom:18px; }

.banner { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 18px; margin:18px 0 24px 0; }
.banner table { width:100%; border-collapse:collapse; font-size:12px; }
.banner td { padding:3px 8px; vertical-align:top; }
.banner td:first-child { color:var(--muted); width:25%; }

.toc { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px 18px; margin-bottom:20px; }
.toc ol { margin:6px 0 0 18px; padding:0; }
.toc a { text-decoration:none; color:#1e40af; }

table { width:100%; border-collapse:collapse; font-size:11.5px; margin:6px 0 12px 0; }
table.kv td:first-child { color:var(--muted); width:22%; padding:3px 8px; }
table.kv td { padding:3px 8px; vertical-align:top; }
th, td { border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
th { background:var(--soft); font-weight:600; font-size:11px; }

.feature { background:#fafbfc; border:1px solid var(--line); border-left:3px solid #6366f1; border-radius:6px; padding:12px 16px; margin:12px 0 16px 0; page-break-inside: avoid; }
.feature h3 { margin-top:0; color:#3730a3; }
.feature .tip { font-size:11px; background:#fffbeb; border-left:3px solid #f59e0b; padding:6px 10px; border-radius:0 4px 4px 0; margin-top:8px; }

.clicks { padding-left:18px; margin:6px 0; font-size:12px; }
.clicks li { margin:4px 0; }
.expect { font-size:11px; color:#475569; padding-left:8px; }
.expect .chev { color:#9ca3af; margin-right:3px; }

.pill { display:inline-block; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:4px; letter-spacing:.04em; margin-right:4px; }
.p-click    { background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; }
.p-navigate { background:#dcfce7; color:#166534; border:1px solid #86efac; }
.p-type     { background:#ede9fe; color:#5b21b6; border:1px solid #c4b5fd; }
.p-wait     { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.p-api      { background:#f3e8ff; color:#6b21a8; border:1px solid #d8b4fe; }
.p-warn     { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.p-neutral  { background:#f3f4f6; color:#374151; border:1px solid #d1d5db; }

.badge { display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; letter-spacing:.04em; }
.badge.ok      { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; }
.badge.skip    { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.badge.fail    { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
.badge.info    { background:#e0e7ff; color:#3730a3; border:1px solid #a5b4fc; }
.badge.neutral { background:#f3f4f6; color:#374151; border:1px solid #d1d5db; }

table.lifecycle tr.fail td { background:#fef2f2; }
table.lifecycle tr.skip td { background:#fffbeb; }
tr.shotrow td { padding:6px; background:#f9fafb; }

figure { border:1px solid var(--line); border-radius:6px; padding:6px; background:#fff; margin:8px 0; page-break-inside: avoid; }
figure img { width:100%; height:auto; border:1px solid #f3f4f6; border-radius:4px; display:block; }
figcaption { font-size:10px; color:var(--muted); margin-top:4px; font-family:"SF Mono",Consolas,monospace; }
.noimg { padding:8px; background:#f9fafb; border:1px dashed #d1d5db; border-radius:4px; color:#6b7280; font-size:11px; }

code { font-family:"SF Mono",Consolas,monospace; font-size:11px; background:#f3f4f6; padding:1px 5px; border-radius:3px; }

@page { size: Letter; margin: 12mm 12mm 14mm 12mm; }
@media print { body { font-size:11px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } .feature { page-break-inside: auto; } }
</style>
</head><body>

<h1>Hawkeye EQMS · ${esc(spec.moduleName)} · Feature Guide</h1>
<div class="subtitle">Pharma-EQMS comparison · click-by-click guide · personas + lifecycle walkthrough · AI map · test results.</div>

<section class="banner">
  <table>
    <tr><td>Document version</td><td><strong>v${esc(spec.version)}</strong></td></tr>
    <tr><td>Generated on</td><td>${now}</td></tr>
    <tr><td>Tenant under test</td><td>Novex Pharma Inc. · <code>${esc(spec.tenantId || "69e64e7869b2ba745d40bb89")}</code></td></tr>
    <tr><td>Live frontend</td><td><code>${esc(spec.frontend || "https://hawkeye-frontend-dev-chi.vercel.app")}</code></td></tr>
    <tr><td>Live backend</td><td><code>${esc(spec.backend || "https://hawkeye-backend-dev.vercel.app")}</code></td></tr>
  </table>
</section>

<section class="toc">
  <strong>Contents</strong>
  <ol>
    <li><a href="#overview">Module overview</a></li>
    <li><a href="#comparison">Standard pharma EQMS vs Hawkeye — gap analysis</a></li>
    <li><a href="#personas">Personas + role mapping</a></li>
    <li><a href="#features">Feature catalogue (click-by-click)</a></li>
    <li><a href="#lifecycle">Full lifecycle walkthrough — one transaction, end-to-end</a></li>
    <li><a href="#ai">AI assistance map</a></li>
    <li><a href="#test">Test results matrix</a></li>
    <li><a href="#roadmap">Known gaps + roadmap</a></li>
  </ol>
</section>

${renderOverview(spec)}
${renderComparison(spec)}
${renderPersonas(spec)}
${renderFeatures(spec)}
${renderLifecycle(spec)}
${renderAiMap(spec)}
${renderTestResults(spec)}
${renderRoadmap(spec)}

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
