/**
 * Build a combined PDF report covering Round 1 (manual, no AI) and
 * Round 2 (manual + AI) of the persona demo walkthrough against the
 * deployed app. Embeds every screenshot inline.
 *
 * Run:
 *   node scripts/build-demo-walkthrough-report.mjs
 *
 * Reads from:
 *   ../frontend/test-results-round1-no-ai/{summary.json,screenshots,ai-outputs}
 *   ../frontend/test-results-round2-with-ai/{summary.json,screenshots,ai-outputs}
 *
 * Writes to:
 *   ../frontend/test-results-round2-with-ai/demo-walkthrough-report-<stamp>.{html,pdf}
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const FE = path.resolve(process.cwd(), "../frontend");
const round1Dir = path.join(FE, "test-results-round1-no-ai");
const round2Dir = path.join(FE, "test-results-round2-with-ai");
const outDir = round2Dir;

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const htmlPath = path.join(outDir, `demo-walkthrough-report-${stamp}.html`);
const pdfPath = path.join(outDir, `demo-walkthrough-report-${stamp}.pdf`);

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const loadRound = (dir) => {
  const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
  const screenshotsDir = path.join(dir, "screenshots");
  const aiDir = path.join(dir, "ai-outputs");
  const screenshots = fs.existsSync(screenshotsDir) ? fs.readdirSync(screenshotsDir) : [];
  const ai = fs.existsSync(aiDir) ? fs.readdirSync(aiDir) : [];
  return { summary, screenshotsDir, aiDir, screenshots, ai };
};

const r1 = loadRound(round1Dir);
const r2 = loadRound(round2Dir);

// Image inlined as data URI so the PDF is self-contained.
const inlineImage = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const b64 = fs.readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${b64}`;
};

const personaSection = (round, label) => {
  const byPersona = new Map();
  round.summary.steps.forEach((s) => {
    if (!byPersona.has(s.persona)) byPersona.set(s.persona, []);
    byPersona.get(s.persona).push(s);
  });
  const blocks = [];
  for (const [persona, steps] of byPersona) {
    const okSteps = steps.filter((s) => s.ok).length;
    blocks.push(`<h3>👤 ${escapeHtml(persona)} <span class="meta">— ${okSteps}/${steps.length} steps OK</span></h3>`);
    blocks.push('<div class="grid">');
    for (const s of steps) {
      const shotPath = s.screenshot ? path.join(round.screenshotsDir, s.screenshot) : null;
      const inlined = shotPath ? inlineImage(shotPath) : null;
      blocks.push(`
        <div class="card">
          <div class="card-meta">
            <span class="badge ${s.ok ? "ok" : "ko"}">${s.ok ? "PASS" : "FAIL"}</span>
            <span class="step-name">${escapeHtml(s.step)}</span>
            <span class="step-path">${escapeHtml(s.path)}</span>
            ${s.bytes ? `<span class="bytes">${(s.bytes / 1024).toFixed(0)}KB</span>` : ""}
          </div>
          ${inlined ? `<img src="${inlined}" alt="${escapeHtml(s.step)}" />` : '<div class="no-shot">no screenshot</div>'}
          ${s.note ? `<div class="note">${escapeHtml(s.note)}</div>` : ""}
        </div>
      `);
    }
    blocks.push("</div>");
  }
  return `<h2>${escapeHtml(label)}</h2>${blocks.join("\n")}`;
};

const aiSection = (round, label) => {
  if (!round.summary.ai || round.summary.ai.length === 0) {
    return `<h2>${escapeHtml(label)}</h2><div class="empty">No AI calls in this round.</div>`;
  }
  const rows = round.summary.ai
    .map((a) => `
      <tr>
        <td><span class="badge ${a.ok ? "ok" : "ko"}">${a.ok ? "PASS" : "FAIL"}</span></td>
        <td><strong>${escapeHtml(a.agent)}</strong></td>
        <td>${escapeHtml(a.persona)}</td>
        <td class="num">${a.status}</td>
        <td class="preview">${escapeHtml(a.preview ?? "-")}</td>
      </tr>
    `)
    .join("");
  return `
    <h2>${escapeHtml(label)}</h2>
    <table class="ai-table">
      <thead><tr><th>Status</th><th>Agent</th><th>Persona</th><th>HTTP</th><th>Preview</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const stat = (round) => {
  const total = round.summary.steps.length;
  const ok = round.summary.steps.filter((s) => s.ok).length;
  const empty = round.summary.steps.filter((s) => s.ok && (s.bytes ?? 0) < 12000).length;
  const aiTotal = round.summary.ai?.length || 0;
  const aiOk = round.summary.ai?.filter((a) => a.ok).length || 0;
  return { total, ok, empty, aiTotal, aiOk };
};

const s1 = stat(r1);
const s2 = stat(r2);

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Hawkeye Demo Walkthrough — Two Rounds (Manual + AI)</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
         font-size: 9.5pt; line-height: 1.4; color: #1a1d23;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 6px 0; }
  .cover { padding: 14px 0 8px; border-bottom: 3px solid #0f766e; margin-bottom: 16px; }
  .cover h1 { margin: 0; font-size: 20pt; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
  .cover .sub { color: #64748b; font-size: 9pt; margin-top: 2px; }
  .summary { display: flex; gap: 8px; margin: 12px 0 18px; }
  .stat { flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; background: #f8fafc; }
  .stat .n { font-size: 16pt; font-weight: 700; line-height: 1; color: #0f172a; }
  .stat .k { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
  .stat.ok .n { color: #047857; }
  .stat.warn .n { color: #b45309; }
  .stat.ko .n { color: #b91c1c; }
  h2 { font-size: 14pt; font-weight: 700; margin: 22px 0 10px; color: #0f172a;
       border-bottom: 3px solid #0f766e; padding-bottom: 4px; }
  h3 { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; color: #0f172a; }
  .meta { color: #64748b; font-size: 8.5pt; font-weight: 400; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .card { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #fff;
          page-break-inside: avoid; }
  .card-meta { padding: 5px 8px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
               font-size: 8pt; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .step-name { font-weight: 600; color: #0f172a; }
  .step-path { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 7.5pt; color: #475569; }
  .bytes { color: #64748b; font-size: 7.5pt; margin-left: auto; }
  .card img { width: 100%; display: block; }
  .no-shot { padding: 32px; text-align: center; color: #94a3b8; font-size: 8.5pt; background: #f1f5f9; }
  .note { padding: 4px 8px; font-size: 7.5pt; color: #b91c1c; background: #fef2f2; border-top: 1px solid #fee2e2; }
  table.ai-table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 8.8pt; }
  table.ai-table th, table.ai-table td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; vertical-align: top; }
  table.ai-table th { background: #f1f5f9; font-weight: 700; }
  table.ai-table td.num { text-align: right; }
  table.ai-table td.preview { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 7.5pt; color: #115e59; }
  .badge { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 7pt;
           font-weight: 700; letter-spacing: 0.04em; }
  .badge.ok { background: #d1fae5; color: #047857; }
  .badge.ko { background: #fee2e2; color: #b91c1c; }
  .scope { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px;
           padding: 8px 12px; margin: 8px 0 16px; font-size: 9pt; color: #115e59; }
  .empty { color: #94a3b8; padding: 12px; font-style: italic; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #cbd5e1;
            color: #94a3b8; font-size: 8pt; text-align: center; }
</style>
</head><body><div class="wrap">

<div class="cover">
  <h1>Hawkeye Demo Walkthrough — Two Rounds</h1>
  <div class="sub">Round 1: manual (no AI) · Round 2: manual + AI agents · against deployed prod · ${new Date().toLocaleString()}</div>
</div>

<div class="scope">
  <strong>What this exercises.</strong> Real Playwright session against the
  deployed app at <code>hawkeye-frontend-dev-chi.vercel.app</code>, signing in
  as each of the 10 demo personas via cookie injection (validated against the
  prod backend's <code>/api/auth/login</code>) and visiting every page named
  in the demo script. Each step waits for <code>networkidle</code> + a content
  selector + 1.5s settle before screenshotting, so empty pages are detected
  (size &lt; 12KB).
  <br/><strong>Round 1</strong> = UI walk only.
  <strong>Round 2</strong> = UI walk + 4 live AI-agent calls
  (<code>supplier-intel</code>, <code>risk.brainstorm</code>,
  <code>aggregator</code>, <code>admin.ai.roi</code>).
</div>

<div class="summary">
  <div class="stat ok"><div class="n">${s1.ok}/${s1.total}</div><div class="k">Round 1 UI</div></div>
  <div class="stat ${s1.empty > 0 ? "warn" : "ok"}"><div class="n">${s1.empty}</div><div class="k">R1 Empty</div></div>
  <div class="stat ok"><div class="n">${s2.ok}/${s2.total}</div><div class="k">Round 2 UI</div></div>
  <div class="stat ${s2.empty > 0 ? "warn" : "ok"}"><div class="n">${s2.empty}</div><div class="k">R2 Empty</div></div>
  <div class="stat ${s2.aiOk < s2.aiTotal ? "warn" : "ok"}"><div class="n">${s2.aiOk}/${s2.aiTotal}</div><div class="k">AI Agents</div></div>
</div>

${personaSection(r1, "Round 1 — Manual UI walk (no AI)")}
${aiSection(r1, "Round 1 — AI calls")}

${personaSection(r2, "Round 2 — Manual UI walk + AI agent capture")}
${aiSection(r2, "Round 2 — AI calls")}

<div class="footer">
  Hawkeye &middot; Demo walkthrough end-to-end report &middot; ${new Date().toISOString().slice(0, 10)}
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
  margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
});
await browser.close();

const sz = fs.statSync(pdfPath).size;
console.log(`PDF: ${(sz / 1024).toFixed(0)}KB`);
console.log(`Path: ${pdfPath}`);
