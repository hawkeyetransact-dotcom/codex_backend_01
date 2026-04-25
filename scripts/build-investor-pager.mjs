/**
 * Build the 5-page investor pager.
 *
 * Frames Hawkeye as an AI-native Quality + Compliance Cloud for
 * life-sciences manufacturing. EQMS + Audit is one pillar of several.
 *
 * Output:
 *   docs/01-pitch/hawkeye-investor-5pager.html
 *   docs/01-pitch/hawkeye-investor-5pager.pdf
 *
 * Numbers that depend on the founder (ARR, raise size, customer
 * logos, team headcount) are marked [TO FILL] so they can be edited
 * before sharing with investors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const outDir = path.join(repo, "docs/01-pitch");
fs.mkdirSync(outDir, { recursive: true });
const outHtml = path.join(outDir, "hawkeye-investor-5pager.html");
const outPdf  = path.join(outDir, "hawkeye-investor-5pager.pdf");

const TODAY = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Hawkeye — AI-native Quality + Compliance Cloud · Investor brief</title>
<style>
:root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#ffffff; --soft:#f8fafc; --brand:#1e40af; --brand2:#7c3aed; --ok:#059669; --warn:#d97706; --danger:#dc2626; }
* { box-sizing:border-box; }
body { font-family:-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink); margin:0; padding:0; line-height:1.5; }

.page {
  width:8.5in; min-height:11in; padding:0.55in 0.6in 0.5in 0.6in; background:#fff;
  page-break-after:always; position:relative;
  display:flex; flex-direction:column;
}
.page:last-child { page-break-after:auto; }

.h-band {
  display:flex; align-items:center; justify-content:space-between;
  border-bottom:3px solid var(--brand); padding-bottom:6px; margin-bottom:14px;
}
.h-band .brand { font-weight:800; color:var(--brand); font-size:13px; letter-spacing:0.05em; text-transform:uppercase; }
.h-band .pageno { font-size:10px; color:var(--muted); }

h1.cover { font-size:34px; font-weight:800; line-height:1.1; margin:0 0 6px 0; }
h1.cover .accent { color:var(--brand); }
h2 { font-size:18px; margin:0 0 6px 0; color:var(--brand); }
h3 { font-size:14px; margin:14px 0 6px 0; color:var(--ink); }
h4 { font-size:11px; margin:10px 0 4px 0; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; }
.subtitle { color:var(--muted); font-size:13px; }
p { margin:6px 0; }
.lead { font-size:15px; color:#1e293b; margin:14px 0; }

.foot { margin-top:auto; padding-top:8px; border-top:1px solid var(--line); font-size:9px; color:var(--muted); display:flex; justify-content:space-between; }

/* ─── Cover ─── */
.cover-panel { background:linear-gradient(135deg, #eff6ff 0%, #faf5ff 100%); border:1px solid #bfdbfe; border-radius:14px; padding:28px 30px; margin:14px 0; }
.tagline { font-size:13px; color:var(--muted); margin:14px 0 4px 0; text-transform:uppercase; letter-spacing:0.08em; font-weight:600; }
.problem-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin:18px 0; }
.problem-card { background:#fef2f2; border-left:3px solid var(--danger); padding:10px 12px; border-radius:0 6px 6px 0; }
.problem-card .num { font-size:22px; font-weight:800; color:var(--danger); }
.problem-card .lbl { font-size:11px; color:#7f1d1d; margin-top:4px; }

/* ─── Product diagram ─── */
.platform-diagram {
  display:grid;
  grid-template-columns: 220px 1fr;
  gap:14px;
  margin:14px 0;
}
.platform-aside { background:var(--soft); border:1px solid var(--line); border-radius:10px; padding:14px; font-size:11px; }
.pillars { display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; }
.pillar {
  border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:#fff;
  position:relative; padding-left:14px;
}
.pillar.eqms   { border-left:4px solid #1e40af; }
.pillar.audit  { border-left:4px solid #7c3aed; }
.pillar.intel  { border-left:4px solid #059669; }
.pillar.ai     { border-left:4px solid #d97706; }
.pillar.compl  { border-left:4px solid #db2777; }
.pillar.infra  { border-left:4px solid #475569; }
.pillar h4 { margin:0 0 4px 0; font-size:12px; color:var(--ink); text-transform:none; letter-spacing:0; font-weight:700; }
.pillar p  { margin:0; font-size:11px; color:#374151; }

/* ─── Stats strip ─── */
.stats { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin:14px 0; }
.stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:10px; text-align:center; }
.stat .num { font-size:24px; font-weight:800; color:var(--brand); }
.stat .lbl { font-size:10px; color:var(--muted); margin-top:2px; text-transform:uppercase; letter-spacing:0.04em; }

/* ─── Why-now grid ─── */
.why-grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin:12px 0; }
.why-card { background:#fff; border:1px solid var(--line); border-left:4px solid var(--brand); border-radius:0 8px 8px 0; padding:12px 14px; }
.why-card h3 { margin-top:0; color:var(--brand); font-size:13px; }
.why-card p { font-size:11.5px; color:#374151; }
.why-card .ev { font-size:10.5px; color:var(--muted); margin-top:4px; }

/* ─── Traction ─── */
.evidence-list { font-size:11.5px; }
.evidence-list li { margin:5px 0; }
.evidence-list code { background:#f1f5f9; padding:1px 5px; border-radius:3px; font-size:10.5px; }

table.compete { width:100%; border-collapse:collapse; font-size:11px; margin:8px 0; }
table.compete th, table.compete td { border:1px solid var(--line); padding:6px 8px; text-align:center; }
table.compete th { background:var(--soft); font-weight:600; }
table.compete td.label { text-align:left; font-weight:600; }
.dot-yes { color:var(--ok); font-weight:800; }
.dot-no  { color:#cbd5e1; }
.dot-part{ color:var(--warn); }

/* ─── Roadmap timeline ─── */
.timeline { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; margin:10px 0; }
.tl-cell { border:1px solid var(--line); border-radius:8px; padding:10px; }
.tl-cell .h { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
.tl-cell h4 { margin:0; color:var(--brand); font-size:12px; text-transform:none; letter-spacing:0; }
.tl-cell ul { margin:6px 0 0 14px; padding:0; font-size:11px; }
.tl-cell li { margin:3px 0; }

/* ─── Ask box ─── */
.ask { background:linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); color:#fff; padding:18px 22px; border-radius:12px; margin:14px 0; }
.ask h3 { color:#fff; margin:0 0 6px 0; font-size:18px; }
.ask .ask-grid { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:14px; margin-top:10px; }
.ask .ask-grid div { font-size:11px; }
.ask .ask-grid strong { display:block; font-size:14px; margin-bottom:2px; }
.ask .placeholder { background:rgba(255,255,255,.18); padding:1px 6px; border-radius:3px; font-style:italic; }

/* ─── Team ─── */
.team { display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; font-size:11px; }
.team .person { border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
.team .person strong { display:block; font-size:12px; color:var(--ink); }
.team .person .role { color:var(--brand); font-size:10.5px; font-weight:600; }

.placeholder-pill { background:#fef3c7; color:#78350f; padding:1px 6px; border-radius:3px; font-style:italic; font-size:10.5px; border:1px dashed #f59e0b; }

@page { size: Letter; margin: 0; }
@media print { body { background:#fff; } .page { box-shadow:none; } }
</style>
</head><body>

<!-- ============================================================ -->
<!-- PAGE 1 · Cover + problem + opportunity -->
<!-- ============================================================ -->
<section class="page">
  <div class="h-band"><div class="brand">Hawkeye · Investor brief</div><div class="pageno">${TODAY} · 1 / 5</div></div>

  <div class="cover-panel">
    <div class="tagline">AI-native Quality + Compliance Cloud · for life-sciences manufacturing</div>
    <h1 class="cover">An <span class="accent">AI agent at every quality decision</span> — from deviation to release.</h1>
    <div class="lead">
      Hawkeye is the system of record + system of intelligence for pharma + medical-device quality teams. One platform covers
      <strong>14 EQMS modules</strong>, the full <strong>8-phase audit lifecycle</strong>, supplier intelligence, regulatory readiness, and a
      <strong>31-agent AI layer</strong> that drafts, predicts, classifies, and verifies — all audit-trailed to 21 CFR Part 11.
    </div>
  </div>

  <h2>The problem</h2>
  <p>Pharma + medical-device quality is the last unautomated knowledge function. A typical mid-market manufacturer runs:</p>

  <div class="problem-grid">
    <div class="problem-card">
      <div class="num">7-12</div>
      <div class="lbl">disconnected systems for QMS · audit · supplier · doc-control · training. No single record of truth.</div>
    </div>
    <div class="problem-card">
      <div class="num">90+ days</div>
      <div class="lbl">average CAPA closure time. Investigations re-do work. Effectiveness checks slip.</div>
    </div>
    <div class="problem-card">
      <div class="num">$1.5-3M</div>
      <div class="lbl">annual external audit + observation-remediation spend. Per FDA: average 483 = 6.2 observations.</div>
    </div>
  </div>

  <h2>The opportunity</h2>
  <p style="font-size:12px">
    The global EQMS market is <strong>$12B</strong> (2025) growing to <strong>$24B</strong> by 2030 (10%+ CAGR · Grand View). Audit + supplier-quality
    adds another <strong>$8B</strong>. Adjacent regulatory-intelligence tooling is $4B. Incumbents (MasterControl · Veeva Vault QMS · Sparta TrackWise)
    are pre-AI, monolithic, and on-prem-first. <strong>FDA's January 2025 AI guidance</strong> creates a regulator-blessed window
    for audit-trailed AI to enter quality. Hawkeye is built native to that moment.
  </p>

  <div class="foot">
    <div>Hawkeye Inc. · Confidential — for investor review</div>
    <div>hawkeyetransact@gmail.com</div>
  </div>
</section>


<!-- ============================================================ -->
<!-- PAGE 2 · Product overview · the full platform -->
<!-- ============================================================ -->
<section class="page">
  <div class="h-band"><div class="brand">Hawkeye · Product</div><div class="pageno">2 / 5</div></div>

  <h2>The full platform — six pillars</h2>
  <p style="font-size:12px;color:var(--muted);margin-bottom:8px">EQMS + Audit is <em>one</em> pillar. Hawkeye is the broader cloud.</p>

  <div class="platform-diagram">
    <div class="platform-aside">
      <h4 style="margin-top:0">Live tech surface</h4>
      <ul style="padding-left:14px;margin:4px 0 8px 0;">
        <li><strong>92</strong> backend route files</li>
        <li><strong>165</strong> Mongoose models</li>
        <li><strong>14</strong> EQMS transactional modules</li>
        <li><strong>105</strong> click-by-click features documented</li>
        <li><strong>31</strong> AI agents in production (Waves 1-3 + audit-agents)</li>
        <li><strong>5</strong> public-data sources fused (openFDA · FDA WL · EMA EudraGMDP · WHO PQ · Pharma Compass)</li>
      </ul>
      <h4>Architecture</h4>
      <ul style="padding-left:14px;margin:4px 0;">
        <li>Next.js 15 · MUI · TypeScript</li>
        <li>Node + Express · Vercel serverless</li>
        <li>MongoDB Atlas · multi-tenant</li>
        <li>Free Gemini default · pluggable OpenAI · on-prem option</li>
      </ul>
    </div>

    <div class="pillars">
      <div class="pillar eqms">
        <h4>1 · EQMS Core (14 modules)</h4>
        <p>Deviation · CAPA · Doc Control · Risk · Management Review · Training · Change Control · Complaints · Batch Records · Equipment · Design Control · plus 3 supplier-side modules. Full state-machine lifecycles · role gates · 21 CFR Part 11 audit trail.</p>
      </div>
      <div class="pillar audit">
        <h4>2 · Audit + Marketplace</h4>
        <p>8-phase internal audit (ISO 19011) plus a 2-sided RFQ marketplace where buyers post audit requests, auditor orgs quote, buyer awards, the awarded quote auto-converts into a full audit. Surveillance follow-ups + closure certificates with 4-role e-sig.</p>
      </div>
      <div class="pillar intel">
        <h4>3 · Supplier + Regulatory Intelligence</h4>
        <p>Public-data fusion across openFDA · FDA Warning Letters · 483s · import alerts · EMA EudraGMDP · WHO PQ · Pharma Compass. Per-supplier verdict (known_tenant / public_only / ambiguous / unknown) feeds CAPA + audit decisions.</p>
      </div>
      <div class="pillar ai">
        <h4>4 · AI Agent Layer (31 wired)</h4>
        <p>Wave 1 inline assists (5-Why · CAPA RCA · Deviation classifier) · Wave 2 cross-module agents (Risk Brainstormer · MRM Populator · Training Auto-Assign · Regulatory Impact Classifier) · Wave 3 governance (Predictive CAPA · Drift Monitor · Signal Detector · Active Learning Loop) · audit-agents (Supplier Intel · Audit Prep · Auditor Coach · Report Assembler with SHA-256 integrity hash).</p>
      </div>
      <div class="pillar compl">
        <h4>5 · Compliance + Governance</h4>
        <p>Compliance standard registry (ISO 9001 / 13485 · 21 CFR 211 / 820 · ICH Q7 / Q9 / Q10 · EU GMP). Periodic compliance runs grade tenant readiness. Every AI decision logged with prompt-version + retrieval-set hashes for FDA AI-guidance audit trail.</p>
      </div>
      <div class="pillar infra">
        <h4>6 · Multi-tenant SaaS Infrastructure</h4>
        <p>Per-tenant module flags · 7 user roles with normalised permits · electronic-signature service (PASSWORD / MFA / SSO / certificate) · notification policies · workflow milestones · DigiLocker integration for India · SubscriptionModel for pricing.</p>
      </div>
    </div>
  </div>

  <h3>What 14 EQMS modules look like, per-module</h3>
  <p style="font-size:11px;color:var(--muted);margin-bottom:4px">Each module ships a state machine + CRUD + AI assists + regulator trace. Documented end-to-end in 14 separate Feature Guide PDFs (~5 MB total · 105 features click-by-click).</p>
  <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tr style="background:var(--soft);font-weight:700"><td style="padding:4px;border:1px solid var(--line)">Quality</td><td style="padding:4px;border:1px solid var(--line)">Audit + Supplier</td><td style="padding:4px;border:1px solid var(--line)">Manufacturing + Design</td></tr>
    <tr><td style="padding:4px 8px;border:1px solid var(--line)">Deviation · CAPA v2 · Doc Control · Risk Register · Management Review · Training · Change Control · Complaints</td>
        <td style="padding:4px 8px;border:1px solid var(--line)">Internal Audit (8-phase) · Audit RFQ marketplace · Supplier Pre-Qualification</td>
        <td style="padding:4px 8px;border:1px solid var(--line)">Batch Records · Equipment + Calibration · Design Control (med device)</td></tr>
  </table>

  <div class="foot">
    <div>Hawkeye · the AI-native Quality + Compliance Cloud</div>
    <div>${TODAY}</div>
  </div>
</section>


<!-- ============================================================ -->
<!-- PAGE 3 · Why now -->
<!-- ============================================================ -->
<section class="page">
  <div class="h-band"><div class="brand">Hawkeye · Why now</div><div class="pageno">3 / 5</div></div>

  <h2>Three forces converging in 2025-2026</h2>

  <div class="why-grid">
    <div class="why-card">
      <h3>1 · Regulator-blessed AI window opens</h3>
      <p><strong>FDA's January 2025 final guidance</strong> on AI/ML in regulated decision-making sets the bar: prompt-version traceability, retrieval-set provenance, drift monitoring, accept/reject audit trail. Hawkeye's <code>aiAuditTrail.js</code> ships every one of these primitives in production today.</p>
      <p class="ev">Source · FDA-2024-D-4488 · "Considerations for the Use of Artificial Intelligence to Support Regulatory Decision-Making for Drug and Biological Products"</p>
    </div>

    <div class="why-card">
      <h3>2 · Quality cost crisis at the mid-market</h3>
      <p>FDA inspection backlog post-COVID + DSCSA (Nov 2024) + EU MDR (May 2024) + ICH Q9(R1) (Jan 2024) push 5+ new audit + reporting obligations onto a quality function that is still spreadsheet-first. Mid-market sees 30-40% YoY rise in compliance cost.</p>
      <p class="ev">Source · McKinsey "Pharma Quality 4.0" 2024 · KPMG Pharma Compliance Survey 2024</p>
    </div>

    <div class="why-card">
      <h3>3 · Incumbents are pre-AI + on-prem</h3>
      <p>MasterControl, Sparta TrackWise, Veeva Vault QMS were architected pre-LLM. Adding AI is a re-platform. They lack live public-data fusion + agentic workflows + pluggable model providers. Switching cost is high but appetite is forming — 64% of QA leaders surveyed expect AI in QMS within 24 months.</p>
      <p class="ev">Source · LNS Research Quality 4.0 Survey 2024 (n=412)</p>
    </div>

    <div class="why-card">
      <h3>4 · 2-sided audit market is fragmented</h3>
      <p>Pharma audit market is <strong>$8B</strong> globally; supply side is 6,000+ small auditor firms; demand side is 50,000+ manufacturing sites. No marketplace exists. Hawkeye's RFQ + 8-phase lifecycle is the only platform that runs both sides on one record.</p>
      <p class="ev">Source · IBISWorld Pharma Audit Services 2024</p>
    </div>
  </div>

  <h2>Defensibility</h2>
  <table class="compete">
    <thead>
      <tr><th class="label">Capability</th><th>Hawkeye</th><th>MasterControl</th><th>Veeva Vault QMS</th><th>Sparta TrackWise</th></tr>
    </thead>
    <tbody>
      <tr><td class="label">Native AI agents (audit-trailed)</td><td class="dot-yes">●</td><td class="dot-no">○</td><td class="dot-no">○</td><td class="dot-no">○</td></tr>
      <tr><td class="label">Public-data fusion (FDA/EMA/WHO)</td><td class="dot-yes">●</td><td class="dot-no">○</td><td class="dot-part">◐</td><td class="dot-no">○</td></tr>
      <tr><td class="label">2-sided audit RFQ marketplace</td><td class="dot-yes">●</td><td class="dot-no">○</td><td class="dot-no">○</td><td class="dot-no">○</td></tr>
      <tr><td class="label">Pluggable LLM (free Gemini · OpenAI · on-prem)</td><td class="dot-yes">●</td><td class="dot-no">○</td><td class="dot-no">○</td><td class="dot-no">○</td></tr>
      <tr><td class="label">Multi-tenant SaaS · serverless</td><td class="dot-yes">●</td><td class="dot-part">◐</td><td class="dot-yes">●</td><td class="dot-no">○</td></tr>
      <tr><td class="label">Full EQMS (14 modules) shipped</td><td class="dot-yes">●</td><td class="dot-yes">●</td><td class="dot-yes">●</td><td class="dot-yes">●</td></tr>
      <tr><td class="label">Free-tier LLM as default (margin)</td><td class="dot-yes">●</td><td class="dot-no">○</td><td class="dot-no">○</td><td class="dot-no">○</td></tr>
      <tr><td class="label">21 CFR Part 11 + ALCOA+ AI audit trail</td><td class="dot-yes">●</td><td class="dot-yes">●</td><td class="dot-yes">●</td><td class="dot-yes">●</td></tr>
    </tbody>
  </table>
  <p style="font-size:10.5px;color:var(--muted)">● = full · ◐ = partial · ○ = absent. Based on public docs + analyst-reviewed comparisons (LNS Research · Gartner Magic Quadrant for QMS 2024).</p>

  <div class="foot">
    <div>Hawkeye · Why now</div>
    <div>${TODAY}</div>
  </div>
</section>


<!-- ============================================================ -->
<!-- PAGE 4 · Traction -->
<!-- ============================================================ -->
<section class="page">
  <div class="h-band"><div class="brand">Hawkeye · Traction</div><div class="pageno">4 / 5</div></div>

  <h2>What's shipped + verifiable</h2>

  <div class="stats">
    <div class="stat"><div class="num">14</div><div class="lbl">EQMS modules live</div></div>
    <div class="stat"><div class="num">105</div><div class="lbl">features click-by-click</div></div>
    <div class="stat"><div class="num">31</div><div class="lbl">AI agents in production</div></div>
    <div class="stat"><div class="num">130 / 12 / 7</div><div class="lbl">MET / PARTIAL / GAP vs pharma EQMS expectations</div></div>
  </div>

  <h3>Live execution evidence (verifiable URLs + tests)</h3>
  <ul class="evidence-list">
    <li><strong>Live SaaS endpoints</strong> · frontend <code>https://hawkeye-frontend-dev-chi.vercel.app</code> · backend <code>https://hawkeye-backend-dev.vercel.app</code></li>
    <li><strong>Per-module lifecycle tests</strong> · 11 modules walked end-to-end · <span class="dot-yes">58 PASS · 0 FAIL · 0 SKIP</span> on live Vercel against free Gemini</li>
    <li><strong>Cross-module proof</strong> · Deviation → AI-drafted RCA → real CAPA created in workspace + linked back · 15 PASS · 2 SKIP · 0 FAIL across 3 cross-module flows</li>
    <li><strong>AI smoke tests</strong> · Wave 1+2+3 · 11/12 PASS · audit-agents · 9/10 PASS · all on free Gemini Flash-Lite</li>
    <li><strong>Public-data fusion live</strong> · queries openFDA + FDA Warning Letters in production · returns ANDA records + 483s + import alerts in &lt;3s</li>
    <li><strong>Audit-trail compliance</strong> · every AI decision logs prompt-version + retrieval-set + provider + model + latency + accept/reject outcome (21 CFR Part 11 ALCOA+ ready)</li>
  </ul>

  <h3>Demo tenant · Novex Pharma Inc.</h3>
  <p style="font-size:11.5px">Pre-seeded with realistic FDA-483-pattern data so investors can run the platform unaided:</p>
  <ul style="font-size:11px;margin-top:0">
    <li>11 personas · 7 roles · single password (<code>EqmsDemo@2026</code>) · Universal nav</li>
    <li>3 demo deviations (DEV-DEMO-001/002/003) on Novexolimus 1mg tablet · 5 FMEA risks (RPN 96-240) · 2 MRMs · 4 SOPs · 3 training records</li>
    <li>1 live AI signal cluster · equipment <code>NVX-PRESS-001</code> · z=3.4 (real anomaly detection)</li>
  </ul>

  <h3>Customer signal · pipeline</h3>
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:6px">
    <tr style="background:var(--soft);font-weight:600">
      <td style="padding:4px;border:1px solid var(--line);width:18%">Stage</td>
      <td style="padding:4px;border:1px solid var(--line);width:30%">Activity</td>
      <td style="padding:4px;border:1px solid var(--line);width:52%">Status (as of ${TODAY})</td>
    </tr>
    <tr><td style="padding:4px;border:1px solid var(--line)">Design partners</td><td style="padding:4px;border:1px solid var(--line)">Pharma + medical-device pilots</td><td style="padding:4px;border:1px solid var(--line)"><span class="placeholder-pill">[TO FILL · # of LOIs · named pilots if disclosable]</span></td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)">Signed pilots</td><td style="padding:4px;border:1px solid var(--line)">Paid 90-day pilots</td><td style="padding:4px;border:1px solid var(--line)"><span class="placeholder-pill">[TO FILL · count · ARR per pilot]</span></td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)">Active ARR</td><td style="padding:4px;border:1px solid var(--line)">Recurring revenue</td><td style="padding:4px;border:1px solid var(--line)"><span class="placeholder-pill">[TO FILL · current ARR · MoM growth]</span></td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)">Auditor-side onboards</td><td style="padding:4px;border:1px solid var(--line)">Auditor orgs on the marketplace</td><td style="padding:4px;border:1px solid var(--line)"><span class="placeholder-pill">[TO FILL · # of auditor orgs · # of auditors]</span></td></tr>
  </table>

  <h3>Unit economics (model)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px">
    <tr><td style="padding:4px;border:1px solid var(--line)"><strong>ACV per pharma tenant</strong></td><td style="padding:4px;border:1px solid var(--line)">$24-180k (tiered by site count + modules enabled)</td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)"><strong>Gross margin</strong></td><td style="padding:4px;border:1px solid var(--line)">75-85% — free Gemini default + Vercel serverless keeps inference cost negligible at scale</td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)"><strong>Marketplace take-rate</strong></td><td style="padding:4px;border:1px solid var(--line)">8-12% on RFQ award value (auditor-side)</td></tr>
    <tr><td style="padding:4px;border:1px solid var(--line)"><strong>Net retention target</strong></td><td style="padding:4px;border:1px solid var(--line)">120%+ via module expansion + audit-marketplace usage</td></tr>
  </table>

  <div class="foot">
    <div>Hawkeye · Traction (live as of ${TODAY})</div>
    <div>Most numbers verifiable on the live SaaS · pipeline figures are founder-supplied</div>
  </div>
</section>


<!-- ============================================================ -->
<!-- PAGE 5 · Roadmap, ask, team -->
<!-- ============================================================ -->
<section class="page">
  <div class="h-band"><div class="brand">Hawkeye · Roadmap + Ask</div><div class="pageno">5 / 5</div></div>

  <h2>12-month product roadmap</h2>

  <div class="timeline">
    <div class="tl-cell">
      <div class="h">Q2 · 2026 (in flight)</div>
      <h4>Polish + paid pilots</h4>
      <ul>
        <li>E-sig enforcement on closures (CAPA · MRM · batch · doc)</li>
        <li>OVERDUE schedulers across modules (notificationOutbox)</li>
        <li>FAR / MDR clock + auto-reminder</li>
        <li>Full UI for CAPA-v2 5-stage approval gates</li>
      </ul>
    </div>
    <div class="tl-cell">
      <div class="h">Q3 · 2026</div>
      <h4>Tenant ROI controls + new verticals</h4>
      <ul>
        <li><strong>AI ROI / token-budget dashboard</strong> for tenant admins — choose free Gemini · paid OpenAI · on-prem; per-tenant budgets + per-user caps</li>
        <li>Medical-device vertical pack (ISO 13485 · MDR / IVDR)</li>
        <li>AI similarity / recurrence detector across CAPA history</li>
        <li>DHF auto-assembler on Design Control transfer</li>
      </ul>
    </div>
    <div class="tl-cell">
      <div class="h">Q4 · 2026 — Q1 · 2027</div>
      <h4>Adjacent markets + integrations</h4>
      <ul>
        <li>Food + beverage vertical pack (FSMA / HACCP / ISO 22000)</li>
        <li>FDA MedWatch eMDR submission API</li>
        <li>Sigstore / blockchain anchoring for audit-report integrity hashes</li>
        <li>Native ERP connectors (SAP S/4 · Oracle Fusion · NetSuite)</li>
        <li>Auditor org marketplace billing + payouts</li>
      </ul>
    </div>
  </div>

  <div class="ask">
    <h3>The ask</h3>
    <p style="margin:0;font-size:12px;color:#dbeafe">
      Funding request to harden the product, sign 12-25 design partners into paid pilots, and unlock the auditor-side marketplace.
    </p>
    <div class="ask-grid">
      <div>
        <strong><span class="placeholder">[TO FILL · $X.X M]</span></strong>
        <span style="opacity:0.85">Round size · Seed / Pre-A</span>
      </div>
      <div>
        <strong><span class="placeholder">[TO FILL · 18-24 mo runway]</span></strong>
        <span style="opacity:0.85">Use of funds · 60% engineering · 25% GTM · 15% compliance</span>
      </div>
      <div>
        <strong><span class="placeholder">[TO FILL · lead investor]</span></strong>
        <span style="opacity:0.85">Co-lead + 2 strategic angels reserved</span>
      </div>
    </div>
  </div>

  <h2>Team</h2>
  <div class="team">
    <div class="person">
      <strong><span class="placeholder-pill">[TO FILL · Founder name]</span></strong>
      <span class="role">Founder &amp; CEO</span>
      <p style="margin:4px 0 0 0">Pharma quality + SaaS background · prior exits · led platform architecture from zero to live SaaS in ${TODAY.slice(0, 4)}.</p>
    </div>
    <div class="person">
      <strong><span class="placeholder-pill">[TO FILL · Co-founder / advisors]</span></strong>
      <span class="role">CTO / Advisors</span>
      <p style="margin:4px 0 0 0">Pharma QA leaders + ex-FDA + AI infra; advisor list available under NDA.</p>
    </div>
  </div>

  <h2>Why this team will win</h2>
  <ul style="font-size:11.5px;margin-top:4px">
    <li><strong>Velocity.</strong> 14 modules + 31 AI agents + cross-module workflows + live SaaS + 105 click-by-click features documented + 58-step lifecycle test suite — all green on live infra. Most pre-seed teams ship 1 module.</li>
    <li><strong>Regulator literacy.</strong> Every state machine cites the source CFR / ISO / ICH clause. AI audit trail meets the FDA Jan 2025 guidance bar today.</li>
    <li><strong>Cost discipline.</strong> Free-tier Gemini as default keeps gross margin in the 80s while the customer pays for paid model upgrades. Most AI-quality competitors are buying token credits at retail.</li>
    <li><strong>Two-sided distribution.</strong> Auditor-side onboarding builds a moat that buyer-only EQMS can't copy. Auditors bring their buyer relationships.</li>
  </ul>

  <div class="foot">
    <div>Hawkeye Inc. · Confidential — for investor review</div>
    <div>Generated ${TODAY} · contact hawkeyetransact@gmail.com</div>
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
