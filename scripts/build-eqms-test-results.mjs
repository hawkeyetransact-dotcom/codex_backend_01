/**
 * Build the EQMS Test Results document (v2.0) from the lifecycle spec
 * artefacts. Per-module section shows every transition with PASS/SKIP/FAIL,
 * the API called, expected vs observed, and any screenshot captured.
 *
 * Inputs:
 *   frontend/demo-artifacts/lifecycle/lifecycle-results.json
 *   frontend/demo-artifacts/lifecycle/*.png
 *
 * Output:
 *   docs/09-test-reports/eqms-test-results-v2.html
 *   docs/09-test-reports/eqms-test-results-v2.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const artDir = path.resolve(repo, "../frontend/demo-artifacts/lifecycle");
const outHtml = path.join(repo, "docs/09-test-reports/eqms-test-results-v2.html");
const outPdf  = path.join(repo, "docs/09-test-reports/eqms-test-results-v2.pdf");
fs.mkdirSync(path.dirname(outHtml), { recursive: true });

const VERSION = "2.0";
const REVISED = "2026-04-24";
const REVISED_BY = "Hawkeye Engineering · senior-tester pass";

const data = JSON.parse(fs.readFileSync(path.join(artDir, "lifecycle-results.json"), "utf8"));
const results = data.results || [];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function badge(o) {
  const map = { pass: ["ok","PASS"], skip: ["skip","SKIP"], fail: ["fail","FAIL"] };
  const [cls, lbl] = map[o] || ["fail","?"];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function img(file) {
  if (!file) return "";
  const p = path.join(artDir, file);
  if (!fs.existsSync(p)) return `<div class="noimg">screenshot missing: ${esc(file)}</div>`;
  const b64 = fs.readFileSync(p).toString("base64");
  return `<figure><img src="data:image/png;base64,${b64}" alt="${esc(file)}"/><figcaption>${esc(file)}</figcaption></figure>`;
}

const moduleMeta = {
  deviation: { title: "Deviation / Non-Conformance", iso: "ISO 9001:2015 §10.2 · 21 CFR 211.192",
               persona: "Kenji (QA Specialist · admin)",
               flow: "REPORTED → UNDER_ASSESSMENT → UNDER_INVESTIGATION → PENDING_DISPOSITION → PENDING_CAPA_DECISION → CAPA_REQUIRED → CLOSED" },
  "risk-item": { title: "Risk Register (FMEA)", iso: "ISO 9001:2015 §6.1 · ICH Q9",
                 persona: "Kenji (create + mitigate) → Elena (accept + close)",
                 flow: "OPEN → +mitigation → MITIGATED (residual S/O/D) → ACCEPTED → CLOSED" },
  mrm: { title: "Management Review (MRM)", iso: "ISO 9001:2015 §9.3",
         persona: "Elena (VP Quality · tenant_admin)",
         flow: "PLANNED → IN_PROGRESS → (AI inputs) → COMPLETED" },
  doc: { title: "Document Control", iso: "ISO 9001:2015 §7.5 · 21 CFR Part 11",
         persona: "Sarah (Doc Control · admin)",
         flow: "DRAFT → UNDER_REVIEW → APPROVED → EFFECTIVE → WITHDRAWN" },
  "capa-v2": { title: "CAPA v2", iso: "ISO 9001:2015 §10.2 · 21 CFR 211.192",
               persona: "Maria (Lead Auditor)",
               flow: "DRAFT_CANDIDATE → INTAKE_DRAFT → UNDER_TRIAGE → … → CLOSED_EFFECTIVE" },
};

// Group by module
const byModule = {};
for (const r of results) {
  (byModule[r.module] ||= []).push(r);
}
const moduleOrder = Object.keys(byModule);

function renderRow(r, last) {
  return `
  <tr class="step ${r.outcome}">
    <td><strong>${r.step}</strong></td>
    <td><code>${esc(r.state)}</code></td>
    <td>${esc(r.action)}</td>
    <td><code>${esc(r.api || "—")}</code></td>
    <td>${esc(r.expected)}</td>
    <td>${esc(r.observed)}</td>
    <td>${badge(r.outcome)}</td>
  </tr>
  ${r.error ? `<tr class="errrow"><td colspan="7"><strong>Error:</strong> <code>${esc(r.error.slice(0, 280))}</code></td></tr>` : ""}
  ${r.screenshot ? `<tr class="shotrow"><td colspan="7">${img(r.screenshot)}</td></tr>` : ""}`;
}

function renderModule(mod, rows) {
  const meta = moduleMeta[mod] || { title: mod, iso: "", persona: "", flow: "" };
  const pass = rows.filter((r) => r.outcome === "pass").length;
  const skip = rows.filter((r) => r.outcome === "skip").length;
  const fail = rows.filter((r) => r.outcome === "fail").length;
  const tableRows = rows.map((r) => renderRow(r)).join("");
  return `
  <section class="module">
    <h2 id="m-${esc(mod)}">${esc(meta.title)}</h2>
    <table class="kv">
      <tr><td>Persona path</td><td>${esc(meta.persona)}</td></tr>
      <tr><td>Lifecycle</td><td><code>${esc(meta.flow)}</code></td></tr>
      <tr><td>Compliance</td><td>${esc(meta.iso)}</td></tr>
      <tr><td>Result</td><td>${badge("pass")} ${pass} &middot; ${badge("skip")} ${skip} &middot; ${badge("fail")} ${fail} &middot; ${rows.length} step(s)</td></tr>
    </table>
    <table class="steps">
      <thead>
        <tr>
          <th>#</th><th>State after</th><th>Action</th><th>API</th>
          <th>Expected</th><th>Observed</th><th>Result</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </section>`;
}

const totals = { pass: 0, skip: 0, fail: 0 };
for (const r of results) totals[r.outcome] = (totals[r.outcome] || 0) + 1;

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye EQMS — Test Results v${VERSION}</title>
<meta name="hawkeye-doc-version" content="${VERSION}"/>
<meta name="hawkeye-revised" content="${REVISED}"/>
<style>
:root { --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --soft:#f9fafb; }
* { box-sizing:border-box; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink);
       max-width:1080px; margin:24px auto; padding:0 24px; line-height:1.45; font-size:13px; }
h1 { font-size:24px; margin:0 0 4px 0; }
h2 { font-size:18px; margin:30px 0 8px 0; padding-top:14px; border-top:3px solid var(--line); }
h4 { font-size:13px; margin:14px 0 6px 0; color:#374151; text-transform:uppercase; letter-spacing:.05em; }
.subtitle { color:var(--muted); font-size:13px; margin-bottom:18px; }
.banner { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 18px; margin:18px 0 24px 0; }
.banner table { width:100%; border-collapse:collapse; font-size:13px; }
.banner td { padding:3px 8px; vertical-align:top; }
.banner td:first-child { color:var(--muted); width:25%; }
.toc { background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px 18px; }
.toc ol { margin:6px 0 0 18px; padding:0; }
.toc a { text-decoration:none; color:#1e40af; }

table { width:100%; border-collapse:collapse; font-size:11.5px; margin:6px 0 14px 0; }
table.kv td:first-child { color:var(--muted); width:22%; padding:3px 8px; }
table.kv td { padding:4px 8px; vertical-align:top; }
th, td { border:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
th { background:var(--soft); font-weight:600; font-size:11px; }
table.steps tr.fail td { background:#fef2f2; }
table.steps tr.skip td { background:#fffbeb; }
tr.errrow td { background:#fef2f2; color:#991b1b; font-size:11px; }
tr.shotrow td { padding:8px; background:#f9fafb; }
code { font-family:"SF Mono",Consolas,monospace; font-size:11px; background:#f3f4f6; padding:1px 5px; border-radius:3px; }

.badge { display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:4px; letter-spacing:.04em; margin-right:4px; }
.badge.ok   { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; }
.badge.skip { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.badge.fail { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }

figure { border:1px solid var(--line); border-radius:6px; padding:6px; background:#fff; margin:6px 0 0 0; page-break-inside: avoid; }
figure img { width:100%; height:auto; border:1px solid #f3f4f6; border-radius:4px; display:block; }
figcaption { font-size:10px; color:var(--muted); margin-top:4px; font-family:"SF Mono",Consolas,monospace; }
.noimg { background:#f9fafb; border:1px dashed #d1d5db; border-radius:4px; padding:8px; color:#6b7280; font-size:11px; }

@page { size: Letter; margin: 12mm 12mm 14mm 12mm; }
@media print { body { font-size:11.5px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head><body>

<h1>Hawkeye EQMS — Test Results</h1>
<div class="subtitle">Per-module lifecycle test execution against live Vercel. Each row is one state-machine transition asserted by the senior-tester checklist (happy path · state-machine guards · role + data assertions).</div>

<section class="banner">
  <table>
    <tr><td>Document version</td><td><strong>v${VERSION}</strong></td></tr>
    <tr><td>Test executed on</td><td>${data.generatedAt || REVISED}</td></tr>
    <tr><td>Tested by</td><td>${REVISED_BY}</td></tr>
    <tr><td>Modules under test</td><td>${moduleOrder.length} (${moduleOrder.join(" · ")})</td></tr>
    <tr><td>Total steps</td><td>${results.length}</td></tr>
    <tr><td>Result</td><td>${badge("pass")} ${totals.pass} PASS &middot; ${badge("skip")} ${totals.skip || 0} SKIP &middot; ${badge("fail")} ${totals.fail || 0} FAIL</td></tr>
  </table>
</section>

<section class="toc">
  <strong>Contents</strong>
  <ol>
    ${moduleOrder.map((m) => `<li><a href="#m-${m}">${esc(moduleMeta[m]?.title || m)}</a></li>`).join("")}
  </ol>
</section>

${moduleOrder.map((m) => renderModule(m, byModule[m])).join("")}

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
console.log(`summary: ${totals.pass||0} pass · ${totals.skip||0} skip · ${totals.fail||0} fail`);
