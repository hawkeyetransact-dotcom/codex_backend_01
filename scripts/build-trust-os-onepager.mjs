/**
 * Hawkeye — Trust Platform OS · one-pager.
 *
 * Captures the bigger thesis the founder articulated:
 *   - origin: audit + cross-company workflow
 *   - evolution: SaaS to digitise any business process (data collection +
 *     processing + visualisation + immutable trail)
 *   - vertical journey: API pharma → EQMS for all sectors → multi
 *     supply-chain (regulated + non-regulated)
 *   - goal: AI-assisted collection/processing + blockchain-enabled
 *     registration → Trust Platform OS that enables P2P / B2B / C2C / B2C
 *     transactions without intermediaries because every step is tracked
 *   - business model: SaaS → Marketplace
 *
 * Output:
 *   docs/01-pitch/hawkeye-trust-os-onepager.html
 *   docs/01-pitch/hawkeye-trust-os-onepager.pdf
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const outDir = path.join(repo, "docs/01-pitch");
fs.mkdirSync(outDir, { recursive: true });
const outHtml = path.join(outDir, "hawkeye-trust-os-onepager.html");
const outPdf  = path.join(outDir, "hawkeye-trust-os-onepager.pdf");

const TODAY = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye — Trust Platform OS · One-pager</title>
<style>
:root {
  --ink:#0f172a; --muted:#64748b; --line:#e2e8f0;
  --b1:#1e40af; --b2:#7c3aed; --b3:#0891b2; --b4:#059669;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); }

.page {
  width:8.5in; height:11in; padding:0.5in 0.55in;
  display:flex; flex-direction:column; gap:18px;
  background:#fff;
}

/* ───────────── Hero ───────────── */
.hero { text-align:center; }
.hero .brand {
  font-size:11px; letter-spacing:0.25em; color:var(--b1); font-weight:800; text-transform:uppercase;
}
.hero h1 {
  font-size:38px; font-weight:800; line-height:1.05; margin:6px 0 8px 0;
}
.hero h1 .underline {
  background:linear-gradient(180deg, transparent 60%, #fde68a 60%);
  padding:0 4px;
}
.hero .tagline {
  font-size:14px; color:var(--muted); font-weight:500;
}

/* ───────────── Journey arc ───────────── */
.journey { display:grid; grid-template-columns: repeat(4, 1fr); gap:0; align-items:start; position:relative; }
.journey::before {
  content:""; position:absolute; top:24px; left:6%; right:6%; height:3px;
  background:linear-gradient(90deg, var(--b1), var(--b2), var(--b3), var(--b4));
  border-radius:2px;
}
.j-stage { text-align:center; padding:0 4px; position:relative; }
.j-stage .icon {
  width:50px; height:50px; border-radius:50%; margin:0 auto 8px auto;
  display:flex; align-items:center; justify-content:center;
  font-size:24px; color:#fff; font-weight:800;
  border:4px solid #fff; box-shadow:0 0 0 1px var(--line);
  position:relative; z-index:1;
}
.j-stage:nth-child(1) .icon { background:var(--b1); }
.j-stage:nth-child(2) .icon { background:var(--b2); }
.j-stage:nth-child(3) .icon { background:var(--b3); }
.j-stage:nth-child(4) .icon { background:var(--b4); }
.j-stage .yr {
  font-size:10px; color:var(--muted); font-weight:700; letter-spacing:0.05em;
}
.j-stage .lbl { font-size:13px; font-weight:700; margin-top:2px; }

/* ───────────── Stack diagram ───────────── */
.stack { display:flex; flex-direction:column; gap:4px; }
.layer {
  display:grid; grid-template-columns: 130px 1fr 1fr; gap:14px;
  padding:12px 16px; border-radius:10px; align-items:center;
  border:1px solid var(--line); background:#fff;
}
.layer .lname { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:#fff;
  background:var(--b1); padding:5px 10px; border-radius:6px; text-align:center; }
.layer .ldesc { font-size:13px; font-weight:600; color:var(--ink); }
.layer .litems { font-size:11px; color:var(--muted); }
.layer.l-mkt { background:linear-gradient(90deg, #ecfeff 0%, #fff 100%); border-color:#a5f3fc; }
.layer.l-mkt .lname { background:var(--b3); }
.layer.l-trust .lname { background:var(--b4); }
.layer.l-ai    .lname { background:var(--b2); }
.layer.l-flow  .lname { background:var(--b1); }
.layer .badge-live, .layer .badge-soon {
  display:inline-block; font-size:9px; font-weight:800; padding:2px 6px; border-radius:3px; margin-left:6px;
  vertical-align:middle;
}
.badge-live { background:#dcfce7; color:#166534; border:1px solid #86efac; }
.badge-soon { background:#fef3c7; color:#92400e; border:1px solid #fcd34d; }

/* ───────────── Big stats ───────────── */
.bigstats { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
.bigstat {
  border:1px solid var(--line); border-radius:10px; padding:12px;
  text-align:center; background:#fff;
}
.bigstat .n { font-size:30px; font-weight:800; color:var(--b1); line-height:1; }
.bigstat .l { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; margin-top:6px; }

/* ───────────── Tag clouds ───────────── */
.tags-grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
.tags-card { border:1px solid var(--line); border-radius:10px; padding:11px 13px; background:#fff; }
.tags-card .h {
  font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; font-weight:800;
  margin-bottom:6px;
}
.tag-row { display:flex; flex-wrap:wrap; gap:4px; }
.tag {
  font-size:10px; font-weight:600; padding:3px 8px; border-radius:11px;
  background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;
}
.tag.r { background:#fef2f2; color:#991b1b; border-color:#fecaca; }
.tag.u { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
.tag.t { background:#faf5ff; color:#6b21a8; border-color:#d8b4fe; }

/* ───────────── Business model arrow ───────────── */
.model {
  display:grid; grid-template-columns: 1fr 40px 1fr; gap:0; align-items:center;
  border:1px solid var(--line); border-radius:10px; padding:12px 16px; background:#fff;
}
.model .stage {
  text-align:center;
}
.model .stage .stage-h {
  font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; font-weight:700;
  margin-bottom:4px;
}
.model .stage .stage-name { font-size:16px; font-weight:800; color:var(--b1); }
.model .stage .stage-sub  { font-size:10.5px; color:var(--muted); margin-top:2px; }
.model .stage.future .stage-name { color:var(--b3); }
.model .arrow {
  text-align:center; font-size:24px; color:var(--b2); font-weight:800;
}

/* ───────────── Big closing quote ───────────── */
.thesis {
  text-align:center; font-size:14px; font-weight:700; color:var(--ink);
  padding:14px 30px;
  border-top:2px solid var(--line);
  border-bottom:2px solid var(--line);
  background:linear-gradient(90deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%);
  border-radius:8px;
  font-style:italic;
}
.thesis em { color:var(--b1); font-style:normal; }

.foot { margin-top:auto; display:flex; justify-content:space-between; font-size:9px; color:var(--muted); padding-top:8px; }

@page { size: Letter; margin: 0; }
@media print { body { background:#fff; } }
</style>
</head><body>

<section class="page">

  <!-- HERO -->
  <div class="hero">
    <div class="brand">Hawkeye · The Trust Platform OS</div>
    <h1>Run any process.<br/>Trace every step. <span class="underline">Replace the middleman.</span></h1>
    <div class="tagline">SaaS for digitising work today · marketplace for trusted transactions tomorrow</div>
  </div>

  <!-- JOURNEY -->
  <div class="journey">
    <div class="j-stage">
      <div class="icon">⚖</div>
      <div class="yr">2023</div>
      <div class="lbl">Audit workflow</div>
    </div>
    <div class="j-stage">
      <div class="icon">⚗</div>
      <div class="yr">2024</div>
      <div class="lbl">Pharma + EQMS</div>
    </div>
    <div class="j-stage">
      <div class="icon">⌬</div>
      <div class="yr">2025</div>
      <div class="lbl">Multi-vertical</div>
    </div>
    <div class="j-stage">
      <div class="icon">⌘</div>
      <div class="yr">2026</div>
      <div class="lbl">Trust marketplace</div>
    </div>
  </div>

  <!-- STACK DIAGRAM -->
  <div class="stack">
    <div class="layer l-mkt">
      <div class="lname">Marketplace</div>
      <div class="ldesc">Direct transactions <span class="badge-soon">ROADMAP</span></div>
      <div class="litems">P2P · B2B · B2C · C2C · provenance · cert issuance</div>
    </div>
    <div class="layer l-trust">
      <div class="lname">Trust</div>
      <div class="ldesc">Verifiable record <span class="badge-live">LIVE</span></div>
      <div class="litems">21 CFR Part 11 e-sig · SHA-256 hashes · ALCOA+ trail · blockchain anchoring next</div>
    </div>
    <div class="layer l-ai">
      <div class="lname">AI</div>
      <div class="ldesc">Intelligence <span class="badge-live">LIVE</span></div>
      <div class="litems">31 agents · public data fusion (FDA · EMA · WHO) · pluggable LLM · grounded generation</div>
    </div>
    <div class="layer l-flow">
      <div class="lname">Workflow</div>
      <div class="ldesc">Process digitisation <span class="badge-live">LIVE</span></div>
      <div class="litems">14 EQMS modules · 92 routes · 165 data models · multi-tenant SaaS</div>
    </div>
  </div>

  <!-- BIG STATS -->
  <div class="bigstats">
    <div class="bigstat"><div class="n">14</div><div class="l">EQMS modules</div></div>
    <div class="bigstat"><div class="n">31</div><div class="l">AI agents</div></div>
    <div class="bigstat"><div class="n">5</div><div class="l">public data feeds</div></div>
    <div class="bigstat"><div class="n">58/0</div><div class="l">lifecycle pass / fail</div></div>
  </div>

  <!-- BUSINESS MODEL -->
  <div class="model">
    <div class="stage">
      <div class="stage-h">Today</div>
      <div class="stage-name">SaaS subscription</div>
      <div class="stage-sub">$24-180k ACV · 80%+ gross margin</div>
    </div>
    <div class="arrow">→</div>
    <div class="stage future">
      <div class="stage-h">Next</div>
      <div class="stage-name">Marketplace + take-rate</div>
      <div class="stage-sub">8-12% on transactions · audit RFQ live, more to come</div>
    </div>
  </div>

  <!-- TAG CLOUDS -->
  <div class="tags-grid">
    <div class="tags-card">
      <div class="h">Verticals · same engine</div>
      <div class="tag-row">
        <span class="tag r">Pharma</span>
        <span class="tag r">Med device</span>
        <span class="tag r">Food</span>
        <span class="tag r">Auto</span>
        <span class="tag r">Aerospace</span>
        <span class="tag r">Cosmetics</span>
        <span class="tag u">ESG</span>
        <span class="tag u">Pro services</span>
        <span class="tag u">Construction</span>
        <span class="tag u">Logistics</span>
        <span class="tag u">Education</span>
      </div>
    </div>
    <div class="tags-card">
      <div class="h">Transactions enabled</div>
      <div class="tag-row">
        <span class="tag t">B2B</span>
        <span class="tag t">B2C</span>
        <span class="tag t">P2P</span>
        <span class="tag t">C2C</span>
        <span class="tag t">Audit RFQ</span>
        <span class="tag t">Cert issuance</span>
        <span class="tag t">Provenance</span>
        <span class="tag t">Compliance attest.</span>
      </div>
    </div>
  </div>

  <!-- BIG QUOTE -->
  <div class="thesis">
    "Verifiable workflow + AI data + immutable trail = <em>no middleman needed.</em><br/>
    EQMS is the first wedge — every regulated supply chain is the market."
  </div>

  <div class="foot">
    <div>Hawkeye Inc. · Confidential · ${TODAY}</div>
    <div>hawkeyetransact@gmail.com</div>
  </div>

</section>

</body></html>`;

fs.writeFileSync(outHtml, html);
const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
await page.goto(pathToFileURL(outHtml).href, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: outPdf,
  format: "Letter",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true,
});
await browser.close();
console.log("wrote", outHtml);
console.log("wrote", outPdf, fs.statSync(outPdf).size, "bytes");
