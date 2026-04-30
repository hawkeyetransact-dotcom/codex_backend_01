/**
 * build-sanpras-pitch-pptx.mjs
 *
 * Slide-deck version of the Sanpras pitch (mirrors the PDF — same content
 * model, slide-shaped layout). Generates a real .pptx that opens in
 * PowerPoint, Keynote, Google Slides.
 *
 * Output:
 *   backend/docs/06-go-to-market/12-sanpras-pitch.pptx
 *
 * Usage: node scripts/build-sanpras-pitch-pptx.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "06-go-to-market");
const OUT_PPTX = join(OUT_DIR, "12-sanpras-pitch.pptx");

mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE  (kept in sync with the PDF)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  ink:    "0F172A",
  dim:    "475569",
  blue:   "2563EB",
  navy:   "1E3A8A",
  green:  "059669",
  amber:  "D97706",
  red:    "DC2626",
  purple: "7C3AED",
  bg:     "F8FAFC",
  panel:  "FFFFFF",
  border: "E2E8F0",
  pillBg: "F1F5F9",
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT  (same shape as the PDF)
// ─────────────────────────────────────────────────────────────────────────────
const PROSPECT = {
  name: "Sanpras Healthcare Pvt. Ltd.",
  city: "Nashik, Maharashtra · India",
  est: 2009,
  blurb:
    "WHO-GMP certified liquid-oral formulation manufacturer (non-beta-lactam) at MIDC Sinnar, Musalgaon. ~10,000 sq.ft. facility, 180 km from JNPT/Mumbai port — strong domestic + export footprint across pain-relief, antibiotic and cough-syrup formulations.",
};

const POSITION = {
  headline: "Hawkeye is an AI-native EQMS SaaS for pharma manufacturers.",
  oneLiner:
    "Audit, deviation, CAPA, doc + change control, training, risk, complaints, MRM — in one platform — with built-in supplier collaboration and a vetted auditor / supplier marketplace.",
  is: [
    "An EQMS SaaS — your full QMS lives here",
    "Multi-tenant — your suppliers + auditors collaborate on the same record without you mailing PDFs",
    "AI-first — agents draft, summarise, classify, pre-fill; humans approve",
    "Marketplace-enabled — find qualified auditors / suppliers without leaving the system",
  ],
  not: [
    "Not a custom-built ERP module",
    "Not a paper-replacement form-builder",
    "Not an audit-only point tool",
  ],
};

const WHY_SANPRAS = [
  { title: "You are export-ready and WHO-GMP certified",
    body: "Buyers in regulated markets audit you frequently. A self-serve supplier portal means audits run on shared data — not over email.",
    color: C.blue },
  { title: "You are a contract manufacturer",
    body: "Your QA team supports many SKUs across many buyers. Fill a PAQ once, share it — no more re-typing the same answers.",
    color: C.green },
  { title: "You are growing",
    body: "SaaS pricing fits — no infrastructure or in-house IT to host. Onboard one module, turn the rest on as you grow.",
    color: C.amber },
  { title: "You need to defend data integrity",
    body: "Every regulator's #1 finding theme. Hawkeye's 21 CFR 11 + Annex 11 controls are built-in — not bolt-on.",
    color: C.red },
];

const MODULES = [
  { name: "Audit Management",  icon: "🔍",
    today: "Auditor manually drafts each observation in Word, copy-pastes evidence, formats CFR refs.",
    aiWin: "AI drafts citation-traced observations from evidence + linked questions — auditor edits, signs.",
    saving: "Per audit: 6–10 hrs of report drafting → ~1 hr review.",
    cite: "ICH Q9(R1) + 21 CFR 211 — drafting only, citations mandatory." },
  { name: "Deviation / Event Management", icon: "⚠️",
    today: "Investigators type 5-why trees from scratch; root-cause clustering relies on memory.",
    aiWin: "AI suggests 5-why branches, finds similar past deviations, drafts the investigation summary.",
    saving: "Per investigation: 3–5 hrs saved. Repeat-finding detection → 30 % fewer recurring CAPAs.",
    cite: "ICH Q10 §3.2.2 — uses controlled history + flags repeats." },
  { name: "CAPA Management", icon: "🛠",
    today: "CAPA owners write generic action plans; effectiveness checks slip.",
    aiWin: "AI drafts CAPA RCA, suggests target dates, monitors effectiveness signals across batches.",
    saving: "CAPA cycle: 60 → ~30 days. Effectiveness compliance: +35 %.",
    cite: "21 CFR 820.100 + ICH Q10." },
  { name: "Document + Change Control", icon: "📄",
    today: "SOPs reviewed annually; change-impact analysis done by hand on a checklist.",
    aiWin: "AI flags SOPs out-of-step with new regs (FDA / EU GMP / ICH); drafts change-control impact.",
    saving: "SOP-update lag: months → days. One missed update averted = one observation prevented.",
    cite: "21 CFR 211.100 / 211.180 + EU GMP Ch. 4." },
  { name: "Training", icon: "🎓",
    today: "Coordinator manually assigns training when SOPs change; misses 5–10 % of affected staff.",
    aiWin: "AI auto-assigns training on SOP / role / equipment changes — closes loop with quiz scoring.",
    saving: "Coordinator time: −60 %. Training-gap audit findings: typically zero.",
    cite: "21 CFR 211.25 + EU GMP Ch. 2." },
  { name: "Risk Management", icon: "🎯",
    today: "FMEA / ICH Q9 done in Excel once a year; rarely refreshed.",
    aiWin: "AI brainstorms scenarios, scores severity / occurrence / detectability, links risks to CAPAs.",
    saving: "Risk-review cycle: 1×/yr → continuous. Material risk surfaced ~90 days earlier.",
    cite: "ICH Q9(R1)." },
  { name: "Complaints + Recall", icon: "📞",
    today: "Complaints triaged manually; clustering across batches missed.",
    aiWin: "AI triages severity, clusters similar complaints, surfaces possible recall trigger.",
    saving: "Triage time: −70 %. Recall decisions surfaced ~2 weeks earlier on average.",
    cite: "21 CFR 211.198 + EU GMP Ch. 8." },
  { name: "Supplier Quality + Audit (collab + marketplace)", icon: "🤝",
    today: "Pre-audit questionnaires emailed as Word docs; supplier responses re-typed; finding lists in Excel.",
    aiWin: "Supplier fills the PAQ in-product — AI pre-fills from prior submissions; buyer + supplier + auditor see same live record.",
    saving: "Audit prep: 2–3 weeks → ~3 days. Supplier qualification cycle: 50 % shorter.",
    cite: "ICH Q7 §17 + EU GMP Ch. 7." },
  { name: "Management Review (MRM)", icon: "📊",
    today: "QA prepares MRM inputs by hand from 6 systems; quarterly cycle stretches a fortnight.",
    aiWin: "AI auto-aggregates KPIs, deviations, audits, CAPAs, complaints, risks → MRM deck in one click.",
    saving: "MRM prep: 2 weeks → 1 day. Continuous KPI view between meetings.",
    cite: "ICH Q10 §4 + EU GMP Ch. 1." },
  { name: "Regulatory Intelligence", icon: "📡",
    today: "Reg-affairs reads FDA / EMA / CDSCO bulletins; manually maps to internal SOPs.",
    aiWin: "AI watches warning letters, EU GMP updates, ICH revisions; flags relevant to YOUR products + sites.",
    saving: "Time to react to a new reg: months → days. Surprise findings: ↓ materially.",
    cite: "Continuous regulatory horizon-scanning." },
];

const MARKETPLACE = {
  intro:
    "A two-sided opt-in network on top of the EQMS. Buyers find qualified CMOs. CMOs find independent third-party auditors. All vetted. All on-platform.",
  forSanpras: [
    { title: "As a supplier — be discoverable to global buyers", color: C.purple,
      points: [
        "Your WHO-GMP cert, inspection history, product portfolio + capacity → one live profile that updates from your QMS.",
        "Buyers searching Nashik / India / liquid-oral / WHO-GMP CMOs see you ranked by relevance + audit-readiness signals.",
        "Inbound RFQs and audit-intimation requests land directly in your QA inbox — no cold-email triage.",
      ]},
    { title: "As a buyer of audits — find qualified third-party auditors", color: C.purple,
      points: [
        "Pick from a vetted pool: filter by region, therapeutic expertise, language, certifications (ASQ CQA, IRCA, BSI).",
        "COI declarations, qualification status, calendar availability, rate cards visible BEFORE you assign — not negotiated over email.",
        "Engagement, scoping, scheduling, audit itself — all in the same record. No SOW exchange, no parallel tools.",
      ]},
    { title: "Why this network compounds", color: C.purple,
      points: [
        "Each completed audit anonymously enriches benchmarks — observation counts, CAPA-cycle times — so QA leadership sees where you stand without paying a consultancy.",
        "Trust signals (on-time CAPA closure rate, audit-readiness score) are computed from real Hawkeye activity. Reusable proof for any new buyer.",
      ]},
  ],
  guardrails: [
    "Opt-in only. Data never appears in the marketplace unless you explicitly publish a profile or accept a request.",
    "No trade-secret leakage. Marketplace profiles surface what you choose; the audit record itself stays bilateral.",
    "Walk-away clean. Off-board your tenant → marketplace profile removed; private QMS data exports cleanly.",
  ],
};

const PART11 = [
  { ctrl: "Electronic signatures", how: "Username + password + reason-for-signing on every controlled action. Optional 2nd-factor / biometric." },
  { ctrl: "Audit trail",           how: "Every create/update/delete records who, what, when, old → new value, and reason. Immutable, append-only." },
  { ctrl: "Time-stamped records",  how: "Server-side UTC timestamps on every event; tamper-evident hashes per record." },
  { ctrl: "Access control (RBAC)", how: "Role + module + record-level permissions. Periodic access-rights review built in." },
  { ctrl: "System validation (CSV)", how: "IQ / OQ / PQ documentation pack delivered with every tenant. Test scripts run on each release." },
  { ctrl: "Data integrity (ALCOA+)", how: "Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available." },
  { ctrl: "Backup + recovery",     how: "Daily encrypted snapshots, 30-day point-in-time recovery, geo-redundant storage." },
  { ctrl: "Annex 11 (EU GMP)",     how: "Equivalent controls. Same evidence pack covers both 21 CFR 11 + Annex 11." },
];

const SECURITY = [
  { area: "Tenant isolation",     detail: "Hard tenant scoping at every query layer. No data crosses tenant boundaries (validated in our own pen tests)." },
  { area: "Encryption",           detail: "TLS 1.3 in transit. AES-256 at rest. KMS-managed keys with rotation." },
  { area: "Authentication",       detail: "Email + password + 2FA. SSO (SAML / OIDC) for enterprise. bcrypt password hashing." },
  { area: "Pen-testing",          detail: "Annual third-party VAPT. Critical / High findings closed before customer release." },
  { area: "Standards alignment",  detail: "SOC 2 Type II controls. ISO 27001 mapped. GDPR + India DPDP Act ready." },
  { area: "Hosting",              detail: "AWS / Vercel — inherits CSP physical + network security. Data-residency: India, EU, US." },
  { area: "Incident response",    detail: "On-call 24×7. Customer notification within 24 h of any confirmed incident." },
  { area: "Data export + deletion", detail: "Self-serve full export of your tenant data. On-request deletion with proof of erasure." },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";   // 13.333 × 7.5 inches
pptx.title = `Hawkeye — for ${PROSPECT.name}`;
pptx.author = "Hawkeye";
pptx.company = "Hawkeye";

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const PAD = 0.5;

const addHeader = (slide, sectionLabel, title) => {
  slide.background = { color: C.bg };
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.55, fill: { color: C.navy } });
  slide.addText(`HAWKEYE · for ${PROSPECT.name}`, {
    x: PAD, y: 0.05, w: 8, h: 0.45,
    color: "FFFFFF", fontSize: 10, fontFace: "Calibri", valign: "middle", bold: true, charSpacing: 1,
  });
  slide.addText(sectionLabel, {
    x: SLIDE_W - 4 - PAD, y: 0.05, w: 4, h: 0.45,
    color: "FFFFFF", fontSize: 10, fontFace: "Calibri", valign: "middle", align: "right",
  });
  slide.addText(title, {
    x: PAD, y: 0.7, w: SLIDE_W - 2 * PAD, h: 0.6,
    color: C.ink, fontSize: 26, fontFace: "Calibri", bold: true,
  });
  slide.addShape("line", {
    x: PAD, y: 1.3, w: 1.2, h: 0,
    line: { color: C.blue, width: 3 },
  });
};

const addFooter = (slide, n, total) => {
  slide.addText(`${n} / ${total}`, {
    x: SLIDE_W - 1 - PAD, y: SLIDE_H - 0.4, w: 1, h: 0.3,
    fontSize: 9, color: C.dim, align: "right", fontFace: "Calibri",
  });
};

// Track slide count so we can paginate footers correctly
const slides = [];
const newSlide = (label, title) => {
  const s = pptx.addSlide();
  if (label !== null) addHeader(s, label, title);
  slides.push(s);
  return s;
};

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — TITLE
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  slides.push(s);
  s.background = { color: C.navy };

  // Diagonal accent
  s.addShape("rect", {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { type: "gradient", color1: C.navy, color2: C.blue,
      gradient: { type: "linear", angle: 135 } },
  });

  s.addText("AN OVERVIEW PITCH · PREPARED FOR", {
    x: 1, y: 1.8, w: 11, h: 0.4,
    color: "BFDBFE", fontSize: 12, charSpacing: 4, fontFace: "Calibri",
  });
  s.addText(PROSPECT.name, {
    x: 1, y: 2.3, w: 11, h: 1.2,
    color: "FFFFFF", fontSize: 44, fontFace: "Calibri", bold: true,
  });
  s.addText(`${PROSPECT.city} · est. ${PROSPECT.est}`, {
    x: 1, y: 3.5, w: 11, h: 0.4,
    color: "BFDBFE", fontSize: 14, fontFace: "Calibri",
  });

  s.addText(PROSPECT.blurb, {
    x: 1, y: 4.2, w: 11, h: 1.2,
    color: "E0E7FF", fontSize: 13, fontFace: "Calibri", italic: true,
  });

  // Bottom band — "from"
  s.addShape("rect", {
    x: 0, y: SLIDE_H - 1.2, w: SLIDE_W, h: 1.2,
    fill: { color: "0B1838" },
  });
  s.addText("FROM", {
    x: 1, y: SLIDE_H - 1.05, w: 2, h: 0.3,
    color: "93C5FD", fontSize: 10, charSpacing: 4, fontFace: "Calibri",
  });
  s.addText("Hawkeye", {
    x: 1, y: SLIDE_H - 0.75, w: 6, h: 0.5,
    color: "FFFFFF", fontSize: 24, bold: true, fontFace: "Calibri",
  });
  s.addText("AI-native EQMS SaaS for pharma manufacturers", {
    x: 7, y: SLIDE_H - 0.75, w: 5.5, h: 0.5,
    color: "BFDBFE", fontSize: 13, valign: "middle", align: "right", fontFace: "Calibri",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — §1 What Hawkeye does (positioning)
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("1 · What Hawkeye does", "An AI-native EQMS SaaS — full QMS in one place.");

  // Pull-quote
  s.addShape("rect", {
    x: PAD, y: 1.6, w: SLIDE_W - 2 * PAD, h: 1.3,
    fill: { color: "EFF6FF" },
    line: { color: C.blue, width: 0 },
  });
  s.addShape("rect", {
    x: PAD, y: 1.6, w: 0.08, h: 1.3, fill: { color: C.blue },
  });
  s.addText(POSITION.headline, {
    x: PAD + 0.3, y: 1.7, w: SLIDE_W - 2 * PAD - 0.5, h: 0.5,
    color: C.ink, fontSize: 18, bold: true, fontFace: "Calibri",
  });
  s.addText(POSITION.oneLiner, {
    x: PAD + 0.3, y: 2.2, w: SLIDE_W - 2 * PAD - 0.5, h: 0.7,
    color: C.dim, fontSize: 13, fontFace: "Calibri",
  });

  // What we are / are not
  s.addText("WHAT WE ARE", {
    x: PAD, y: 3.2, w: 6, h: 0.3,
    color: C.green, fontSize: 11, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(POSITION.is.map((t) => ({ text: t, options: { bullet: true } })), {
    x: PAD, y: 3.5, w: 6, h: 3.3,
    color: C.ink, fontSize: 13, fontFace: "Calibri", valign: "top",
    paraSpaceAfter: 6,
  });

  s.addText("WHAT WE ARE NOT", {
    x: 7, y: 3.2, w: 5.8, h: 0.3,
    color: C.red, fontSize: 11, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(POSITION.not.map((t) => ({ text: t, options: { bullet: true } })), {
    x: 7, y: 3.5, w: 5.8, h: 3.3,
    color: C.ink, fontSize: 13, fontFace: "Calibri", valign: "top",
    paraSpaceAfter: 6,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — §1 Why this matters for Sanpras (4 cards)
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("1 · What Hawkeye does", `Why this matters for ${PROSPECT.name.split(" ")[0]}`);

  const cardW = (SLIDE_W - 2 * PAD - 0.5) / 2;   // 2 columns
  const cardH = 2.4;
  const startY = 1.6;
  WHY_SANPRAS.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = PAD + col * (cardW + 0.5);
    const y = startY + row * (cardH + 0.3);
    s.addShape("rect", {
      x, y, w: cardW, h: cardH,
      fill: { color: C.panel },
      line: { color: C.border, width: 1 },
    });
    s.addShape("rect", { x, y, w: 0.08, h: cardH, fill: { color: c.color } });
    s.addText(c.title, {
      x: x + 0.25, y: y + 0.15, w: cardW - 0.4, h: 0.5,
      color: C.ink, fontSize: 15, bold: true, fontFace: "Calibri",
    });
    s.addText(c.body, {
      x: x + 0.25, y: y + 0.7, w: cardW - 0.4, h: cardH - 0.85,
      color: C.dim, fontSize: 12, fontFace: "Calibri", valign: "top",
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — §2 intro — AI-native first
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("2 · AI-native first", "Every module ships with at least one AI agent.");

  s.addText(
    "Hawkeye is AI-native: every module ships with at least one AI agent that drafts, summarises, classifies, or pre-fills work that a QA professional would otherwise do by hand. Humans always approve. Citations are mandatory. No black-box decisions.",
    { x: PAD, y: 1.6, w: SLIDE_W - 2 * PAD, h: 1.5, color: C.ink, fontSize: 14, fontFace: "Calibri" }
  );

  // Pull-quote — compounding effect
  s.addShape("rect", {
    x: PAD, y: 3.3, w: SLIDE_W - 2 * PAD, h: 2.1,
    fill: { color: "EFF6FF" },
  });
  s.addShape("rect", { x: PAD, y: 3.3, w: 0.08, h: 2.1, fill: { color: C.blue } });
  s.addText("The compounding effect", {
    x: PAD + 0.3, y: 3.4, w: SLIDE_W - 2 * PAD - 0.5, h: 0.4,
    color: C.ink, fontSize: 16, bold: true, fontFace: "Calibri",
  });
  s.addText(
    "Each module saves time on its own. The real win is the integrated record: a deviation auto-creates a CAPA, the CAPA auto-triggers a doc-control change, the change auto-assigns training, the training closes the loop in MRM.",
    { x: PAD + 0.3, y: 3.85, w: SLIDE_W - 2 * PAD - 0.5, h: 1.2,
      color: C.dim, fontSize: 13, fontFace: "Calibri", valign: "top" }
  );
  s.addText("One platform · one audit trail · one set of citations.", {
    x: PAD + 0.3, y: 5.0, w: SLIDE_W - 2 * PAD - 0.5, h: 0.35,
    color: C.blue, fontSize: 13, italic: true, bold: true, fontFace: "Calibri",
  });

  s.addText("Next: 10 modules — Today (manual) → With Hawkeye AI", {
    x: PAD, y: 5.8, w: SLIDE_W - 2 * PAD, h: 0.4,
    color: C.dim, fontSize: 11, italic: true, align: "center", fontFace: "Calibri",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDES 5+ — one slide per module (table-style: today | AI win)
// ─────────────────────────────────────────────────────────────────────────────
const moduleSlide = (m) => {
  const s = newSlide("2 · AI-native first", `${m.icon}  ${m.name}`);

  const colW = (SLIDE_W - 2 * PAD - 0.4) / 2;
  // TODAY column
  s.addShape("rect", {
    x: PAD, y: 1.6, w: colW, h: 3.4,
    fill: { color: "FEF2F2" },
  });
  s.addShape("rect", { x: PAD, y: 1.6, w: 0.06, h: 3.4, fill: { color: C.red } });
  s.addText("TODAY (MANUAL)", {
    x: PAD + 0.2, y: 1.7, w: colW - 0.3, h: 0.35,
    color: C.red, fontSize: 11, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(m.today, {
    x: PAD + 0.2, y: 2.1, w: colW - 0.3, h: 2.7,
    color: C.ink, fontSize: 14, fontFace: "Calibri", valign: "top",
  });

  // AI WIN column
  const x2 = PAD + colW + 0.4;
  s.addShape("rect", {
    x: x2, y: 1.6, w: colW, h: 3.4,
    fill: { color: "ECFDF5" },
  });
  s.addShape("rect", { x: x2, y: 1.6, w: 0.06, h: 3.4, fill: { color: C.green } });
  s.addText("WITH HAWKEYE AI", {
    x: x2 + 0.2, y: 1.7, w: colW - 0.3, h: 0.35,
    color: C.green, fontSize: 11, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(m.aiWin, {
    x: x2 + 0.2, y: 2.1, w: colW - 0.3, h: 2.7,
    color: C.ink, fontSize: 14, fontFace: "Calibri", valign: "top",
  });

  // Footer band — saving + citation
  s.addShape("rect", {
    x: PAD, y: 5.3, w: SLIDE_W - 2 * PAD, h: 1.4,
    fill: { color: C.panel },
    line: { color: C.border, width: 1 },
  });
  s.addText("⏱  TIME / $$ SAVED", {
    x: PAD + 0.2, y: 5.4, w: 4, h: 0.3,
    color: C.green, fontSize: 10, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(m.saving, {
    x: PAD + 0.2, y: 5.7, w: SLIDE_W / 2 - PAD - 0.2, h: 0.9,
    color: C.ink, fontSize: 13, fontFace: "Calibri", valign: "top",
  });
  s.addText("📜  REGULATORY BASIS", {
    x: SLIDE_W / 2 + 0.1, y: 5.4, w: 4, h: 0.3,
    color: C.dim, fontSize: 10, bold: true, charSpacing: 2, fontFace: "Calibri",
  });
  s.addText(m.cite, {
    x: SLIDE_W / 2 + 0.1, y: 5.7, w: SLIDE_W / 2 - PAD - 0.2, h: 0.9,
    color: C.dim, fontSize: 12, italic: true, fontFace: "Calibri", valign: "top",
  });
};
MODULES.forEach(moduleSlide);

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE — Marketplace intro
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("3 · The marketplace layer", "Discovery without the cold-email tax.");

  s.addText(MARKETPLACE.intro, {
    x: PAD, y: 1.6, w: SLIDE_W - 2 * PAD, h: 1.2,
    color: C.ink, fontSize: 15, fontFace: "Calibri",
  });

  // Two-sided arrow diagram
  const dY = 3.2;
  s.addShape("rect", { x: PAD, y: dY, w: 4, h: 2.2, fill: { color: "F5F3FF" }, line: { color: C.purple, width: 1 } });
  s.addText("BUYERS", { x: PAD, y: dY + 0.1, w: 4, h: 0.3, color: C.purple, fontSize: 10, bold: true, charSpacing: 3, align: "center", fontFace: "Calibri" });
  s.addText("Pharma companies looking for qualified CMOs (like Sanpras) and independent third-party auditors.", {
    x: PAD + 0.2, y: dY + 0.5, w: 3.6, h: 1.6, color: C.ink, fontSize: 12, fontFace: "Calibri", valign: "top",
  });

  s.addShape("rect", { x: SLIDE_W - PAD - 4, y: dY, w: 4, h: 2.2, fill: { color: "F5F3FF" }, line: { color: C.purple, width: 1 } });
  s.addText("SUPPLIERS + AUDITORS", { x: SLIDE_W - PAD - 4, y: dY + 0.1, w: 4, h: 0.3, color: C.purple, fontSize: 10, bold: true, charSpacing: 3, align: "center", fontFace: "Calibri" });
  s.addText("CMOs publish profiles built from real QMS data. Auditors publish credentials, COI, calendar, rate cards.", {
    x: SLIDE_W - PAD - 3.8, y: dY + 0.5, w: 3.6, h: 1.6, color: C.ink, fontSize: 12, fontFace: "Calibri", valign: "top",
  });

  // Centre badge — MARKETPLACE
  s.addShape("ellipse", { x: SLIDE_W / 2 - 1.2, y: dY + 0.4, w: 2.4, h: 1.4, fill: { color: C.purple }, line: { color: C.purple, width: 0 } });
  s.addText("HAWKEYE\nMARKETPLACE", { x: SLIDE_W / 2 - 1.2, y: dY + 0.55, w: 2.4, h: 1.1, color: "FFFFFF", fontSize: 14, bold: true, align: "center", valign: "middle", fontFace: "Calibri" });
  s.addShape("line", { x: PAD + 4, y: dY + 1.1, w: 1.4, h: 0, line: { color: C.purple, width: 2, endArrowType: "triangle", beginArrowType: "triangle" } });
  s.addShape("line", { x: SLIDE_W / 2 + 1.2, y: dY + 1.1, w: 1.4, h: 0, line: { color: C.purple, width: 2, endArrowType: "triangle", beginArrowType: "triangle" } });

  s.addText("Opt-in per tenant · per record. Trust signals computed from real Hawkeye activity.", {
    x: PAD, y: 5.7, w: SLIDE_W - 2 * PAD, h: 0.4,
    color: C.dim, fontSize: 11, italic: true, align: "center", fontFace: "Calibri",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDES — One per marketplace benefit (3 slides)
// ─────────────────────────────────────────────────────────────────────────────
MARKETPLACE.forSanpras.forEach((b) => {
  const s = newSlide("3 · The marketplace layer", b.title);
  s.addText(b.points.map((p) => ({ text: p, options: { bullet: true } })), {
    x: PAD, y: 1.7, w: SLIDE_W - 2 * PAD, h: 4.5,
    color: C.ink, fontSize: 15, fontFace: "Calibri", valign: "top",
    paraSpaceAfter: 12,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE — Marketplace guardrails
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("3 · The marketplace layer", "Guardrails — because we know you'll ask.");
  const cardW = (SLIDE_W - 2 * PAD - 1) / 3;
  const cardH = 3.5;
  MARKETPLACE.guardrails.forEach((g, i) => {
    const x = PAD + i * (cardW + 0.5);
    const y = 2.0;
    s.addShape("rect", { x, y, w: cardW, h: cardH, fill: { color: "F5F3FF" }, line: { color: C.purple, width: 1 } });
    s.addShape("rect", { x, y, w: cardW, h: 0.08, fill: { color: C.purple } });
    s.addText(`${i + 1}`, {
      x: x + 0.3, y: y + 0.2, w: 0.5, h: 0.5,
      color: C.purple, fontSize: 28, bold: true, fontFace: "Calibri",
    });
    s.addText(g, {
      x: x + 0.3, y: y + 0.9, w: cardW - 0.6, h: cardH - 1.1,
      color: C.ink, fontSize: 13, fontFace: "Calibri", valign: "top",
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE — §4 Part 11 + Annex 11
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("4 · 21 CFR Part 11 + Annex 11", "Built-in, not bolt-on.");
  s.addText("One evidence pack covers BOTH 21 CFR Part 11 (US) and Annex 11 (EU) — you don't pay twice when you expand markets.", {
    x: PAD, y: 1.6, w: SLIDE_W - 2 * PAD, h: 0.5,
    color: C.dim, fontSize: 12, italic: true, fontFace: "Calibri",
  });

  const rows = [[
    { text: "CONTROL", options: { bold: true, color: "FFFFFF", fill: { color: C.navy }, fontSize: 11 } },
    { text: "HOW HAWKEYE IMPLEMENTS IT", options: { bold: true, color: "FFFFFF", fill: { color: C.navy }, fontSize: 11 } },
  ], ...PART11.map((r) => [
    { text: r.ctrl, options: { bold: true, color: C.ink, fontSize: 11 } },
    { text: r.how, options: { color: C.dim, fontSize: 11 } },
  ])];

  s.addTable(rows, {
    x: PAD, y: 2.2, w: SLIDE_W - 2 * PAD,
    colW: [3.0, SLIDE_W - 2 * PAD - 3.0],
    fontFace: "Calibri",
    border: { type: "solid", pt: 0.5, color: C.border },
    rowH: 0.45,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE — §5 Privacy + security
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = newSlide("5 · Privacy + security", "Your QMS data is your most sensitive operational data.");
  const rows = [[
    { text: "AREA",    options: { bold: true, color: "FFFFFF", fill: { color: C.navy }, fontSize: 11 } },
    { text: "POSTURE", options: { bold: true, color: "FFFFFF", fill: { color: C.navy }, fontSize: 11 } },
  ], ...SECURITY.map((r) => [
    { text: r.area,   options: { bold: true, color: C.ink, fontSize: 11 } },
    { text: r.detail, options: { color: C.dim, fontSize: 11 } },
  ])];

  s.addTable(rows, {
    x: PAD, y: 1.6, w: SLIDE_W - 2 * PAD,
    colW: [2.6, SLIDE_W - 2 * PAD - 2.6],
    fontFace: "Calibri",
    border: { type: "solid", pt: 0.5, color: C.border },
    rowH: 0.42,
  });

  // India DPDP callout
  s.addShape("rect", {
    x: PAD, y: SLIDE_H - 1.4, w: SLIDE_W - 2 * PAD, h: 0.9,
    fill: { color: "ECFDF5" },
    line: { color: C.green, width: 1 },
  });
  s.addText("INDIA DPDP ACT", {
    x: PAD + 0.2, y: SLIDE_H - 1.3, w: 4, h: 0.3,
    color: C.green, fontSize: 10, bold: true, charSpacing: 3, fontFace: "Calibri",
  });
  s.addText("Data fiduciary obligations met — purpose limitation, consent records, breach reporting workflow, data-subject rights endpoints. Optional India-only data residency.", {
    x: PAD + 0.2, y: SLIDE_H - 0.95, w: SLIDE_W - 2 * PAD - 0.4, h: 0.5,
    color: C.ink, fontSize: 11, fontFace: "Calibri", valign: "top",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTERS
// ─────────────────────────────────────────────────────────────────────────────
const total = slides.length;
slides.forEach((s, i) => addFooter(s, i + 1, total));

// ─────────────────────────────────────────────────────────────────────────────
await pptx.writeFile({ fileName: OUT_PPTX });
console.log(`✓ PPTX written: ${OUT_PPTX}`);
console.log(`  ${total} slides`);
