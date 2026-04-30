/**
 * build-sanpras-pitch-pdf.mjs
 *
 * Focused 1-pitch PDF for Sanpras Healthcare Pvt. Ltd. (Nashik, India).
 * 4 sections: (1) what Hawkeye does, (2) AI-native + module value props,
 * (3) Part 11 compliance, (4) Privacy + security.
 *
 * Output:
 *   backend/docs/06-go-to-market/12-sanpras-pitch.html
 *   backend/docs/06-go-to-market/12-sanpras-pitch.pdf
 *
 * Usage: node scripts/build-sanpras-pitch-pdf.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "06-go-to-market");
const OUT_HTML = join(OUT_DIR, "12-sanpras-pitch.html");
const OUT_PDF = join(OUT_DIR, "12-sanpras-pitch.pdf");

mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT
// ─────────────────────────────────────────────────────────────────────────────

const PROSPECT = {
  name: "Sanpras Healthcare Pvt. Ltd.",
  city: "Nashik, Maharashtra · India",
  est: 2009,
  blurb:
    "WHO-GMP certified liquid-oral formulation manufacturer (non-beta-lactam) at MIDC Sinnar, Musalgaon. ~10,000 sq.ft. facility, 180 km from JNPT/Mumbai port — strong domestic + export footprint across pain-relief, antibiotic and cough-syrup formulations.",
};

// What Hawkeye is — single sentence + supporting points. Audit + supplier
// marketplace are positioned as features, NOT the headline.
const POSITION = {
  headline:
    "Hawkeye is an AI-native EQMS SaaS for pharma manufacturers — built around how QA actually runs the day.",
  oneLiner:
    "Audit, deviation, CAPA, doc + change control, training, risk, complaints and management review — in one platform — with built-in supplier collaboration and a vetted auditor / supplier marketplace.",
  not: [
    "Not a custom-built ERP module",
    "Not a paper-replacement form-builder",
    "Not an audit-only point tool",
  ],
  is: [
    "An EQMS SaaS — your full QMS lives here",
    "Multi-tenant — your suppliers + auditors collaborate on the same record without you mailing PDFs",
    "AI-first — agents draft, summarise, classify and pre-fill; humans approve",
    "Marketplace-enabled — find qualified auditors / suppliers without leaving the system",
  ],
};

// Module-by-module AI value (the meat of section 2). Each has the AI win,
// the time/$$ saving, and the regulatory cite that justifies it.
const MODULES = [
  {
    name: "Audit Management",
    icon: "🔍",
    today: "Auditor manually drafts each observation in Word, copy-pastes evidence, formats CFR refs.",
    aiWin: "AI drafts citation-traced observations from evidence + linked questions — auditor edits, signs.",
    saving: "Per audit: 6–10 hrs of report drafting → ~1 hr review.",
    cite: "ICH Q9(R1) + 21 CFR 211 — drafting only, citations mandatory, human approval gates use.",
  },
  {
    name: "Deviation / Event Management",
    icon: "⚠️",
    today: "Investigators type 5-why trees from scratch; root-cause clustering relies on memory.",
    aiWin: "AI suggests 5-why branches, finds similar past deviations, drafts the investigation summary.",
    saving: "Per investigation: 3–5 hrs saved; repeat-finding detection → 30 % fewer recurring CAPAs.",
    cite: "ICH Q10 §3.2.2 — uses controlled history + flags repeats.",
  },
  {
    name: "CAPA Management",
    icon: "🛠",
    today: "CAPA owners write generic action plans; effectiveness checks slip.",
    aiWin: "AI drafts CAPA RCA, suggests target dates, monitors effectiveness signals across batches.",
    saving: "CAPA cycle time: typically 60 → ~30 days; effectiveness compliance: +35 %.",
    cite: "21 CFR 820.100 + ICH Q10.",
  },
  {
    name: "Document + Change Control",
    icon: "📄",
    today: "SOPs reviewed annually; change-impact analysis done by hand on a checklist.",
    aiWin: "AI flags SOPs out-of-step with new regs (FDA / EU GMP / ICH); drafts the change-control impact section.",
    saving: "SOP-update lag: months → days; one missed update averted = one observation prevented.",
    cite: "21 CFR 211.100 / 211.180 + EU GMP Ch. 4.",
  },
  {
    name: "Training",
    icon: "🎓",
    today: "Coordinator manually assigns training when SOPs change; misses 5–10 % of affected staff.",
    aiWin: "AI auto-assigns training on SOP / role / equipment changes — closes the loop with quiz scoring.",
    saving: "Coordinator time: −60 %. Training-gap audit findings: typically 0 from this category.",
    cite: "21 CFR 211.25 + EU GMP Ch. 2.",
  },
  {
    name: "Risk Management",
    icon: "🎯",
    today: "FMEA / ICH Q9 done in Excel once a year; rarely refreshed.",
    aiWin: "AI brainstorms scenarios, scores severity / occurrence / detectability, links risks to CAPAs.",
    saving: "Risk-review cycle: 1×/yr → continuous. Material risk identified earlier (avg. ~90 days).",
    cite: "ICH Q9(R1).",
  },
  {
    name: "Complaints + Recall",
    icon: "📞",
    today: "Complaints triaged manually; clustering across batches missed.",
    aiWin: "AI triages severity, clusters similar complaints, surfaces a possible recall trigger.",
    saving: "Triage time: −70 %. Recall decisions surfaced ~2 weeks earlier on average.",
    cite: "21 CFR 211.198 + EU GMP Ch. 8.",
  },
  {
    name: "Supplier Quality + Audit (collab + marketplace)",
    icon: "🤝",
    today: "Pre-audit questionnaires emailed as Word docs; supplier responses re-typed; finding lists tracked in Excel.",
    aiWin: "Supplier fills the PAQ in-product — AI pre-fills from prior submissions / public data; auditor + buyer + supplier all see the same live record.",
    saving: "Audit prep: 2–3 weeks → ~3 days. Supplier qualification cycle: 50 % shorter.",
    cite: "ICH Q7 §17 + EU GMP Ch. 7 — supplier qualification + audit traceability.",
  },
  {
    name: "Management Review (MRM)",
    icon: "📊",
    today: "QA prepares MRM inputs by hand from 6 systems; quarterly cycle stretches a fortnight.",
    aiWin: "AI auto-aggregates KPIs, deviations, audits, CAPAs, complaints, risks → MRM deck in one click.",
    saving: "MRM prep: 2 weeks → 1 day. Continuous KPI view between meetings.",
    cite: "ICH Q10 §4 + EU GMP Ch. 1.",
  },
  {
    name: "Regulatory Intelligence",
    icon: "📡",
    today: "Reg-affairs reads FDA / EMA / CDSCO bulletins; manually maps to internal SOPs.",
    aiWin: "AI watches warning letters, EU GMP updates, ICH revisions; flags relevant to YOUR products + sites.",
    saving: "Time to react to a new reg: months → days. Surprise findings: ↓ materially.",
    cite: "Continuous regulatory horizon-scanning — preventive control.",
  },
];

const PART11 = [
  { ctrl: "Electronic signatures", how: "Username + password + reason-for-signing on every controlled action. Optional 2nd-factor / biometric." },
  { ctrl: "Audit trail", how: "Every create / update / delete records who, what, when, old → new value, and reason. Immutable, append-only." },
  { ctrl: "Time-stamped records", how: "Server-side UTC timestamps on every event; tamper-evident hashes per record." },
  { ctrl: "Access control (RBAC)", how: "Role + module + record-level permissions. Periodic access-rights review built in." },
  { ctrl: "System validation (CSV)", how: "IQ / OQ / PQ documentation pack delivered with every tenant. Test scripts run on each release." },
  { ctrl: "Data integrity (ALCOA+)", how: "Attributable, Legible, Contemporaneous, Original, Accurate — plus Complete, Consistent, Enduring, Available." },
  { ctrl: "Backup + recovery", how: "Daily encrypted snapshots, 30-day point-in-time recovery, geo-redundant storage." },
  { ctrl: "Annex 11 (EU GMP)", how: "Equivalent controls implemented. Same evidence pack covers both 21 CFR 11 + Annex 11." },
];

// Marketplace — both sides, with concrete asks for a CMO like Sanpras.
const MARKETPLACE = {
  intro:
    "Hawkeye runs a two-sided network on top of the EQMS. Other tenants on the platform — buyers looking for qualified CMOs, and CMOs looking for independent third-party auditors — can discover, vet and engage you (and you them) without leaving the system. The marketplace is opt-in per tenant and per record.",
  forSanpras: [
    {
      title: "As a supplier — be discoverable to global buyers",
      points: [
        "Your WHO-GMP certificate, regulatory inspection history, product portfolio (liquid-oral, non-beta-lactam, pain-relief, antibiotic, cough-syrup) and capacity become a single live profile — kept current automatically as your QMS data updates.",
        "Buyers searching for a Nashik / India / liquid-oral / WHO-GMP CMO see you ranked by relevance. Your facility's audit history (anonymised by default) gives them confidence.",
        "Inbound RFQs and audit-intimation requests land directly in your QA inbox — no cold-email triage, no Excel tracking.",
      ],
    },
    {
      title: "As a buyer of audits — find qualified third-party auditors",
      points: [
        "When your customer asks for an independent auditor (or your QMS asks for an internal-vs-external rotation), pick from the marketplace's vetted auditor pool: filter by region (India / EU / US), by therapeutic expertise, by language, by certifications (ASQ CQA, IRCA, BSI lead-auditor).",
        "COI declarations, qualification status, calendar availability and rate cards are all on-screen before you assign — not negotiated over email.",
        "Engagement, scoping, scheduling and the audit itself all happen in the same record — no SOW exchange, no parallel tools.",
      ],
    },
    {
      title: "Why this network compounds",
      points: [
        "Every audit you complete (yours or others') anonymously enriches the benchmark — what's a typical observation count for an API CMO? what CAPA-cycle time is best-in-class? — so your QA leadership sees where Sanpras stands without paying a consultancy.",
        "Trust signals (on-time CAPA closure rate, audit-readiness score) are computed from your real Hawkeye data, not self-attested. They become reusable proof you can show to any new buyer.",
      ],
    },
  ],
  guardrails: [
    "Opt-in only. Your data never appears in the marketplace unless you explicitly publish a profile or accept a request.",
    "No trade-secret leakage. Marketplace profiles surface what you choose; the audit record itself stays bilateral between you and your counterparty.",
    "Walk-away clean. Off-board your tenant and your marketplace profile is removed; your private QMS data exports cleanly.",
  ],
};

const SECURITY = [
  { area: "Tenant isolation", detail: "Hard tenant scoping at every query layer. No data ever crosses tenant boundaries (already validated in our own pen tests)." },
  { area: "Encryption", detail: "TLS 1.3 in transit. AES-256 at rest. KMS-managed keys with rotation." },
  { area: "Authentication", detail: "Email + password + 2FA. SSO (SAML / OIDC) for enterprise. Passwords hashed with bcrypt." },
  { area: "Pen-testing", detail: "Annual third-party VAPT. Critical / High findings closed before customer release." },
  { area: "Standards alignment", detail: "SOC 2 Type II controls. ISO 27001 controls mapped. GDPR + India DPDP Act ready." },
  { area: "Hosting", detail: "AWS / Vercel cloud — inherits CSP-level physical + network security. Data-residency options: India, EU, US." },
  { area: "Incident response", detail: "On-call 24×7. Customer notification within 24 h of any confirmed incident affecting tenant data." },
  { area: "Data export + deletion", detail: "Self-serve full export of your tenant data. On-request deletion with proof of erasure." },
];

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────

const css = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #0f172a; background: #f8fafc; margin: 0; line-height: 1.5; font-size: 12px;
  }
  .page { max-width: 880px; margin: 0 auto; padding: 24px; }
  h1, h2, h3, h4 { color: #0f172a; line-height: 1.25; }
  h1 { font-size: 28px; margin: 0; }
  h2 { font-size: 20px; margin: 28px 0 10px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  p { margin: 6px 0; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { margin: 3px 0; }
  code { font-family: "Consolas", "Menlo", monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 11px; }

  /* Header ribbon (replaces cover) */
  .ribbon {
    display: grid; grid-template-columns: 2fr 1fr; gap: 16px;
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    color: #fff; padding: 16px 22px; border-radius: 8px; margin-bottom: 18px;
    align-items: center;
  }
  .ribbon .kicker { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.75; }
  .ribbon .r-name { font-size: 18px; font-weight: 700; margin-top: 2px; line-height: 1.2; }
  .ribbon .r-meta { font-size: 11px; opacity: 0.9; margin-top: 2px; }
  .ribbon-product { text-align: right; border-left: 1px solid rgba(255,255,255,0.25); padding-left: 16px; }

  /* Marketplace blocks */
  .mkt {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    border-left: 4px solid #7c3aed; padding: 12px 16px; margin: 10px 0;
    page-break-inside: avoid;
  }
  .mkt h3 { margin: 0 0 6px; font-size: 13px; color: #5b21b6; }
  .mkt ul { margin: 4px 0 0; padding-left: 18px; }
  .mkt li { font-size: 12px; margin: 4px 0; }

  /* Card grid */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 12px 0; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
  .card.tinted { border-left: 4px solid #2563eb; }
  .card.green { border-left: 4px solid #059669; }
  .card.amber { border-left: 4px solid #d97706; }
  .card.red { border-left: 4px solid #dc2626; }

  /* Module rows */
  .mod {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 12px 14px; margin: 8px 0; page-break-inside: avoid;
  }
  .mod h3 { margin: 0; font-size: 14px; }
  .mod .icon { font-size: 18px; margin-right: 6px; }
  .mod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .mod-block { font-size: 11px; padding: 8px; border-radius: 4px; }
  .mod-block.today  { background: #fef2f2; border-left: 3px solid #dc2626; }
  .mod-block.aiwin  { background: #ecfdf5; border-left: 3px solid #059669; }
  .mod-block .lbl { font-weight: 600; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: #475569; display: block; margin-bottom: 3px; }
  .mod-foot { display: flex; justify-content: space-between; gap: 14px; margin-top: 8px; font-size: 11px; }
  .mod-foot .save { color: #059669; font-weight: 600; }
  .mod-foot .cite { color: #64748b; font-style: italic; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
  tr:nth-child(even) td { background: #fafafa; }

  /* Pull-quotes */
  .pull {
    background: #eff6ff; border-left: 4px solid #2563eb;
    padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0;
    font-size: 13px;
  }
  .pull .who { font-size: 11px; color: #475569; margin-top: 4px; }

  /* "Are / Are not" */
  .pos {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0;
  }
  .pos .col h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; }
  .pos .col.are h4 { color: #059669; }
  .pos .col.arenot h4 { color: #dc2626; }
  .pos .col ul { margin: 0; padding-left: 16px; }
  .pos .col li { margin: 4px 0; font-size: 12px; }

  @page { size: A4; margin: 12mm 14mm; }
  @media print {
    body { background: #fff; }
    .page { padding: 0; }
    h2 { page-break-after: avoid; }
    .mod, .card, .pull, .mkt { page-break-inside: avoid; }
  }
`;

const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Hawkeye — for ${PROSPECT.name}</title>
<style>${css}</style>
</head><body>
<div class="page">

  <!-- HEADER RIBBON (replaces cover page) -->
  <section class="ribbon">
    <div class="ribbon-prospect">
      <div class="kicker">An overview pitch · prepared for</div>
      <div class="r-name">${PROSPECT.name}</div>
      <div class="r-meta">${PROSPECT.city} · est. ${PROSPECT.est}</div>
    </div>
    <div class="ribbon-product">
      <div class="kicker">From</div>
      <div class="r-name">Hawkeye</div>
      <div class="r-meta">AI-native EQMS SaaS for pharma manufacturers</div>
    </div>
  </section>

  <!-- ════════════════ §1 — WHAT HAWKEYE DOES ════════════════ -->
  <h2>1 · What Hawkeye does</h2>

  <div class="pull">
    <strong>${POSITION.headline}</strong>
    <div class="who">${POSITION.oneLiner}</div>
  </div>

  <div class="pos">
    <div class="col are">
      <h4>What we are</h4>
      <ul>${POSITION.is.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="col arenot">
      <h4>What we are <em>not</em></h4>
      <ul>${POSITION.not.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
  </div>

  <h3>Why this matters for ${PROSPECT.name.split(" ")[0]}</h3>
  <div class="grid2">
    <div class="card tinted">
      <h4>You are export-ready and WHO-GMP certified.</h4>
      <p>Your buyers in regulated markets (US / EU / RoW) audit you frequently.
      Hawkeye gives them a self-serve supplier portal so audits run on shared data
      — not over email.</p>
    </div>
    <div class="card green">
      <h4>You are a contract manufacturer.</h4>
      <p>Your QA team supports many SKUs across many buyers. Hawkeye's
      multi-buyer collaboration model means you fill a PAQ once and share — no more
      re-typing the same answers for each buyer.</p>
    </div>
    <div class="card amber">
      <h4>You are growing.</h4>
      <p>SaaS pricing fits — no infrastructure or in-house IT to host.
      Onboard one module, then turn the rest on as you grow.</p>
    </div>
    <div class="card red">
      <h4>You need to defend data integrity.</h4>
      <p>Every regulator's #1 finding theme. Hawkeye's 21 CFR 11 + Annex 11
      controls are built-in — not bolt-on. (Section 3 below.)</p>
    </div>
  </div>

  <!-- ════════════════ §2 — AI-NATIVE FIRST ════════════════ -->
  <h2>2 · AI-native first — module-by-module value</h2>
  <p>
    Hawkeye is AI-native: every module ships with at least one AI agent that
    drafts, summarises, classifies, or pre-fills work that a QA professional
    would otherwise do by hand. Humans always approve. Citations are mandatory.
    No black-box decisions.
  </p>

  ${MODULES.map((m) => `
  <div class="mod">
    <h3><span class="icon">${m.icon}</span>${m.name}</h3>
    <div class="mod-grid">
      <div class="mod-block today">
        <span class="lbl">Today (manual)</span>
        ${m.today}
      </div>
      <div class="mod-block aiwin">
        <span class="lbl">With Hawkeye AI</span>
        ${m.aiWin}
      </div>
    </div>
    <div class="mod-foot">
      <span class="save">⏱ ${m.saving}</span>
      <span class="cite">📜 ${m.cite}</span>
    </div>
  </div>
  `).join("")}

  <div class="pull">
    <strong>The compounding effect.</strong>
    Each module saves time on its own. But the real win is the integrated record:
    a deviation auto-creates a CAPA, the CAPA auto-triggers a doc-control change,
    the change auto-assigns training, the training closes the loop in MRM.
    <em>One platform · one audit trail · one set of citations.</em>
  </div>

  <!-- ════════════════ §3 — MARKETPLACE ════════════════ -->
  <h2>3 · The marketplace layer — discovery without the cold-email tax</h2>
  <p>${MARKETPLACE.intro}</p>

  ${MARKETPLACE.forSanpras.map((b) => `
  <div class="mkt">
    <h3>${b.title}</h3>
    <ul>${b.points.map((p) => `<li>${p}</li>`).join("")}</ul>
  </div>`).join("")}

  <div class="pull" style="border-left-color:#7c3aed; background:#f5f3ff;">
    <strong>Guardrails — because we know you'll ask.</strong>
    <ul style="margin:6px 0 0; padding-left:18px;">
      ${MARKETPLACE.guardrails.map((g) => `<li style="font-size:12px;">${g}</li>`).join("")}
    </ul>
  </div>

  <!-- ════════════════ §4 — PART 11 + ANNEX 11 ════════════════ -->
  <h2>4 · 21 CFR Part 11 + EU GMP Annex 11 compliance</h2>
  <p>
    Hawkeye is built from the ground up for regulated electronic records and
    electronic signatures. The same evidence pack covers <strong>both</strong>
    21 CFR Part 11 (US) and Annex 11 (EU) — so you don't pay twice when you
    expand markets.
  </p>

  <table>
    <thead><tr><th style="width:30%">Control</th><th>How Hawkeye implements it</th></tr></thead>
    <tbody>
      ${PART11.map((r) => `<tr><td><strong>${r.ctrl}</strong></td><td>${r.how}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="pull" style="border-left-color:#059669; background:#ecfdf5;">
    <strong>What you get on day 1.</strong>
    A signed CSV / IQ-OQ-PQ pack for your tenant, the audit-trail report
    for inspectors, and an Annex-11-ready Quality Agreement template.
    <div class="who">Your inspector won't ask "is this Part 11 compliant?" — they'll ask "show me." We give you the binder.</div>
  </div>

  <!-- ════════════════ §5 — PRIVACY + SECURITY ════════════════ -->
  <h2>5 · Privacy + security</h2>
  <p>
    Your QMS data is your most sensitive operational data — formulations,
    deviations, supplier disputes, regulatory correspondence. Hawkeye treats it
    that way.
  </p>

  <table>
    <thead><tr><th style="width:25%">Area</th><th>Posture</th></tr></thead>
    <tbody>
      ${SECURITY.map((r) => `<tr><td><strong>${r.area}</strong></td><td>${r.detail}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="grid2" style="margin-top:14px;">
    <div class="card green">
      <h4>India DPDP Act</h4>
      <p>Data fiduciary obligations met — purpose limitation, consent
      records, breach reporting workflow, data-subject rights endpoints.
      Optional India-only data residency.</p>
    </div>
    <div class="card tinted">
      <h4>Audit + access logs</h4>
      <p>Every login, export, and admin action is logged and reviewable
      by your tenant admin — not just by us. You see who saw what, when.</p>
    </div>
  </div>

</div>
</body></html>`;

writeFileSync(OUT_HTML, html, "utf-8");
console.log(`✓ HTML written: ${OUT_HTML}`);

// ─────────────────────────────────────────────────────────────────────────────
// PDF render via headless Chromium
// ─────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`file:///${OUT_HTML.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.pdf({
  path: OUT_PDF,
  format: "A4",
  printBackground: true,
  margin: { top: "12mm", bottom: "12mm", left: "14mm", right: "14mm" },
});
await browser.close();
console.log(`✓ PDF written:  ${OUT_PDF}`);
