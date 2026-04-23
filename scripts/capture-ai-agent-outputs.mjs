/**
 * Capture AI-agent output screenshots.
 *
 * Calls each AI agent endpoint, formats the response as a styled HTML
 * page, and takes a screenshot with Playwright. The PDF assembler picks
 * up these images alongside the UI screenshots.
 *
 * Output: frontend/demo-artifacts/walkthrough/ (merged with UI shots)
 *
 * Run:
 *   BASE=http://localhost:8888 node scripts/capture-ai-agent-outputs.mjs
 */
import "../src/config/loadEnv.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE = process.env.BASE || "http://localhost:8888";
const OUT_DIR = join(__dirname, "..", "..", "frontend", "demo-artifacts", "walkthrough");
mkdirSync(OUT_DIR, { recursive: true });

const captionsPath = join(OUT_DIR, "walkthrough.json");
let allCaptions = { captures: [], generatedAt: new Date().toISOString() };
if (existsSync(captionsPath)) {
  try { allCaptions = JSON.parse(readFileSync(captionsPath, "utf8")); } catch {}
}

let step = 100; // AI captures start at 100 so they don't collide with UI step numbers
function nextId() { step += 1; return String(step); }

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let data; try { data = await res.json(); } catch { data = { _raw: await res.text().catch(() => "") }; }
  return { status: res.status, data };
}

async function login(email, password) {
  const r = await call("POST", "/api/auth/login", { email, password });
  if (r.status !== 200 || !r.data?.token) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.data.token;
}

