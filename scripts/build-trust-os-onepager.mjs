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
  --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --soft:#f8fafc;
  --brand:#1e40af; --brand2:#7c3aed; --accent:#0891b2;
  --ok:#059669; --warn:#d97706;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); line-height:1.4; font-size:11px; }

.page {
  width:8.5in; height:11in; padding:0.4in 0.5in;
  display:flex; flex-direction:column; gap:10px;
  background:#fff; position:relative;
}

/* ─── Hero ─── */
.hero {
  background:linear-gradient(135deg, #1e40af 0%, #7c3aed 50%, #0891b2 100%);
  color:#fff; padding:18px 22px; border-radius:12px;
}
.hero .brandline { font-size:11px; letter-spacing:0.15em; opacity:0.85; text-transform:uppercase; font-weight:600; margin-bottom:6px; }
.hero h1 { font-size:26px; font-weight:800; line-height:1.1; margin-bottom:4px; }
.hero h1 .accent { color:#fde68a; }
.hero .sub { font-size:12.5px; opacity:0.95; margin-top:6px; }

/* ─── Section headers ─── */
.section-h {
  display:flex; align-items:center; gap:8px;
  font-size:10.5px; font-weight:800; color:var(--brand);
  text-transform:uppercase; letter-spacing:0.08em;
  margin-bottom:5px;
}
.section-h::before {
  content:""; display:inline-block; width:18px; height:2px; background:var(--brand);
}

/* ─── Journey arc ─── */
.journey {
  background:#fff; border:1px solid var(--line); border-radius:10px; padding:12px 14px;
}
.journey-timeline { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-top:6px; position:relative; }
.journey-arrow {
  position:absolute; top:14px; left:8%; right:8%; height:2px;
  background:linear-gradient(90deg, #1e40af, #7c3aed, #0891b2, #059669);
  z-index:0;
}
.journey-stage { position:relative; z-index:1; padding:0 4px; }
.journey-stage .dot {
  width:28px; height:28px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:800; color:#fff; margin:0 auto 6px auto;
  border:3px solid #fff; box-shadow:0 0 0 1px var(--line);
}
.s1 .dot { background:var(--brand); }
.s2 .dot { background:var(--brand2); }
.s3 .dot { background:var(--accent); }
.s4 .dot { background:var(--ok); }
.journey-stage .when { font-size:9.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; font-weight:700; text-align:center; margin-bottom:2px; }
.journey-stage h4 { font-size:11px; font-weight:700; text-align:center; margin-bottom:3px; color:var(--ink); }
.journey-stage p { font-size:10px; color:#374151; text-align:center; line-height:1.3; }

/* ─── Three pillars (built today) ─── */
.pillars { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
.pillar {
  background:#fff; border:1px solid var(--line); border-radius:10px; padding:11px 13px;
  border-top:3px solid var(--brand);
}
.pillar.p2 { border-top-color:var(--brand2); }
.pillar.p3 { border-top-color:var(--accent); }
.pillar h4 { font-size:12px; font-weight:700; color:var(--ink); margin-bottom:5px; }
.pillar h4 .tag { font-size:9.5px; color:var(--muted); font-weight:600; }
.pillar ul { list-style:none; font-size:10.5px; }
.pillar li { padding:2px 0 2px 12px; position:relative; color:#374151; }
.pillar li::before {
  content:"→"; position:absolute; left:0; top:2px; color:var(--brand); font-weight:700; font-size:11px;
}
.pillar.p2 li::before { color:var(--brand2); }
.pillar.p3 li::before { color:var(--accent); }

/* ─── Trust OS / marketplace ─── */
.trust-band {
  background:linear-gradient(90deg, #f0f9ff 0%, #faf5ff 50%, #ecfdf5 100%);
  border:1px solid var(--line); border-radius:10px; padding:11px 14px;
  display:grid; grid-template-columns: 1fr 1fr; gap:14px;
}
.trust-col h4 { font-size:11.5px; font-weight:700; color:var(--brand); margin-bottom:4px; }
.trust-col p { font-size:10.5px; color:#374151; }

/* ─── Verticals + transaction types strip ─── */
.expand-strip { display:grid; grid-template-columns: 1.4fr 1fr; gap:10px; }
.expand-card {
  background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px 12px;
}
.expand-card h4 { font-size:10.5px; font-weight:700; color:var(--brand); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
.tag-row { display:flex; flex-wrap:wrap; gap:4px; }
.tag {
  font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:11px;
  background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;
}
.tag.regulated   { background:#fef2f2; color:#991b1b; border-color:#fecaca; }
.tag.unregulated { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
.tag.txn         { background:#faf5ff; color:#6b21a8; border-color:#d8b4fe; }

/* ─── Stats strip ─── */
.stats { display:grid; grid-template-columns: repeat(5, 1fr); gap:6px; }
.stat {
  background:#fff; border:1px solid var(--line); border-radius:8px; padding:7px;
  text-align:center;
}
.stat .num { font-size:18px; font-weight:800; color:var(--brand); }
.stat .lbl { font-size:8.5px; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; line-height:1.2; }

/* ─── Why this matters ─── */
.thesis {
  background:#fffbeb; border-left:3px solid #f59e0b; border-radius:0 8px 8px 0;
  padding:10px 14px; font-size:11px; color:#1e293b;
}
.thesis strong { color:#78350f; }

.foot {
  display:flex; justify-content:space-between; font-size:9px; color:var(--muted);
  border-top:1px solid var(--line); padding-top:6px; margin-top:auto;
}

@page { size: Letter; margin: 0; }
@media print { body { background:#fff; } }
</style>
</head><body>

<section class="page">

  <!-- Hero -->
  <div class="hero">
    <div class="brandline">Hawkeye · The Trust Platform OS</div>
    <h1>Run any business process. <span class="accent">Make every step verifiable.</span> Move from SaaS to a trust marketplace.</h1>
    <div class="sub">
      A platform OS for digitising business processes — AI-assisted data collection · automated processing · visualisation + analytics ·
      <strong>immutable record trail</strong>. The same plumbing that runs a regulated pharma audit also runs a P2P / B2B / C2C / B2C transaction
      <em>without intermediaries</em> — because every step is signed, timestamped and verifiable.
    </div>
  </div>

  <!-- Journey -->
  <div>
    <div class="section-h">Journey · how we got here</div>
    <div class="journey">
      <div class="journey-timeline">
        <div class="journey-arrow"></div>
        <div class="journey-stage s1">
          <div class="dot">1</div>
          <div class="when">2023 · Origin</div>
          <h4>Cross-company audit workflow</h4>
          <p>Started as a 2-sided audit platform: buyer + supplier + auditor on one record, with a shared event log.</p>
        </div>
        <div class="journey-stage s2">
          <div class="dot">2</div>
          <div class="when">2024 · Vertical depth</div>
          <h4>API pharma → full EQMS</h4>
          <p>Followed market demand into pharma manufacturing, then expanded to all 14 EQMS modules covering every regulated quality function.</p>
        </div>
        <div class="journey-stage s3">
          <div class="dot">3</div>
          <div class="when">2025 · Breadth</div>
          <h4>Multi-vertical supply chains</h4>
          <p>Same workflow + data + AI engine applied to food, ESG, automotive, professional services — regulated and non-regulated alike.</p>
        </div>
        <div class="journey-stage s4">
          <div class="dot">4</div>
          <div class="when">2026 · Trust OS</div>
          <h4>Marketplace + disintermediation</h4>
          <p>AI-assisted data + blockchain-anchored records turn the SaaS into a trust marketplace where parties transact directly.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Three pillars · what's built -->
  <div>
    <div class="section-h">What's built today (live · multi-tenant SaaS)</div>
    <div class="pillars">
      <div class="pillar">
        <h4>Workflow + Data <span class="tag">SaaS layer</span></h4>
        <ul>
          <li>Universal workflow engine (definitions · milestones · SLAs)</li>
          <li>165 data models · 92 backend routes · multi-tenant Atlas</li>
          <li>14 EQMS modules + supplier + audit + RFQ marketplace shipped</li>
          <li>Per-tenant module flags + 7 normalised user roles</li>
          <li>S3 storage · DigiLocker integration · notification policies</li>
        </ul>
      </div>
      <div class="pillar p2">
        <h4>AI + Automation <span class="tag">Intelligence layer</span></h4>
        <ul>
          <li>31 AI agents wired across deviation · CAPA · audit · supplier · MRM</li>
          <li>Public-data fusion: openFDA · EMA · WHO PQ · FDA Warning Letters</li>
          <li>Pluggable LLM (free Gemini default · OpenAI · on-prem option)</li>
          <li>Grounded generation runtime: citation gate · confidence floor · accept/reject audit log</li>
          <li>FDA Jan-2025 AI guidance compliant from day one</li>
        </ul>
      </div>
      <div class="pillar p3">
        <h4>Trust + Marketplace <span class="tag">Network layer</span></h4>
        <ul>
          <li>21 CFR Part 11 e-signature service (PASSWORD · MFA · SSO · cert)</li>
          <li>SHA-256 content hashes on audit reports + closures</li>
          <li>2-sided audit RFQ marketplace (buyer ↔ auditor org) live today</li>
          <li>ALCOA+ audit trail on every state transition + every AI decision</li>
          <li>Roadmap: Sigstore / blockchain anchoring of integrity hashes</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Trust OS thesis -->
  <div>
    <div class="section-h">The thesis · why this becomes a marketplace OS</div>
    <div class="trust-band">
      <div class="trust-col">
        <h4>Trust replaces the intermediary</h4>
        <p>When every workflow step — data captured, document signed, decision made, AI accepted — is signed, timestamped and content-hashed,
        the parties no longer need a broker / aggregator / registrar to vouch for the transaction. The record itself is the trust.</p>
      </div>
      <div class="trust-col">
        <h4>SaaS → Marketplace evolution</h4>
        <p>Phase 1 (today): tenants pay SaaS to digitise their internal processes. Phase 2 (in flight): tenants discover counterparties on the
        platform (auditor RFQ marketplace already live). Phase 3 (roadmap): direct B2B / B2C / P2P / C2C transactions settle on Hawkeye because the
        full chain of evidence is portable + verifiable.</p>
      </div>
    </div>
  </div>

  <!-- Verticals + transaction types -->
  <div class="expand-strip">
    <div class="expand-card">
      <h4>Verticals expansion (same engine)</h4>
      <div class="tag-row">
        <span class="tag regulated">Pharma · API + EQMS</span>
        <span class="tag regulated">Medical device</span>
        <span class="tag regulated">Food · FSMA / HACCP</span>
        <span class="tag regulated">Automotive · IATF</span>
        <span class="tag regulated">Aerospace · AS9100</span>
        <span class="tag regulated">Cosmetics</span>
        <span class="tag unregulated">ESG · Scope 1-3</span>
        <span class="tag unregulated">Professional services</span>
        <span class="tag unregulated">Construction QA</span>
        <span class="tag unregulated">Education credentialing</span>
        <span class="tag unregulated">Logistics · CoC</span>
      </div>
    </div>
    <div class="expand-card">
      <h4>Transactions enabled · no intermediary</h4>
      <div class="tag-row">
        <span class="tag txn">B2B · supplier ↔ buyer</span>
        <span class="tag txn">B2C · brand ↔ customer</span>
        <span class="tag txn">P2P · auditor ↔ auditor</span>
        <span class="tag txn">C2C · creator ↔ buyer</span>
        <span class="tag txn">Audit RFQ · live</span>
        <span class="tag txn">Cert. issuance</span>
        <span class="tag txn">Provenance claim</span>
        <span class="tag txn">Compliance attest.</span>
      </div>
    </div>
  </div>

  <!-- Stats strip -->
  <div>
    <div class="section-h">By the numbers (live SaaS today)</div>
    <div class="stats">
      <div class="stat"><div class="num">14</div><div class="lbl">EQMS modules live</div></div>
      <div class="stat"><div class="num">31</div><div class="lbl">AI agents in production</div></div>
      <div class="stat"><div class="num">105</div><div class="lbl">features documented click-by-click</div></div>
      <div class="stat"><div class="num">5</div><div class="lbl">public-data sources fused</div></div>
      <div class="stat"><div class="num">58 / 0</div><div class="lbl">lifecycle PASS / FAIL on live</div></div>
    </div>
  </div>

  <!-- Why this matters -->
  <div class="thesis">
    <strong>Why this matters.</strong> Every regulated industry today depends on intermediaries — auditors, registrars, certifiers, exchanges —
    because data isn't natively trustworthy. Hawkeye's bet is that <strong>verifiable workflow + AI-assisted data + immutable record</strong>
    collapses the need for those middlemen across <em>any</em> vertical, regulated or not. Land as SaaS for the workflow; expand to a marketplace
    for the transactions; capture both the seat fee and the take-rate. EQMS + audit is just the first wedge.
  </div>

  <div class="foot">
    <div>Hawkeye Inc. · Confidential one-pager · ${TODAY}</div>
    <div>The Trust Platform OS · hawkeyetransact@gmail.com</div>
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
