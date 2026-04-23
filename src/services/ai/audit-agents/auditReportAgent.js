/**
 * Audit Report Agent.
 *
 * Assembles a final audit report from:
 *   - Audit request / scope metadata
 *   - Findings (observations)
 *   - Linked evidence references
 *   - CAPAs opened
 *   - Public-data context (optional risk appendix)
 *
 * Output: structured report object + HTML + optional PDF (Playwright render).
 * Saves a SHA-256 integrity hash with the stored report so any downstream
 * ledger anchor (out-of-scope per user) can verify tamper-free.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "audit.report.exec_summary@1.0.0";

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Hash any string content with SHA-256. Returned hex.
 * Downstream ledger anchoring (Rekor, Polygon, etc) uses this.
 */
export function contentHash(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

/**
 * Load the full context needed to render a report.
 */
async function loadReportContext({ tenantId, auditId }) {
  const AuditRequest = modelByName("audit-requests-master");
  const Assessment = modelByName("assessments") || modelByName("Assessment");
  const Evidence = modelByName("evidence") || modelByName("Evidence");
  const Capa = modelByName("Capa") || modelByName("capas");

  // Handle both modern (tenantId) and legacy (tenant_id) field names.
  const tenantFilter = { $or: [{ tenantId }, { tenant_id: tenantId }] };
  const audit = AuditRequest
    ? await AuditRequest.findOne({ _id: auditId, ...tenantFilter }).lean().catch(() => null)
    : null;
  const assessments = Assessment
    ? await Assessment.find({ auditRequestId: auditId, ...tenantFilter }).lean().catch(() => [])
    : [];
  const evidence = Evidence
    ? await Evidence.find({ auditRequestId: auditId, ...tenantFilter }).lean().catch(() => [])
    : [];
  const capas = Capa
    ? await Capa.find({ auditRequestId: auditId, ...tenantFilter }).lean().catch(() => [])
    : [];

  return { audit, assessments, evidence, capas };
}

/**
 * Build the report — structured output + HTML + hash.
 */
export async function assembleReport({ tenantId, auditId, tenantContext, llmConfig } = {}) {
  if (!tenantId || !auditId) throw new Error("assembleReport: tenantId + auditId required");

  const ctx = await loadReportContext({ tenantId, auditId });
  if (!ctx.audit) {
    return { ok: false, reason: "audit_not_found", auditId };
  }

  const findings = ctx.assessments.flatMap((a) => (a.findings || []).map((f) => ({
    ...f,
    assessmentId: String(a._id),
    category: a.categoryName,
  })));

  // ── LLM: exec summary grounded on the structured audit facts ────────────
  const retrievalSet = [
    {
      docId: `audit:${auditId}`,
      chunkId: "scope",
      text: [
        `Audit scope for ${auditId}:`,
        `- Buyer: ${ctx.audit.buyer_id}`,
        `- Supplier: ${ctx.audit.supplier_id}`,
        `- Product: ${ctx.audit.supplier_product_id}`,
        `- Site: ${ctx.audit.site_id}`,
        `- trackStatus: ${ctx.audit.trackStatus}`,
        `- supplierDecision: ${ctx.audit.supplierDecision}`,
        `- auditorDecision: ${ctx.audit.auditorDecision}`,
      ].join("\n"),
      score: 1,
    },
    {
      docId: `audit:${auditId}:findings`,
      chunkId: "findings",
      text: findings.length
        ? findings
            .slice(0, 10)
            .map((f) => `- [${f.severity || "minor"}] ${(f.title || f.description || "").slice(0, 180)}`)
            .join("\n")
        : "(no findings recorded)",
      score: 0.95,
    },
    {
      docId: `audit:${auditId}:capas`,
      chunkId: "capas",
      text: ctx.capas.length
        ? ctx.capas.slice(0, 10).map((c) => `- ${c.capaNumber || c._id} · ${c.severity} · status ${c.status}`).join("\n")
        : "(no CAPAs opened)",
      score: 0.85,
    },
  ];

  const result = await groundedGenerate({
    feature: "audit.report.assemble",
    systemPrompt:
      "You are a pharmaceutical audit report writer. Produce a structured report grounded " +
      "on the SOURCES only. No speculation. Every observation cites a SOURCE.",
    userPrompt: [
      `Assemble a report for audit ${auditId}.`,
      "Return strict JSON with fields:",
      `{
        "executive_summary": "3-5 sentence narrative",
        "scope_recap": "1-2 sentences",
        "findings_overview": "summary by severity",
        "capa_overview": "how many CAPAs opened, statuses",
        "recommendations": ["..."],
        "regulatory_alignment": ["21 CFR ...", "ICH Q7 ..."],
        "risk_trend": "improved|stable|worsened|insufficient_data",
        "citations": ["SOURCE_1:...", ...],
        "confidence": 0..1
      }`,
    ].join("\n"),
    retrievalSet,
    outputSchema: {
      requiredFields: ["executive_summary", "scope_recap", "findings_overview", "citations", "confidence"],
    },
    minConfidence: 0.35,
    requireCitations: true,
    tenantContext: { ...tenantContext, tenantId, linkedEntityType: "audit_report", linkedEntityId: auditId },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  const structuredReport = {
    auditId,
    audit: {
      internalRequestId: ctx.audit.internalRequestId,
      trackStatus: ctx.audit.trackStatus,
      supplierDecision: ctx.audit.supplierDecision,
      auditorDecision: ctx.audit.auditorDecision,
      createdAt: ctx.audit.createdAt,
    },
    summary: result.ok ? result.output : null,
    counts: {
      findings: findings.length,
      findingsBySeverity: summariseBy(findings, "severity"),
      evidence: ctx.evidence.length,
      capas: ctx.capas.length,
      capasByStatus: summariseBy(ctx.capas, "status"),
    },
    findings: findings.slice(0, 50),
    capas: ctx.capas.slice(0, 50).map((c) => ({
      capaNumber: c.capaNumber || String(c._id),
      status: c.status,
      severity: c.severity,
      rootCause: c.rootCause?.slice?.(0, 160),
      dueDate: c.dueDate,
    })),
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    aiConfidence: result.output?.confidence ?? null,
    fallbackReason: result.ok ? undefined : result.reason,
  };

  const html = renderHtml(structuredReport);
  const integrityHash = contentHash(html);

  return {
    ok: true,
    report: structuredReport,
    html,
    integrityHash,
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION },
  };
}

function summariseBy(items, field) {
  const m = {};
  for (const x of items || []) {
    const k = (x && x[field]) || "unspecified";
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function renderHtml(r) {
  const sev = r.counts.findingsBySeverity || {};
  const capaStatus = r.counts.capasByStatus || {};
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Audit Report · ${esc(r.auditId)}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;line-height:1.55;color:#0f172a;max-width:1000px;margin:0 auto;padding:28px}
  h1{font-size:22px;margin:0 0 8px 0}
  h2{font-size:16px;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #2563eb}
  h3{font-size:13px;margin:12px 0 4px;color:#475569;text-transform:uppercase;letter-spacing:.04em}
  .cover{background:linear-gradient(135deg,#1e3a8a,#7c3aed);color:#fff;padding:28px;border-radius:10px;margin-bottom:16px}
  .meta{display:flex;gap:14px;font-size:11px;margin-top:8px;opacity:.9}
  .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
  .kpi div{background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
  .kpi b{display:block;font-size:20px;color:#2563eb}
  .finding{border-left:4px solid #f59e0b;background:#fafafa;padding:8px 12px;margin:6px 0;border-radius:4px}
  .finding.critical{border-left-color:#dc2626}
  .finding.major{border-left-color:#f59e0b}
  .finding.minor{border-left-color:#059669}
  code{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-family:Menlo,Consolas,monospace;font-size:11px}
  .hash{font-family:monospace;font-size:10px;word-break:break-all;color:#64748b}
</style></head><body>
<div class="cover">
  <h1>Audit Report</h1>
  <div>${esc(r.audit?.internalRequestId || r.auditId)}</div>
  <div class="meta">
    <span>generated ${esc(r.generatedAt)}</span>
    <span>AI confidence: ${r.aiConfidence != null ? r.aiConfidence.toFixed(2) : "—"}</span>
    <span>prompt: ${esc(r.promptVersion)}</span>
  </div>
</div>
<h2>Executive Summary</h2>
<p>${esc(r.summary?.executive_summary || "(AI draft unavailable: " + (r.fallbackReason || "-") + ")")}</p>
<h2>Scope</h2>
<p>${esc(r.summary?.scope_recap || "")}</p>
<p><code>audit ${esc(r.auditId)}</code> · trackStatus <code>${esc(r.audit?.trackStatus)}</code> · supplierDecision <code>${esc(r.audit?.supplierDecision)}</code> · auditorDecision <code>${esc(r.audit?.auditorDecision)}</code></p>
<h2>Key Metrics</h2>
<div class="kpi">
  <div><b>${r.counts.findings}</b><div>findings</div></div>
  <div><b>${sev.critical||0}/${sev.major||0}/${sev.minor||0}</b><div>crit/maj/min</div></div>
  <div><b>${r.counts.capas}</b><div>CAPAs</div></div>
  <div><b>${r.counts.evidence}</b><div>evidence items</div></div>
</div>
<h2>Findings</h2>
${r.findings.map(f => `<div class="finding ${esc(f.severity || 'minor')}"><b>[${esc(f.severity || 'minor')}]</b> ${esc(f.title || f.description || '')}</div>`).join("") || "<p>No findings recorded.</p>"}
<h2>CAPAs</h2>
${r.capas.map(c => `<p><code>${esc(c.capaNumber)}</code> · ${esc(c.severity||'')} · ${esc(c.status||'')} · ${esc(c.rootCause||'')}</p>`).join("") || "<p>No CAPAs opened.</p>"}
${r.summary?.recommendations?.length ? `<h2>Recommendations</h2><ul>${r.summary.recommendations.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${r.summary?.regulatory_alignment?.length ? `<h2>Regulatory alignment</h2><p>${r.summary.regulatory_alignment.map(esc).join(" · ")}</p>` : ""}
${r.summary?.risk_trend ? `<h2>Risk trend</h2><p><code>${esc(r.summary.risk_trend)}</code></p>` : ""}
<h2>Citations</h2>
<p class="hash">${(r.summary?.citations || []).map(esc).join(" · ")}</p>
<h2>Integrity</h2>
<p class="hash">SHA-256 of this report: <code class="hash" id="hash">(computed on save)</code></p>
</body></html>`;
}

export const __private = { PROMPT_VERSION, summariseBy };
