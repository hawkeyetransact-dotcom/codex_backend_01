/**
 * Build a master index of all module feature guides + (optionally) merge
 * them into a single combined PDF.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const guideDir = path.join(repo, "docs/05-feature-guides");
const outHtml = path.join(guideDir, "_index.html");
const outPdf  = path.join(guideDir, "_index.pdf");

const order = [
  "deviation", "capa-v2", "document-control", "risk-register", "management-review",
  "training", "change-control", "complaint", "batch-records", "equipment",
  "supplier-prequal", "internal-audit", "audit-rfq", "design-control",
];

const cards = [];
for (const key of order) {
  const specPath = path.join(__dirname, "specs", `${key}-feature-guide.mjs`);
  if (!fs.existsSync(specPath)) { console.warn(`spec missing: ${key}`); continue; }
  const spec = (await import(pathToFileURL(specPath).href)).default;
  const pdfPath = path.join(guideDir, `${key}-feature-guide.pdf`);
  const pdfSize = fs.existsSync(pdfPath) ? Math.round(fs.statSync(pdfPath).size / 1024) : 0;
  const featureCount = (spec.features || []).length;
  const stateCount = new Set((spec.lifecycle || []).flatMap((s) => [s.fromState, s.toState]).filter(Boolean)).size;
  const aiCount = (spec.aiAssists || []).length;
  const gapCount = (spec.comparison || []).filter((c) => c.outcome === "gap").length;
  const partialCount = (spec.comparison || []).filter((c) => c.outcome === "partial").length;
  const metCount = (spec.comparison || []).filter((c) => c.outcome === "met").length;
  cards.push({ key, spec, pdfSize, featureCount, stateCount, aiCount, gapCount, partialCount, metCount });
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

const totalGaps = cards.reduce((a, c) => a + c.gapCount, 0);
const totalPartials = cards.reduce((a, c) => a + c.partialCount, 0);
const totalMet = cards.reduce((a, c) => a + c.metCount, 0);
const totalFeatures = cards.reduce((a, c) => a + c.featureCount, 0);
const totalAi = cards.reduce((a, c) => a + c.aiCount, 0);

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye EQMS — Feature Guide Index v1.0</title>
<style>
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:#111827; max-width:1080px; margin:24px auto; padding:0 24px; line-height:1.5; font-size:13px; }
h1 { font-size:28px; margin:0 0 4px 0; }
h2 { font-size:18px; margin:30px 0 8px 0; padding-top:16px; border-top:3px solid #e5e7eb; }
.subtitle { color:#6b7280; font-size:13px; margin-bottom:18px; }
.banner { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 18px; margin:18px 0 24px 0; }
.banner table { width:100%; border-collapse:collapse; font-size:13px; }
.banner td { padding:3px 8px; vertical-align:top; }
.banner td:first-child { color:#6b7280; width:25%; }
table.cards { width:100%; border-collapse:collapse; font-size:11.5px; }
table.cards th, table.cards td { border:1px solid #e5e7eb; padding:8px; text-align:left; vertical-align:top; }
table.cards th { background:#f9fafb; font-size:11px; font-weight:600; }
table.cards a { color:#1e40af; text-decoration:none; font-weight:600; }
.metric { display:inline-block; padding:2px 6px; margin-right:3px; font-size:10px; font-weight:700; border-radius:3px; }
.met  { background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; }
.partial { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }
.gap  { background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; }
.feat { background:#e0e7ff; color:#3730a3; border:1px solid #a5b4fc; }
.ai   { background:#f3e8ff; color:#6b21a8; border:1px solid #d8b4fe; }
code { font-family:"SF Mono",Consolas,monospace; font-size:11px; background:#f3f4f6; padding:1px 5px; border-radius:3px; }
@page { size: Letter; margin: 12mm; }
</style></head><body>
<h1>Hawkeye EQMS · Module Feature Guides — Master Index</h1>
<div class="subtitle">14 modules, comprehensive per-module guides. Each guide has 9 sections: Overview · Pharma-vs-Hawkeye gap analysis · Personas · Click-by-click feature catalogue · Lifecycle walkthrough (with expected DB state per step) · AI map · Regulator-trace matrix · Test results · Roadmap.</div>

<section class="banner">
  <table>
    <tr><td>Generated on</td><td>${new Date().toISOString()}</td></tr>
    <tr><td>Tenant under test</td><td>Novex Pharma Inc. · <code>69e64e7869b2ba745d40bb89</code></td></tr>
    <tr><td>Live frontend</td><td><code>https://hawkeye-frontend-dev-chi.vercel.app</code></td></tr>
    <tr><td>Live backend</td><td><code>https://hawkeye-backend-dev.vercel.app</code></td></tr>
    <tr><td>Modules covered</td><td>${cards.length}</td></tr>
    <tr><td>Total features documented (click-by-click)</td><td>${totalFeatures}</td></tr>
    <tr><td>Total AI assists wired</td><td>${totalAi}</td></tr>
    <tr><td>Pharma expectations status</td><td><span class="metric met">${totalMet} MET</span> <span class="metric partial">${totalPartials} PARTIAL</span> <span class="metric gap">${totalGaps} GAP</span></td></tr>
  </table>
</section>

<h2>Feature Guides</h2>
<table class="cards">
<thead><tr><th style="width:18%">Module</th><th style="width:30%">Pharma purpose</th><th style="width:14%">Compliance</th><th style="width:14%">Status</th><th style="width:12%">Stats</th><th style="width:12%">PDF</th></tr></thead>
<tbody>
${cards.map((c) => `
  <tr>
    <td><a href="${c.key}-feature-guide.pdf">${esc(c.spec.moduleName)}</a><br/><span style="color:#6b7280;font-size:10px">v${esc(c.spec.version)}</span></td>
    <td>${esc((c.spec.purpose || "").slice(0, 220))}</td>
    <td><span style="font-size:10px">${esc((c.spec.compliance || "").split(" · ").slice(0, 2).join(" · "))}</span></td>
    <td>
      <span class="metric met">${c.metCount} MET</span>
      <span class="metric partial">${c.partialCount} PRT</span>
      <span class="metric gap">${c.gapCount} GAP</span>
    </td>
    <td>
      <span class="metric feat">${c.featureCount} features</span>
      <span class="metric ai">${c.aiCount} AI</span>
    </td>
    <td><a href="${c.key}-feature-guide.pdf">${c.pdfSize} KB</a></td>
  </tr>
`).join("")}
</tbody></table>

<h2>How to use</h2>
<ul>
  <li><strong>For demo presenters:</strong> open the relevant module's PDF and walk the 'Click-by-click feature catalogue' section page-by-page with the customer.</li>
  <li><strong>For QA reviewers:</strong> jump to the 'Standard pharma EQMS vs Hawkeye gap analysis' (section 2) for quick coverage assessment, then 'Regulator-trace matrix' (section 7) to verify each lifecycle state cites the right CFR / ISO / ICH clause.</li>
  <li><strong>For testers:</strong> the 'Lifecycle walkthrough' (section 5) shows expected DB state after each transition — use that to verify the entity is in the right shape.</li>
  <li><strong>For developers:</strong> the 'Roadmap' (section 9) lists known gaps with priority labels. Pick HIGH-priority items first.</li>
  <li><strong>For tenant admins:</strong> the 'AI assistance map' (section 6) tells you which AI agents fire at which states + their token-cost provider — feeds the planned ROI / token-budget tool.</li>
</ul>

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
console.log(`\n=== INDEX SUMMARY ===`);
console.log(`  ${cards.length} modules`);
console.log(`  ${totalFeatures} features documented click-by-click`);
console.log(`  ${totalAi} AI assists`);
console.log(`  ${totalMet} MET / ${totalPartials} PARTIAL / ${totalGaps} GAP across pharma expectations`);