// ─── styled HTML shell ───────────────────────────────────────────────────
function renderHtml({ title, subtitle, persona, content, meta }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#f8fafc;margin:0;padding:0;color:#0f172a}
  .page{max-width:1200px;margin:0 auto;padding:28px}
  .head{background:linear-gradient(135deg,#4c1d95 0%,#2563eb 100%);color:#fff;padding:22px 28px;border-radius:10px;margin-bottom:18px}
  .head h1{margin:0;font-size:20px;letter-spacing:-0.01em}
  .head .sub{opacity:.9;font-size:12px;margin-top:3px}
  .head .persona{background:rgba(255,255,255,.2);display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:8px}
  .meta{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  .meta .chip{background:#eef2ff;color:#4338ca;padding:4px 10px;border-radius:10px;font-size:11px;font-weight:600}
  .meta .chip.ok{background:#dcfce7;color:#166534}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:12px}
  .card h3{margin:0 0 6px 0;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:.04em}
  .key{color:#475569;font-weight:600;font-family:Menlo,Consolas,monospace;font-size:11px}
  pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:6px;overflow:auto;font-size:11px;line-height:1.5}
  .cit{background:#f0fdf4;color:#15803d;padding:1px 6px;border-radius:3px;font-size:10px;font-family:Menlo,Consolas,monospace;margin-right:4px}
  .sev-minor{background:#dcfce7;color:#166534;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}
  .sev-major{background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}
  .sev-critical{background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}
  .prio-high{background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
  .prio-medium{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
  .prio-low{background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
  ul{margin:6px 0;padding-left:20px}
  li{margin:3px 0;font-size:12px}
  .why{padding:6px 10px;background:#faf5ff;border-left:3px solid #7c3aed;margin:4px 0;border-radius:3px;font-size:12px}
  .why b{color:#6b21a8}
  .sec{padding:10px 12px;background:#fafafa;border:1px solid #e2e8f0;border-radius:6px;margin:6px 0}
  .sec h4{margin:0 0 4px 0;font-size:12px;display:flex;align-items:center;gap:8px}
  table.kv{width:100%;border-collapse:collapse}
  table.kv td{padding:4px 10px;font-size:11px;border-bottom:1px solid #e2e8f0}
  table.kv td:first-child{color:#64748b;width:30%;font-family:Menlo,Consolas,monospace;font-size:10px}
</style>
</head><body><div class="page">
<div class="head">
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(subtitle)}</div>
  <div class="persona">Called by: ${esc(persona)}</div>
</div>
${meta ? `<div class="meta">${meta.map((m) => `<span class="chip ${m.ok ? "ok" : ""}">${esc(m.label)}: ${esc(m.value)}</span>`).join("")}</div>` : ""}
${content}
</div></body></html>`;
}

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderAndShoot(browser, { title, subtitle, persona, filename, caption, desc, meta, content }) {
  const htmlPath = join(OUT_DIR, `.tmp-${filename}.html`);
  writeFileSync(htmlPath, renderHtml({ title, subtitle, persona, content, meta }));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  const out = join(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  const id = nextId();
  allCaptions.captures.push({
    step: Number(id), id, persona, title, description: desc, file: filename, outcome: "captured", kind: "ai-output",
  });
  console.log(`  ✓ ${id} · ${persona.padEnd(12)} · ${title.slice(0, 60)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURES
// ═══════════════════════════════════════════════════════════════════════════════

const browser = await chromium.launch();

// ── 1 · Kenji · Deviation 5-why scaffolder ─────────────────────────────────
{
  const token = await login("qa.specialist@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/deviation/scaffold-five-why", {
    deviationTitle: "OOS dissolution on batch NVX-2026-B014",
    deviationDescription: "Batch NVX-2026-B014 failed dissolution: mean 76% vs NLT 80%. Retest confirmed 74%. No equipment alarm during run. Calibration in schedule.",
    detectionSource: "QC release testing",
    immediateAction: "Batch quarantined, composite retained.",
  }, token);
  const s = r.data?.scaffold;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/deviation/scaffold-five-why" },
    { label: "confidence", value: s?.confidence?.toFixed?.(2) ?? "—", ok: (s?.confidence ?? 0) >= 0.5 },
    { label: "model", value: r.data?.meta?.llm?.model ?? "—" },
    { label: "latency", value: `${r.data?.meta?.llm?.latencyMs ?? 0}ms` },
  ];
  const content = r.data.ok ? `
    <div class="card"><h3>Investigation type · 6M categorisation</h3>
      <p style="font-size:12px;margin:0">${esc(s.categorisation?.investigation_type ?? "")}</p>
    </div>
    <div class="card"><h3>5-Why probes</h3>
      ${(s.fiveWhy ?? []).map((w) => `<div class="why"><b>Why ${w.why}:</b> ${esc(w.question)}${w.probable_answer ? `<br><span style="opacity:.75">↳ ${esc(w.probable_answer)}</span>` : ""}</div>`).join("")}
    </div>
    <div class="card"><h3>Follow-up questions for the shop floor</h3>
      <ul>${(s.suggestedFollowupQuestions ?? []).map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
    </div>
  ` : `<div class="card"><p>Agent fell back: <b>${esc(r.data?.reason)}</b>.  ${esc(r.data?.message ?? "")}</p></div>`;
  await renderAndShoot(browser, {
    title: "AI output · Deviation 5-why scaffolder",
    subtitle: "Kenji (QA Specialist) lets the AI scaffold the investigation",
    persona: "Kenji", filename: "a01-kenji-deviation-5why.png",
    desc: "AI scaffolds the 5-why, categorises the investigation (process/equipment/material), and suggests specific follow-ups to raise on the shop floor. Grounded on the deviation narrative. Confidence-gated.",
    meta, content,
  });
}

// ── 2 · Kenji · CAPA RCA Drafter ────────────────────────────────────────────
{
  const token = await login("qa.specialist@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/capa/draft-rca", {
    deviationNarrative: "Batch NVX-2026-B014 failed dissolution spec (76% vs NLT 80%). QC retest confirmed 74%. Historical trend: 2 similar results last quarter on same line.",
    retrievalSet: [
      { docId: "SOP-QC-014", chunkId: "3.2", text: "Dissolution testing per USP <711>; sample size n=6; acceptance Q=80%±10%", score: 0.95 },
      { docId: "PRIOR-CAPA-042", chunkId: "findings", text: "Prior dissolution OOS traced to blending-time drift on Line 2.", score: 0.88 },
    ],
    batchInfo: "NVX-2026-B014 · Line 2 · March 2026",
    productInfo: "Novexolimus 1mg tablet · immediate-release",
  }, token);
  const d = r.data?.draft;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/capa/draft-rca" },
    { label: "confidence", value: d?.confidence?.toFixed?.(2) ?? "—", ok: (d?.confidence ?? 0) >= 0.6 },
    { label: "severity", value: d?.severity ?? "—" },
    { label: "model", value: r.data?.meta?.llm?.model ?? "—" },
    { label: "citations", value: String((d?.citations ?? []).length), ok: (d?.citations ?? []).length > 0 },
  ];
  const content = r.data.ok ? `
    <div class="card"><h3>Executive narrative</h3>
      <p style="font-size:12px">${esc(d.rootCauseAnalysis?.narrative ?? "")}</p>
    </div>
    <div class="card"><h3>5-Why chain</h3>
      ${(d.rootCauseAnalysis?.five_why ?? []).map((w) => `<div class="why"><b>Why ${w.why}:</b> ${esc(w.question)}<br><b style="color:#4c1d95">→</b> ${esc(w.answer)}${w.citation ? ` <span class="cit">${esc(w.citation)}</span>` : ""}</div>`).join("")}
    </div>
    <div class="card"><h3>Corrective actions</h3>
      ${(d.correctiveActions ?? []).map((a) => `<div class="sec"><h4><span class="prio-high">corrective</span> ${esc(a.action)}</h4><span class="key">owner: ${esc(a.owner_role)} · due in ${a.due_days}d${a.citation ? ` · ref: <span class="cit">${esc(a.citation)}</span>` : ""}</span></div>`).join("")}
    </div>
    <div class="card"><h3>Preventive actions</h3>
      ${(d.preventiveActions ?? []).map((a) => `<div class="sec"><h4><span class="prio-medium">preventive</span> ${esc(a.action)}</h4><span class="key">owner: ${esc(a.owner_role)} · due in ${a.due_days}d${a.citation ? ` · ref: <span class="cit">${esc(a.citation)}</span>` : ""}</span></div>`).join("")}
    </div>
    <div class="card"><h3>Effectiveness check</h3>
      <table class="kv">
        <tr><td>method</td><td>${esc(d.effectivenessCheck?.method)}</td></tr>
        <tr><td>success criteria</td><td>${esc(d.effectivenessCheck?.success_criteria)}</td></tr>
        <tr><td>review after</td><td>${esc(d.effectivenessCheck?.review_days)} days</td></tr>
      </table>
    </div>
    <div class="card"><h3>Regulatory clauses cited</h3>
      ${(d.regulatoryClauses ?? []).map((c) => `<span class="cit" style="margin:2px 4px;display:inline-block;font-size:11px">${esc(c)}</span>`).join("")}
    </div>
  ` : `<div class="card"><p>Agent fell back: <b>${esc(r.data?.reason)}</b>. ${esc(r.data?.message ?? "")}</p></div>`;
  await renderAndShoot(browser, {
    title: "AI output · CAPA RCA drafter",
    subtitle: "Full RCA grounded on SOP + prior CAPA + FDA corpus",
    persona: "Kenji", filename: "a02-kenji-capa-rca.png",
    desc: "AI returns a fully structured CAPA: 5-why with citations, corrective + preventive actions (each tagged with owner role + due days), effectiveness check, regulatory clauses. Every claim cites a source.",
    meta, content,
  });
}

// ── 3 · Kenji · Predictive CAPA badge ─────────────────────────────────────
{
  const token = await login("qa.specialist@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/predict/capa-outcome", {
    features: {
      slack_days: 21, owner_prior_closure_rate: 0.75, owner_avg_cycle_days: 12,
      deviation_recurrence_count: 1, linked_artifact_count: 3,
      capa_type: "corrective", severity: "major", owner_role: "QA Specialist",
      supplier_risk_band: "MEDIUM",
    },
  }, token);
  const p = r.data?.prediction;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/predict/capa-outcome" },
    { label: "P(on-time)", value: `${(p?.pOnTime * 100).toFixed(0)}%`, ok: (p?.pOnTime ?? 0) > 0.7 },
    { label: "P(effective)", value: `${(p?.pEffective * 100).toFixed(0)}%`, ok: (p?.pEffective ?? 0) > 0.6 },
    { label: "model", value: p?.modelVersion ?? "—" },
    { label: "confidence", value: p?.confidence?.toFixed?.(2) ?? "—" },
  ];
  const content = `
    <div class="card"><h3>Outcome prediction</h3>
      <div style="display:flex;gap:12px;align-items:center;margin:6px 0">
        <div style="text-align:center;padding:14px 18px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;flex:1">
          <div style="font-size:30px;font-weight:800;color:#166534">${(p.pOnTime * 100).toFixed(0)}%</div>
          <div style="font-size:11px;color:#475569">on-time closure</div>
        </div>
        <div style="text-align:center;padding:14px 18px;background:#eff6ff;border-radius:8px;border:1px solid #93c5fd;flex:1">
          <div style="font-size:30px;font-weight:800;color:#1e40af">${(p.pEffective * 100).toFixed(0)}%</div>
          <div style="font-size:11px;color:#475569">effective at close</div>
        </div>
      </div>
    </div>
    <div class="card"><h3>Top factors (what drove the prediction)</h3>
      ${(p.topFactors ?? []).map((f) => `<div class="sec"><b>${esc(f.factor)}</b> · <span class="prio-${f.direction === "positive" ? "low" : "high"}">${esc(f.direction)}</span> · contribution ${f.contribution.toFixed(2)}</div>`).join("")}
    </div>
    <div class="card"><h3>Model</h3>
      <p style="font-size:12px">Heuristic predictor v1.0 (swappable for LightGBM). Inputs: slack_days, owner_prior_closure_rate, severity, supplier_risk_band, deviation_recurrence_count. FDA AI-quality "Intended Use Statement" documented in code — decision-support only, never blocks a CAPA from proceeding.</p>
    </div>
  `;
  await renderAndShoot(browser, {
    title: "AI output · Predictive CAPA effectiveness badge",
    subtitle: "Inline badge on every CAPA · calibrated heuristic",
    persona: "Kenji", filename: "a03-kenji-predictive-capa.png",
    desc: "Shows P(on-time) and P(effective) with top factors. Used as decision-support — appears inline next to the CAPA owner field so Kenji can adjust slack before approving.",
    meta, content,
  });
}

// ── 4 · Priya · Supplier Intel (live openFDA) ─────────────────────────────
{
  const token = await login("audit.program@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/audit-agents/supplier-intel", {
    supplierName: "Sun Pharmaceutical Industries Ltd", fetchPublic: true,
  }, token);
  const d = r.data;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/audit-agents/supplier-intel" },
    { label: "verdict", value: d?.verdict ?? "—", ok: d?.verdict === "public_only" },
    { label: "tenant matches", value: String(d?.tenant?.allMatches?.length ?? 0) },
    { label: "public sources", value: Object.keys(d?.public?.sources ?? {}).filter((k) => Object.keys(d.public.sources[k]).length > 0).join(", ") || "—" },
  ];
  const pub = d?.public;
  const content = `
    <div class="card" style="border-left:4px solid #0369a1;background:#f0f9ff">
      <h3 style="color:#0369a1">Verdict · provenance note</h3>
      <p style="font-size:13px;margin:4px 0"><span class="prio-${d.verdict === "known_tenant" ? "low" : d.verdict === "unknown" ? "medium" : "high"}">${esc(d.verdict)}</span> ${esc(d.provenanceNote ?? "")}</p>
    </div>
    <div class="card" style="border-left:4px solid #0369a1;background:#f0f9ff">
      <h3 style="color:#0369a1">Tenant (registered) data</h3>
      ${d.tenant.bestMatch ? `<p style="font-size:12px">Best match: <b>${esc(d.tenant.bestMatch.name)}</b> · similarity ${d.tenant.bestMatch.similarity?.toFixed?.(2)}</p>` : `<p style="font-size:12px;color:#64748b"><i>Not in your supplier registry.</i></p>`}
    </div>
    <div class="card" style="border-left:4px solid #c2410c;background:#fff7ed">
      <h3 style="color:#c2410c">Public regulatory signals</h3>
      <div style="display:flex;gap:14px;margin:4px 0">
        <div style="text-align:center;background:#fff;padding:8px 14px;border-radius:6px;border:1px solid #fed7aa"><b style="font-size:18px;color:#c2410c">${pub?.summaryCounts?.drugs ?? 0}</b><div style="font-size:10px;color:#64748b">FDA drug regs</div></div>
        <div style="text-align:center;background:#fff;padding:8px 14px;border-radius:6px;border:1px solid #fed7aa"><b style="font-size:18px;color:#c2410c">${pub?.summaryCounts?.recalls ?? 0}</b><div style="font-size:10px;color:#64748b">recalls</div></div>
        <div style="text-align:center;background:#fff;padding:8px 14px;border-radius:6px;border:1px solid #fed7aa"><b style="font-size:18px;color:#c2410c">${pub?.summaryCounts?.warningLetters ?? 0}</b><div style="font-size:10px;color:#64748b">warning letters</div></div>
      </div>
      ${pub?.sources?.openFDA?.recalls?.length ? `<h4 style="font-size:11px;color:#64748b;text-transform:uppercase">Recent recalls</h4>${pub.sources.openFDA.recalls.slice(0, 3).map((r) => `<div class="sec">· <b>${esc(r.value.recallNumber)}</b> · class ${esc(r.value.classification)} · ${esc(r.value.reasonForRecall?.slice(0, 140))}</div>`).join("")}` : ""}
      ${pub?.sources?.fdaWarningLetter?.letters?.length ? `<h4 style="font-size:11px;color:#64748b;text-transform:uppercase">Warning letters mentioning this firm</h4>${pub.sources.fdaWarningLetter.letters.slice(0, 3).map((w) => `<div class="sec">· ${esc(w.value.title)}</div>`).join("")}` : ""}
    </div>
  `;
  await renderAndShoot(browser, {
    title: "AI output · Supplier Intel (public + tenant)",
    subtitle: "Live openFDA + FDA warning letter scrape on a real pharma firm",
    persona: "Priya", filename: "a04-priya-supplier-intel.png",
    desc: "Searched 'Sun Pharmaceutical Industries'. Tenant card (blue) is empty — not in the Novex registry. Public card (orange) is rich — openFDA returned registered drugs + recalls, FDA warning letter search returned letters mentioning the firm. Provenance unambiguous.",
    meta, content,
  });
}

// ── 5 · Priya · Audit Prep Agent ──────────────────────────────────────────
{
  const token = await login("audit.program@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/audit-agents/prepare-questionnaire", {
    supplierName: "Sun Pharmaceutical Industries Ltd",
    productClass: "API", scope: "Full GMP audit", auditType: "GMP",
  }, token);
  const p = r.data?.plan;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/audit-agents/prepare-questionnaire" },
    { label: "sections", value: String(p?.sections?.length ?? 0), ok: (p?.sections?.length ?? 0) > 0 },
    { label: "high-risk signals", value: String(p?.high_risk_signals?.length ?? 0), ok: (p?.high_risk_signals?.length ?? 0) > 0 },
    { label: "confidence", value: p?.confidence?.toFixed?.(2) ?? "—" },
  ];
  const content = r.data.ok ? `
    <div class="card"><h3>Plan summary</h3>
      <p style="font-size:12px">${esc(p.plan_summary ?? "")}</p>
    </div>
    <div class="card"><h3>High-risk signals flagged from public data</h3>
      <ul>${(p.high_risk_signals ?? []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </div>
    <div class="card"><h3>Risk-weighted sections</h3>
      ${(p.sections ?? []).map((s) => `<div class="sec"><h4><span class="prio-${s.priority}">${esc(s.priority)}</span> ${esc(s.categoryName)}</h4><span style="font-size:11px;color:#64748b">${esc(s.risk_rationale)}</span><br><span class="key">${s.questions?.length ?? 0} questions</span></div>`).join("")}
    </div>
  ` : `<div class="card"><p>Agent fell back: <b>${esc(r.data?.reason)}</b></p></div>`;
  await renderAndShoot(browser, {
    title: "AI output · Audit Prep Agent (risk-weighted questionnaire)",
    subtitle: "Priya gets a tailored questionnaire in 10 seconds",
    persona: "Priya", filename: "a05-priya-audit-prep.png",
    desc: "AI pulls past findings + openFDA recalls + warning letters + baseline template, risk-weights each section (high/medium/low), flags FDA-visible risks (data integrity, OOS investigation, aseptic). Every question cites its source.",
    meta, content,
  });
}

// ── 6 · James · Drift monitor dashboard ───────────────────────────────────
{
  const token = await login("qa.head@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("GET", "/api/ai/drift/dashboard", null, token);
  const snaps = r.data?.snapshots || [];
  const meta = [
    { label: "endpoint", value: "GET /api/ai/drift/dashboard" },
    { label: "metrics tracked", value: String(snaps.length), ok: snaps.length > 0 },
    { label: "open alerts", value: String(r.data?.openAlertCount ?? 0) },
  ];
  const fmt = (v, m) => v == null ? "—" : m === "latencyP95Pct" ? `${Math.round(v)}ms` : `${(v * 100).toFixed(1)}%`;
  const content = `
    <div class="card"><h3>AI feature quality metrics</h3>
      <table class="kv">
        <tr><td><b>Feature</b></td><td><b>Metric</b></td><td><b>Current</b></td><td><b>Baseline</b></td><td><b>Status</b></td></tr>
        ${snaps.slice(0, 14).map((s) => `<tr>
          <td style="font-family:Menlo,Consolas,monospace;font-size:10px">${esc(s.feature)}</td>
          <td style="font-size:11px">${esc(s.metric)}</td>
          <td style="text-align:right">${fmt(s.currentValue, s.metric)}</td>
          <td style="text-align:right">${s.baselineValue != null ? fmt(s.baselineValue, s.metric) : "—"}</td>
          <td>${s.alertRaised ? `<span class="prio-high">drift</span>` : `<span class="prio-low">ok</span>`}</td>
        </tr>`).join("")}
      </table>
    </div>
    <div class="card"><h3>Governance posture</h3>
      <p style="font-size:12px">Any metric that drifts >5pp week-over-week auto-pauses the feature behind a flag. ISO 42001-grade AI governance baked into the platform.</p>
    </div>
  `;
  await renderAndShoot(browser, {
    title: "AI output · Drift Monitor Dashboard",
    subtitle: "Head-of-QA oversight · grounded-rate · acceptance · latency · failures",
    persona: "James", filename: "a06-james-drift-dashboard.png",
    desc: "Continuous per-feature quality monitoring. Grounded-rate, user-acceptance, latency p95, tool failure rate — current vs 7-day baseline. Alerts fire on drift. This is what keeps AI honest in a regulated environment.",
    meta, content,
  });
}

// ── 7 · James · Signal alerts ─────────────────────────────────────────────
{
  const token = await login("qa.head@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("GET", "/api/ai/signals", null, token);
  const alerts = r.data?.alerts || [];
  const meta = [
    { label: "endpoint", value: "GET /api/ai/signals" },
    { label: "open alerts", value: String(alerts.length), ok: alerts.length > 0 },
  ];
  const content = `
    <div class="card"><h3>Deviation signal alerts (clustering + z-score)</h3>
      ${alerts.length ? alerts.map((a) => `<div class="sec" style="border-left:3px solid #dc2626;background:#fef2f2">
        <h4><b style="font-family:Menlo,Consolas,monospace">${esc(a.clusterKey)}</b> · <span class="prio-high">z=${Number(a.zScore ?? 0).toFixed(1)}</span></h4>
        <div style="font-size:11px;color:#475569">cluster size: ${a.clusterSize ?? 0} · shared feature: <b>${esc(a.sharedFeature ?? "—")}</b> · baseline: ${Number(a.baselineFrequency ?? 0).toFixed(2)}/window · current: ${a.currentFrequency ?? 0}</div>
        ${a.members?.length ? `<details style="margin-top:6px"><summary style="font-size:11px;color:#64748b;cursor:pointer">members</summary>${a.members.slice(0, 5).map((m) => `<div style="font-size:10px;padding:2px 0">· ${esc(m.deviationNumber ?? m.title ?? JSON.stringify(m))}</div>`).join("")}</details>` : ""}
      </div>`).join("") : `<p style="font-size:12px;color:#64748b">No open alerts — clean tenant.</p>`}
    </div>
    <div class="card"><h3>How this works</h3>
      <p style="font-size:12px">Daily job clusters new deviations by shared feature (equipment, material lot, operator, SOP, supplier). If a cluster has ≥3 recent deviations AND z-score >2.0 vs 180-day baseline, raise an alert. Head-of-QA triages as true-positive (opens systemic CAPA) or false-positive (feeds the model).</p>
    </div>
  `;
  await renderAndShoot(browser, {
    title: "AI output · Deviation Signal Alerts",
    subtitle: "Emerging-trend detection before it becomes systemic",
    persona: "James", filename: "a07-james-signal-alerts.png",
    desc: "The platform clusters recent deviations and flags emerging trends with z-score vs 6-month baseline. Seeded demo shows a cluster on equipment NVX-PRESS-001 with z=3.4 and 3 members. Head-of-QA decides true/false positive.",
    meta, content,
  });
}

// ── 8 · Elena · MRM Input Populator ───────────────────────────────────────
{
  const token = await login("vp.quality@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/mrm/populate-inputs", { reviewType: "quarterly", windowDays: 90 }, token);
  const n = r.data?.narrative;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/mrm/populate-inputs" },
    { label: "input sections", value: String(n?.input_sections?.length ?? 0), ok: (n?.input_sections?.length ?? 0) > 0 },
    { label: "suggested actions", value: String(n?.suggested_action_items?.length ?? 0) },
    { label: "adequacy verdict", value: n?.adequacy_verdict ?? "—" },
    { label: "confidence", value: n?.confidence?.toFixed?.(2) ?? "—" },
  ];
  const content = r.data.ok ? `
    <div class="card"><h3>Executive pre-read</h3>
      <p style="font-size:12px">${esc(n.exec_preread ?? "")}</p>
    </div>
    <div class="card"><h3>Input sections (aggregated from modules)</h3>
      ${(n.input_sections ?? []).map((s) => `<div class="sec">
        <h4>${esc(s.title)} · <span class="prio-${s.trend === "improved" ? "low" : s.trend === "worsened" ? "high" : "medium"}">${esc(s.trend)}</span></h4>
        <div style="font-size:11px">${esc(s.narrative)}</div>
        ${s.recommendation ? `<div style="font-size:10px;color:#64748b;margin-top:4px"><b>Recommendation:</b> ${esc(s.recommendation)}</div>` : ""}
      </div>`).join("")}
    </div>
    <div class="card"><h3>Suggested action items</h3>
      ${(n.suggested_action_items ?? []).map((a) => `<div class="sec"><b>${esc(a.action)}</b> · <span class="prio-${a.priority}">${esc(a.priority)}</span> · owner: ${esc(a.owner_role)} · due in ${a.due_days}d</div>`).join("")}
    </div>
    <div class="card" style="background:${n.adequacy_verdict === "ADEQUATE" ? "#f0fdf4" : n.adequacy_verdict === "INADEQUATE" ? "#fef2f2" : "#fffbeb"};border-left:3px solid ${n.adequacy_verdict === "ADEQUATE" ? "#166534" : n.adequacy_verdict === "INADEQUATE" ? "#991b1b" : "#c2410c"}">
      <h3>Adequacy verdict: ${esc(n.adequacy_verdict)}</h3>
      <p style="font-size:12px">${esc(n.verdict_rationale ?? "")}</p>
    </div>
  ` : `<div class="card"><p>Agent fell back: <b>${esc(r.data?.reason)}</b></p></div>`;
  await renderAndShoot(browser, {
    title: "AI output · Management Review Input Populator",
    subtitle: "Elena (VP Quality) opens the quarterly MRM with one click",
    persona: "Elena", filename: "a08-elena-mrm-populator.png",
    desc: "Aggregates CAPA aging + deviation trends + audit program status + training compliance + supplier risk + equipment calibration. AI narrates each section with citations. Returns a draft adequacy verdict and suggested action items.",
    meta, content,
  });
}

// ── 9 · Regulatory Impact Classifier ───────────────────────────────────────
{
  const token = await login("regulatory@novex-pharma.demo", "EqmsDemo@2026");
  const r = await call("POST", "/api/ai/change-control/classify-impact", {
    changeType: "SUPPLIER",
    description: "Replace magnesium stearate supplier from Supplier A to Supplier B for Novexolimus 1mg IR tablet due to Supplier A's exit. Supplier B is FDA-registered but has not supplied material for this product class previously. Same pharmacopeial grade, similar specification.",
    riskLevel: "HIGH",
    affectedProducts: ["Novexolimus 1mg IR"],
    affectedMarkets: ["US", "EU"],
  }, token);
  const c = r.data?.classification;
  const meta = [
    { label: "endpoint", value: "POST /api/ai/change-control/classify-impact" },
    { label: "US filing", value: c?.us_classification ?? "—" },
    { label: "EU filing", value: c?.eu_classification ?? "—" },
    { label: "risk", value: c?.risk_level ?? "—" },
    { label: "confidence", value: c?.confidence?.toFixed?.(2) ?? "—" },
  ];
  const content = r.data.ok ? `
    <div class="card"><h3>US classification</h3>
      <p><span class="prio-${c.us_classification === "pas" ? "high" : c.us_classification === "cbe_30" ? "medium" : "low"}">${esc(c.us_classification)}</span></p>
      <p style="font-size:12px">${esc(c.us_reasoning)}</p>
      <div>${(c.us_filing_citations ?? []).map((x) => `<span class="cit">${esc(x)}</span>`).join("")}</div>
    </div>
    <div class="card"><h3>EU classification</h3>
      <p><span class="prio-${c.eu_classification?.includes("major") ? "high" : c.eu_classification?.includes("minor") ? "medium" : "low"}">${esc(c.eu_classification)}</span></p>
      <p style="font-size:12px">${esc(c.eu_reasoning)}</p>
      <div>${(c.eu_filing_citations ?? []).map((x) => `<span class="cit">${esc(x)}</span>`).join("")}</div>
    </div>
    <div class="card"><h3>Implementation blockers</h3>
      <ul>${(c.implementation_blockers ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>
    <div class="card"><h3>Recommended actions</h3>
      <ul>${(c.recommended_actions ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    </div>
  ` : `<div class="card"><p>Agent fell back: <b>${esc(r.data?.reason)}</b></p></div>`;
  await renderAndShoot(browser, {
    title: "AI output · Regulatory Impact Classifier",
    subtitle: "Marcus (Regulatory) classifies a supplier-change in 4 seconds",
    persona: "Marcus", filename: "a09-marcus-reg-impact.png",
    desc: "For a proposed supplier change, AI classifies against 21 CFR 314.70 (US: CBE-30/PAS/annual_report) AND the EU Variation Regulation (IA/minor/major). Cites specific paragraphs. Lists implementation blockers + recommended filings.",
    meta, content,
  });
}

// ── Save + close ─────────────────────────────────────────────────────────
await browser.close();
allCaptions.generatedAt = new Date().toISOString();
writeFileSync(captionsPath, JSON.stringify(allCaptions, null, 2));
console.log(`\n✓ captured ${allCaptions.captures.filter((c) => c.outcome === "captured").length} total images`);
console.log(`  → ${OUT_DIR}`);
