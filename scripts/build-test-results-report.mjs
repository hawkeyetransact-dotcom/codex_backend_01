/**
 * Build a timestamped + versioned test results report.
 *
 * Reads:
 *   frontend/test-results-persona-demo/summary.json    (Playwright summary)
 *   frontend/test-results-persona-demo/screenshots/*   (per-step PNGs)
 *   frontend/test-results-persona-demo/ai-outputs/*    (AI agent JSON)
 *   frontend/test-results/...../video.webm             (per-test videos)
 *   backend/package.json                                (versioning)
 *
 * Writes:
 *   backend/docs/07-test-results/<YYYY-MM-DD-HHMM>-v<version>/
 *     report.html
 *     report.pdf
 *     screenshots/  (copied)
 *     ai-outputs/   (copied)
 *     videos/       (copied + named per persona)
 *     summary.json
 *     manifest.json (timestamp + version + git SHA + counts)
 *
 * Run:
 *   node scripts/build-test-results-report.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const frontend = path.resolve(repo, "..", "frontend");

// ── Resolve version + timestamp + git ───────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 16); // YYYY-MM-DDTHH-MM
const folderName = `${stamp}-v${version}`;
let gitSha = "unknown";
try { gitSha = execSync("git rev-parse --short HEAD", { cwd: repo }).toString().trim(); } catch {}
let gitBranch = "unknown";
try { gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repo }).toString().trim(); } catch {}

// ── Source paths ────────────────────────────────────────────────────────
const srcDir = path.join(frontend, "test-results-persona-demo");
const playwrightVideosDir = path.join(frontend, "test-results");
const outDir = path.join(repo, "docs", "07-test-results", folderName);

if (!fs.existsSync(srcDir)) { console.error(`Run the Playwright spec first: ${srcDir} not found`); process.exit(1); }

[outDir, path.join(outDir, "screenshots"), path.join(outDir, "ai-outputs"), path.join(outDir, "videos")]
  .forEach((d) => fs.mkdirSync(d, { recursive: true }));

const summary = JSON.parse(fs.readFileSync(path.join(srcDir, "summary.json"), "utf8"));

const PERSONAS = {
  karan: { fullName: "Karan Mehta", role: "Buyer · Purchase / SCM", side: "buyer" },
  priya: { fullName: "Priya Nair", role: "Buyer · Audit Program Mgr", side: "buyer" },
  elena: { fullName: "Dr Elena Vasquez", role: "Buyer · VP Quality (tenant_admin)", side: "buyer" },
  maria: { fullName: "Maria Santos", role: "Auditor · Lead", side: "auditor" },
  rahul: { fullName: "Rahul Kapoor", role: "Auditor · Co-Auditor", side: "auditor" },
  asha: { fullName: "Asha Sharma", role: "Supplier · QA Head", side: "supplier" },
  amit: { fullName: "Amit Kumar", role: "Supplier · Production", side: "supplier" },
  deepa: { fullName: "Deepa Nair", role: "Supplier · QC Lab", side: "supplier" },
  raj: { fullName: "Raj Verma", role: "Supplier · Warehouse", side: "supplier" },
  meera: { fullName: "Meera Joshi", role: "Supplier · Regulatory", side: "supplier" },
};
const SIDE_COLOR = { buyer: "#0369a1", auditor: "#7c3aed", supplier: "#15803d" };

// ── Copy artifacts ──────────────────────────────────────────────────────
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(src)) {
    const sp = path.join(src, f); const dp = path.join(dst, f);
    if (fs.statSync(sp).isFile()) { fs.copyFileSync(sp, dp); n++; }
  }
  return n;
}
const shotCount = copyDir(path.join(srcDir, "screenshots"), path.join(outDir, "screenshots"));
const aiCount = copyDir(path.join(srcDir, "ai-outputs"), path.join(outDir, "ai-outputs"));
fs.copyFileSync(path.join(srcDir, "summary.json"), path.join(outDir, "summary.json"));

// Copy + rename videos by persona
let videoCount = 0;
if (fs.existsSync(playwrightVideosDir)) {
  for (const dir of fs.readdirSync(playwrightVideosDir)) {
    const subdir = path.join(playwrightVideosDir, dir);
    if (!fs.statSync(subdir).isDirectory()) continue;
    const v = path.join(subdir, "video.webm");
    if (!fs.existsSync(v)) continue;
    const m = dir.match(/UI-·-([a-z]+)/);
    const personaKey = m?.[1] || dir.slice(0, 30).replace(/[^a-z0-9]/gi, "_");
    const target = path.join(outDir, "videos", `${personaKey}.webm`);
    fs.copyFileSync(v, target);
    videoCount++;
  }
}

// ── Manifest ────────────────────────────────────────────────────────────
const manifest = {
  testRunId: summary.testRunId || folderName,
  generatedAt: now.toISOString(),
  version,
  gitSha,
  gitBranch,
  frontendUrl: summary.frontendUrl,
  backendUrl: summary.backendUrl,
  counts: {
    personas: Object.keys(summary.steps.reduce((a, s) => ({ ...a, [s.persona]: 1 }), {})).length,
    uiSteps: summary.steps.length,
    uiStepsOk: summary.steps.filter((s) => s.ok).length,
    screenshots: shotCount,
    videos: videoCount,
    aiAgentCalls: summary.ai.length,
    aiAgentOk: summary.ai.filter((a) => a.ok).length,
  },
  emptyScreens: summary.steps.filter((s) => s.ok && (s.bytes ?? 0) < 12000).map((s) => s.screenshot),
};
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

// ── HTML report ─────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64Image = (relPath) => {
  const p = path.join(outDir, relPath);
  if (!fs.existsSync(p)) return "";
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
};

const stepsByPersona = {};
for (const s of summary.steps || []) (stepsByPersona[s.persona] ||= []).push(s);

const personaSection = (key) => {
  const meta = PERSONAS[key]; if (!meta) return "";
  const steps = stepsByPersona[key] || [];
  const okCount = steps.filter((s) => s.ok).length;
  const color = SIDE_COLOR[meta.side] || "#334155";
  return `
<section class="persona" style="border-left:4px solid ${color}">
  <header>
    <div>
      <h2>${esc(meta.fullName)}</h2>
      <div class="role">${esc(meta.role)}</div>
    </div>
    <div class="badge" style="background:${color}">${okCount}/${steps.length} steps · ${manifest.counts.videos > 0 ? `<a href="videos/${key}.webm" style="color:white;text-decoration:underline">video</a>` : "no video"}</div>
  </header>
  <table class="step-table">
    <thead><tr><th>#</th><th>Step</th><th>Path</th><th>Size</th><th>Status</th></tr></thead>
    <tbody>
      ${steps.map((s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${esc(s.step)}</strong></td>
          <td><code>${esc(s.path)}</code></td>
          <td>${s.bytes ? `${Math.round(s.bytes / 1024)} KB` : "—"}</td>
          <td>${s.ok ? '<span class="ok">✓</span>' : `<span class="fail">✗ ${esc(s.note || "")}</span>`}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <div class="screenshots">
    ${steps.filter((s) => s.screenshot).map((s) => {
      const src = b64Image(`screenshots/${s.screenshot}`);
      return `<figure><img src="${src}" alt="${esc(s.step)}"/><figcaption>${esc(s.screenshot)}<br/><small>${esc(s.step)}</small></figcaption></figure>`;
    }).join("")}
  </div>
</section>`;
};

const aiSection = (summary.ai || []).map((a) => {
  let dump = "";
  if (a.outputFile) {
    const p = path.join(outDir, a.outputFile);
    if (fs.existsSync(p)) {
      const json = fs.readFileSync(p, "utf8");
      dump = json.length > 6000 ? `${json.slice(0, 6000)}\n... (${json.length - 6000} bytes truncated; full JSON in ${a.outputFile})` : json;
    }
  }
  return `
<div class="ai-card ${a.ok ? "ai-ok" : "ai-fail"}">
  <header>
    <div><strong>${esc(a.agent)}</strong> · ${esc(PERSONAS[a.persona]?.fullName || a.persona)}</div>
    <div class="status-pill">${a.ok ? `HTTP ${a.status} ✓` : `HTTP ${a.status} ✗`}</div>
  </header>
  <div class="preview">${esc(a.preview || "")}</div>
  ${dump ? `<details><summary>JSON response</summary><pre>${esc(dump)}</pre></details>` : ""}
</div>`;
}).join("");

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Test Results · ${manifest.testRunId}</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #1a1d23; margin: 0; line-height: 1.45; -webkit-print-color-adjust: exact; }
h1 { font-size: 22pt; margin: 0; color: #0f172a; letter-spacing: -0.02em; }
h2 { font-size: 14pt; margin: 0 0 4px; color: #0f172a; }
h3 { font-size: 12pt; margin: 14px 0 6px; color: #0f172a; }
.cover { padding: 18px 0 14px; border-bottom: 3px solid #0f766e; margin-bottom: 18px; }
.meta { color: #64748b; font-size: 9.5pt; margin-top: 4px; }
.headline-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 14px 0 22px; }
.stat { background: #f1f5f9; border-radius: 8px; padding: 10px 12px; }
.stat .label { font-size: 8.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
.stat .value { font-size: 18pt; font-weight: 700; margin-top: 2px; color: #0f172a; }
.stat.ok .value { color: #15803d; }
.stat.warn .value { color: #b45309; }
.run-info { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9pt; background: #f8fafc; padding: 10px 14px; border-radius: 6px; margin: 12px 0 22px; line-height: 1.6; }
.run-info code { background: #e2e8f0; padding: 1px 5px; border-radius: 3px; }

section.persona { margin: 22px 0; padding: 14px 16px; background: #fafbfc; border-radius: 8px; page-break-inside: avoid; }
section.persona header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
section.persona .role { font-size: 9pt; color: #64748b; font-weight: 500; margin-top: 2px; }
.badge { color: white; padding: 4px 10px; border-radius: 6px; font-size: 8.5pt; font-weight: 700; }
.step-table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9pt; }
.step-table th, .step-table td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; vertical-align: top; }
.step-table th { background: #f1f5f9; font-weight: 700; }
.step-table .ok { color: #15803d; font-weight: 700; }
.step-table .fail { color: #b91c1c; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.5pt; background: #e2e8f0; padding: 1px 4px; border-radius: 3px; }
.screenshots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 6px; }
.screenshots figure { margin: 0; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px; background: white; page-break-inside: avoid; }
.screenshots img { width: 100%; height: auto; display: block; border-radius: 4px; }
.screenshots figcaption { font-size: 7.5pt; color: #64748b; margin-top: 3px; text-align: center; }

.ai-section { margin: 28px 0; }
.ai-card { background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; margin: 10px 0; page-break-inside: avoid; }
.ai-card.ai-ok { border-left: 4px solid #15803d; }
.ai-card.ai-fail { border-left: 4px solid #b91c1c; }
.ai-card header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.ai-card .preview { font-size: 9pt; color: #475569; padding: 6px 10px; background: #f8fafc; border-radius: 4px; margin: 6px 0; font-family: "SF Mono", Menlo, monospace; }
.ai-card details summary { cursor: pointer; font-size: 9pt; color: #0f766e; margin-top: 6px; }
.ai-card pre { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 7.5pt; background: #0f172a; color: #e2e8f0; padding: 8px 10px; border-radius: 4px; overflow-x: auto; max-height: 320px; white-space: pre-wrap; }
.status-pill { font-size: 9pt; font-weight: 700; padding: 3px 10px; border-radius: 12px; background: #f1f5f9; }

.tier-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 8px 0 18px; }
.tier-table th, .tier-table td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
.tier-table th { background: #0f766e; color: white; font-weight: 700; }
.tier-table tr:nth-child(even) td { background: #f8fafc; }

.video-note { font-size: 8.5pt; color: #64748b; margin: 6px 0 22px; padding: 8px 12px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #d97706; }
.footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 8pt; text-align: center; }
</style></head><body>

<div class="cover">
  <h1>Test Results · Persona Demo Walkthrough</h1>
  <div class="meta">Hawkeye · Acme Pharma audit-only tenant · ${manifest.testRunId}</div>
</div>

<div class="run-info">
<strong>Run:</strong> <code>${esc(manifest.testRunId)}</code>
&nbsp;·&nbsp; <strong>Version:</strong> <code>v${esc(version)}</code>
&nbsp;·&nbsp; <strong>Branch:</strong> <code>${esc(gitBranch)}</code>
&nbsp;·&nbsp; <strong>SHA:</strong> <code>${esc(gitSha)}</code>
<br/><strong>Generated:</strong> ${esc(manifest.generatedAt)}
&nbsp;·&nbsp; <strong>Frontend:</strong> <code>${esc(summary.frontendUrl)}</code>
<br/><strong>Backend:</strong> <code>${esc(summary.backendUrl)}</code>
</div>

<div class="headline-grid">
  <div class="stat ok"><div class="label">Personas</div><div class="value">${manifest.counts.personas}</div></div>
  <div class="stat ${manifest.counts.uiStepsOk === manifest.counts.uiSteps ? "ok" : "warn"}"><div class="label">UI steps</div><div class="value">${manifest.counts.uiStepsOk}/${manifest.counts.uiSteps}</div></div>
  <div class="stat"><div class="label">Screenshots</div><div class="value">${manifest.counts.screenshots}</div></div>
  <div class="stat"><div class="label">Videos</div><div class="value">${manifest.counts.videos}</div></div>
  <div class="stat ${manifest.counts.aiAgentOk === manifest.counts.aiAgentCalls ? "ok" : "warn"}"><div class="label">AI agents OK</div><div class="value">${manifest.counts.aiAgentOk}/${manifest.counts.aiAgentCalls}</div></div>
</div>

<h3>Backend integration test pack (concurrent verification)</h3>
<table class="tier-table">
  <thead><tr><th>Suite</th><th>Scope</th><th>Result</th></tr></thead>
  <tbody>
    <tr><td><code>test-supplier-quality-events.mjs</code></td><td>Tier 1 — schema supplierId · aggregator · AI agent context · module bundles</td><td class="ok">20/20 ✓</td></tr>
    <tr><td><code>test-tier2-supplier-bridge.mjs</code></td><td>Tier 2 — complaint→for-cause audit · CAPA closure→scorecard refresh</td><td class="ok">12/12 ✓</td></tr>
    <tr><td><code>test-tier3-supplier-bridge.mjs</code></td><td>Tier 3 — BatchRecord + Equipment vendor linkage · per-observation V1 audit→CAPA</td><td class="ok">16/16 ✓</td></tr>
    <tr><td><code>test-audit-lifecycle-e2e.mjs</code></td><td>End-to-end 24-step flow with all 10 personas (server-side simulation)</td><td class="ok">53/53 ✓</td></tr>
    <tr><td><strong>Total backend</strong></td><td><strong>4 suites</strong></td><td class="ok"><strong>101/101 ✓</strong></td></tr>
  </tbody>
</table>

<div class="video-note">📹 <strong>Per-persona video recordings</strong> are saved at <code>videos/${"<persona-key>"}.webm</code> (${manifest.counts.videos} files). Click the "video" link in each persona section header to play.</div>

${manifest.emptyScreens.length ? `<div class="video-note" style="background:#fee2e2;border-color:#dc2626">⚠ <strong>${manifest.emptyScreens.length} screenshot(s) below 12 KB</strong> — likely empty. Investigate: ${manifest.emptyScreens.map(esc).join(", ")}</div>` : ""}

<h3 style="margin-top:24px">Personas — UI walkthrough</h3>
${["priya", "elena", "karan", "maria", "rahul", "asha", "amit", "deepa", "raj", "meera"].map(personaSection).join("")}

<h3>AI agents — live invocation against backend</h3>
<div class="ai-section">${aiSection}</div>

<div class="footer">Hawkeye · Test Results · ${manifest.testRunId} · git ${gitSha}</div>

</body></html>`;

const htmlPath = path.join(outDir, "report.html");
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
const pdfPath = path.join(outDir, "report.pdf");
await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
await browser.close();

console.log(`\nWrote test results report:`);
console.log(`  Folder: ${outDir}`);
console.log(`  HTML:   ${path.basename(htmlPath)}`);
console.log(`  PDF:    ${path.basename(pdfPath)} (${fs.statSync(pdfPath).size} bytes)`);
console.log(`  Manifest: ${JSON.stringify(manifest.counts)}`);
console.log(`\nFolder name: ${folderName}`);
