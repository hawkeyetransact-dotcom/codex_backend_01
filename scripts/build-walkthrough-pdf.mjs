/**
 * Assemble walkthrough screenshots + captions into a single tabbed PDF.
 *
 * Output: backend/docs/09-test-reports/walkthrough-report.pdf (+ .html)
 *
 * Run:
 *   node scripts/build-walkthrough-pdf.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const SHOTS = join(ROOT, "..", "frontend", "demo-artifacts", "walkthrough");
const OUT_HTML = join(ROOT, "docs", "09-test-reports", "walkthrough-report.html");
const OUT_PDF = join(ROOT, "docs", "09-test-reports", "walkthrough-report.pdf");

if (!existsSync(SHOTS)) { console.error(`Screenshots dir not found: ${SHOTS}`); process.exit(1); }

const cap = JSON.parse(readFileSync(join(SHOTS, "walkthrough.json"), "utf8"));
const captures = cap.captures.filter((c) => c.outcome === "captured");

// Group by persona
const byPersona = new Map();
for (const c of captures) {
  if (!byPersona.has(c.persona)) byPersona.set(c.persona, []);
  byPersona.get(c.persona).push(c);
}

const PERSONA_ORDER = ["Kenji", "Priya", "Maria", "James", "Marcus", "Elena"];
const PERSONA_META = {
  Kenji:  { role: "QA Specialist", email: "qa.specialist@novex-pharma.demo", color: "#059669" },
  Priya:  { role: "Audit Program Manager", email: "audit.program@novex-pharma.demo", color: "#2563eb" },
  Maria:  { role: "Lead Auditor", email: "audit.lead@novex-pharma.demo", color: "#7c3aed" },
  James:  { role: "Head of QA", email: "qa.head@novex-pharma.demo", color: "#dc2626" },
  Marcus: { role: "Regulatory Affairs", email: "regulatory@novex-pharma.demo", color: "#f59e0b" },
  Elena:  { role: "VP of Quality", email: "vp.quality@novex-pharma.demo", color: "#4c1d95" },
};

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function imgToDataUrl(file) {
  const p = join(SHOTS, file);
  if (!existsSync(p)) return null;
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
}

const CSS = `
  :root { --bg:#f8fafc; --ink:#0f172a; --dim:#64748b; --border:#e2e8f0; --purple:#7c3aed; }
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.55;color:var(--ink);background:var(--bg);margin:0;padding:0}
  .page{max-width:1200px;margin:0 auto;padding:24px}
  .cover{background:linear-gradient(135deg,#1e3a8a,#7c3aed);color:#fff;padding:48px 36px;border-radius:12px;margin-bottom:24px}
  .cover h1{margin:0;font-size:32px;letter-spacing:-0.02em}
  .cover p{margin:6px 0;font-size:14px;opacity:.95}
  .cover .meta{margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;font-size:11px}
  .cover .meta span{background:rgba(255,255,255,.18);padding:5px 12px;border-radius:6px}

  h2{font-size:22px;margin:30px 0 14px;padding-bottom:8px;border-bottom:3px solid var(--purple)}
  h3{font-size:15px;margin:16px 0 6px}

  .persona-hdr{background:var(--card,#fff);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:14px;border-left:5px solid var(--purple)}
  .persona-hdr h2{margin:0;font-size:18px;color:var(--ink);border:none;padding:0}
  .persona-hdr .sub{color:var(--dim);font-size:12px;margin-top:3px}
  .persona-hdr .email{font-family:Menlo,Consolas,monospace;font-size:11px;background:#f1f5f9;padding:2px 8px;border-radius:4px;display:inline-block;margin-top:4px}

  .step{background:#fff;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:14px;page-break-inside:avoid}
  .step .idx{background:var(--purple);color:#fff;padding:3px 10px;border-radius:12px;font-weight:700;font-size:11px;display:inline-block;margin-right:8px}
  .step .kind{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:6px}
  .step .kind.ui{background:#dbeafe;color:#1e40af}
  .step .kind.ai{background:#ede9fe;color:#5b21b6}
  .step h3{margin:0;display:inline-block;font-size:14px}
  .step .desc{color:var(--dim);font-size:12px;margin:6px 0 10px}
  .step img{width:100%;max-width:100%;border:1px solid var(--border);border-radius:6px;display:block}

  .toc{background:#fff;border:1px solid var(--border);border-radius:8px;padding:14px 18px;margin-bottom:24px}
  .toc ul{margin:6px 0;padding-left:20px}
  .toc li{margin:3px 0;font-size:12px}

  @media print{
    @page{size:A4 portrait;margin:10mm}
    body{background:#fff}
    .page{padding:0;max-width:100%}
    .cover{page-break-after:always}
    .persona-hdr{page-break-before:always}
    .step{page-break-inside:avoid}
  }
`;

let body = "";
body += `
<section class="cover">
  <h1>Novex Pharma · EQMS Walkthrough</h1>
  <p>Persona-driven UI walkthrough + AI agent outputs</p>
  <p style="opacity:.85;font-size:12px">Tenant: Novex Pharma · Backend: local (demo data seeded) · Frontend: Vercel live · Captures: ${captures.length}</p>
  <div class="meta">
    <span>Personas: ${PERSONA_ORDER.filter((p) => byPersona.has(p)).length}</span>
    <span>UI screenshots: ${captures.filter((c) => c.kind !== "ai-output").length}</span>
    <span>AI agent outputs: ${captures.filter((c) => c.kind === "ai-output").length}</span>
    <span>Generated: ${new Date().toISOString().slice(0,10)}</span>
  </div>
</section>
`;

body += `<div class="toc"><h3>Contents</h3><ul>`;
for (const p of PERSONA_ORDER) {
  if (!byPersona.has(p)) continue;
  const meta = PERSONA_META[p];
  body += `<li><b>${p}</b> · ${meta.role} · ${byPersona.get(p).length} screenshots</li>`;
}
body += `</ul></div>`;

for (const p of PERSONA_ORDER) {
  if (!byPersona.has(p)) continue;
  const meta = PERSONA_META[p];
  body += `
    <section class="persona-hdr" style="border-left-color:${meta.color}">
      <h2 style="color:${meta.color}">${esc(p)}</h2>
      <div class="sub">${esc(meta.role)}</div>
      <span class="email">${esc(meta.email)}</span>
    </section>
  `;
  for (const c of byPersona.get(p)) {
    const img = imgToDataUrl(c.file);
    const kind = c.kind === "ai-output" ? "ai" : "ui";
    body += `
      <div class="step">
        <div><span class="idx">#${esc(c.id)}</span><h3>${esc(c.title)}</h3><span class="kind ${kind}">${kind === "ai" ? "AI output" : "UI screenshot"}</span></div>
        <p class="desc">${esc(c.description)}</p>
        ${img ? `<img src="${img}" alt="${esc(c.title)}" />` : `<p><em>image missing</em></p>`}
      </div>
    `;
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Novex Walkthrough Report</title><style>${CSS}</style></head><body><div class="page">${body}</div></body></html>`;

mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, html);
console.log(`  ✓ HTML: ${OUT_HTML} (${Math.round(html.length / 1024)} KB)`);

console.log(`  rendering PDF...`);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file:///${OUT_HTML.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.pdf({ path: OUT_PDF, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" } });
await browser.close();
console.log(`  ✓ PDF: ${OUT_PDF}`);
