/**
 * Render a go-to-market markdown doc to HTML + PDF.
 *
 * Usage:
 *   node scripts/build-gtm-doc.mjs 01-vision-positioning      # one doc
 *   node scripts/build-gtm-doc.mjs all                         # all docs in 06-go-to-market/
 *
 * Reads docs/06-go-to-market/<key>.md and writes <key>.html + <key>.pdf
 * next to it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const dir = path.join(repo, "docs", "06-go-to-market");

const arg = process.argv[2] || "all";

const TEMPLATE = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
html,body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
       font-size: 10.5pt; line-height: 1.45; color: #1a1d23;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wrap { max-width: 760px; margin: 0 auto; padding: 8px 0; }
h1 { font-size: 22pt; font-weight: 700; margin: 0 0 6px; color: #0f172a; letter-spacing: -0.02em; page-break-after: avoid; }
h2 { font-size: 14pt; font-weight: 700; margin: 22px 0 8px; color: #0f172a;
     border-bottom: 2px solid #0f766e; padding-bottom: 4px; page-break-after: avoid; }
h3 { font-size: 11.5pt; font-weight: 700; margin: 14px 0 4px; color: #0f172a; page-break-after: avoid; }
h4 { font-size: 10.5pt; font-weight: 700; margin: 10px 0 3px; color: #334155; }
p { margin: 4px 0 8px; }
ul, ol { margin: 4px 0 8px; padding-left: 20px; }
li { margin: 2px 0; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.2pt;
       background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 6px;
      font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.6pt; line-height: 1.45;
      overflow-x: auto; margin: 8px 0; page-break-inside: avoid; }
pre code { background: transparent; color: inherit; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 9.5pt;
        page-break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
tr:nth-child(even) td { background: #fafbfc; }
blockquote { border-left: 3px solid #0f766e; margin: 8px 0; padding: 6px 12px;
             background: #f0fdfa; color: #115e59; font-style: italic; }
a { color: #0f766e; text-decoration: none; }
hr { border: none; border-top: 1px solid #cbd5e1; margin: 18px 0; }
.cover { padding: 18px 0 8px; border-bottom: 3px solid #0f766e; margin-bottom: 18px; }
.cover h1 { margin: 0; }
.cover .meta { color: #64748b; font-size: 9.5pt; margin-top: 4px; }
.footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #cbd5e1;
          color: #94a3b8; font-size: 8.5pt; text-align: center; }
strong { color: #0f172a; font-weight: 700; }
.wrap > h1:first-child { display: none; } /* cover renders the title */
</style></head><body><div class="wrap">
<div class="cover"><h1>${escapeHtml(title)}</h1><div class="meta">Hawkeye Go-To-Market Pack &middot; ${new Date().toISOString().slice(0, 10)}</div></div>
${body}
<div class="footer">Hawkeye &middot; Confidential &middot; ${new Date().toISOString().slice(0, 10)}</div>
</div></body></html>`;

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "Hawkeye";
}

async function buildOne(key) {
  const mdPath = path.join(dir, `${key}.md`);
  if (!fs.existsSync(mdPath)) {
    console.error(`SKIP: ${mdPath} not found`);
    return;
  }
  const md = fs.readFileSync(mdPath, "utf8");
  const title = extractTitle(md).replace(/^Hawkeye\s*[—–-]\s*/, "");
  const body = marked.parse(md, { gfm: true, breaks: false });
  const html = TEMPLATE(title, body);

  const htmlPath = path.join(dir, `${key}.html`);
  const pdfPath = path.join(dir, `${key}.pdf`);
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true,
                   margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" } });
  await browser.close();
  const sz = fs.statSync(pdfPath).size;
  console.log(`wrote ${path.basename(htmlPath)} + ${path.basename(pdfPath)} (${sz} bytes)`);
}

const targets = arg === "all"
  ? fs.readdirSync(dir)
      .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
      .map((f) => f.replace(/\.md$/, ""))
  : [arg];

for (const t of targets) await buildOne(t);
