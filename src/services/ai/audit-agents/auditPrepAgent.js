/**
 * Audit Prep Agent.
 *
 * Given an audit's scope (product, site, audit type, supplier), drafts a
 * tailored questionnaire by:
 *   1. Fetching past audit findings for similar supplier/product combos.
 *   2. Fetching openFDA recalls + warning letters for the supplier.
 *   3. Pulling the best-matching template(s) from TemplateQuestions.
 *   4. Asking the LLM (grounded on 1+2+3) to RISK-WEIGHT each template section
 *      and propose any additional questions specific to observed risks.
 *
 * Output: a draft questionnaire (categories + questions + rationale) that
 * the auditor reviews + publishes.
 */
import mongoose from "mongoose";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";
import { compilePublicSupplierSignals } from "./publicDataFusionService.js";
import { resolveSupplier } from "./entityResolutionService.js";
import { provenanced } from "./_shared.js";

const PROMPT_VERSION = "audit.prep.questionnaire@1.0.0";

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

const SYSTEM = `
You are a pharmaceutical audit lead preparing a risk-based GMP audit questionnaire.
Given a proposed set of sections + questions (from a baseline template), past
findings, and public signals (FDA recalls, warning letters), you must:

1. Flag sections that deserve EXTRA SCRUTINY given the risk signals.
2. Propose NEW questions specifically tied to risk signals (e.g. if there's
   a recent FDA warning letter about data integrity, add questions probing
   that area).
3. Drop or deprioritise low-value sections for this audit type.
4. Every proposal must cite a SOURCE (past finding ID, FDA recall number,
   warning letter URL, or "baseline").

OUTPUT (strict JSON):
{
  "plan_summary": "2-3 sentence auditor-facing rationale for the draft",
  "sections": [
    {
      "categoryName": "Quality Management Systems",
      "priority": "high | medium | low",
      "risk_rationale": "why this priority given the signals",
      "questions": [
        { "text": "...", "source": "baseline|finding:FID|recall:RID|wl:url", "mandatory": true }
      ]
    }
  ],
  "added_questions_count": 0,
  "high_risk_signals": ["..."],
  "citations": ["finding:...", "recall:...", "wl:..."],
  "confidence": 0.0
}
`.trim();

/**
 * Find past findings similar to this audit's scope.
 */
async function loadPastFindings({ tenantId, supplierId, productClass }) {
  const Assessment = modelByName("assessments") || modelByName("Assessment");
  if (!Assessment) return [];
  const query = { tenantId };
  if (supplierId) query.supplierId = supplierId;
  const docs = await Assessment.find(query)
    .sort({ createdAt: -1 }).limit(50).select("_id findings severity createdAt categoryName").lean().catch(() => []);
  return docs;
}

/**
 * Load the best-matching baseline template questions.
 * For Wave-2 we return template 3 (PSCI SAQ) as a known-good seed.
 * TODO: match template by product class + regulatory framework.
 */
async function loadBaselineQuestions({ templateId = 3 }) {
  const TemplateQuestions = modelByName("template-questions") || modelByName("TemplateQuestions");
  if (!TemplateQuestions) return { template: null, questions: [] };
  const questions = await TemplateQuestions.find({ templateId })
    .select("_id question categoryName subCategoryName order answerType options isMandatory")
    .lean().catch(() => []);
  return { templateId, questions };
}

/**
 * Agent entry point.
 */
export async function prepareQuestionnaire({
  tenantId,
  supplierId,
  supplierName,
  productClass,
  scope,
  auditType = "GMP",
  templateId = 3,
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("prepareQuestionnaire: tenantId required");
  if (!supplierId && !supplierName) throw new Error("prepareQuestionnaire: supplierId or supplierName required");

  // Step 1 — Resolve the supplier (public vs tenant).
  const resolved = await resolveSupplier({
    tenantId,
    queryName: supplierName,
    knownSupplierId: supplierId,
    fetchPublic: true,
  }).catch((e) => ({ verdict: "unknown", error: e.message, tenantMatches: [], publicSignals: null }));

  // Step 2 — Load past findings + baseline.
  const [pastFindings, baseline] = await Promise.all([
    loadPastFindings({ tenantId, supplierId: resolved.bestTenantMatch?.recordId || supplierId, productClass }),
    loadBaselineQuestions({ templateId }),
  ]);

  // Step 3 — Build the retrieval set for the LLM.
  const retrievalSet = [];
  let sourceIdx = 0;

  // Baseline template — keep compact.
  const categories = {};
  for (const q of baseline.questions) {
    const key = q.categoryName || "Uncategorised";
    if (!categories[key]) categories[key] = [];
    categories[key].push({ id: String(q._id), text: q.question, mandatory: q.isMandatory });
  }
  retrievalSet.push({
    docId: `baseline-template:${templateId}`,
    chunkId: "sections",
    text:
      `Baseline questionnaire (template ${templateId}) sections:\n` +
      Object.entries(categories)
        .map(([cat, qs]) => `${cat}: ${qs.length} questions`)
        .join("\n"),
    score: 1,
  });

  for (const f of pastFindings.slice(0, 10)) {
    sourceIdx += 1;
    const findings = Array.isArray(f.findings) ? f.findings : [];
    retrievalSet.push({
      docId: `finding:${f._id}`,
      chunkId: f.categoryName || "generic",
      text:
        `Past finding (id ${f._id}, ${f.severity || "unknown severity"}, ${new Date(f.createdAt).toISOString().slice(0,10)}):\n` +
        findings.slice(0, 3).map((x) => `- ${(x.description || x.title || "").slice(0, 200)}`).join("\n"),
      score: 0.85,
    });
  }

  const sig = resolved.publicSignals;
  if (sig?.sources?.openFDA?.recalls?.length) {
    const recalls = sig.sources.openFDA.recalls.slice(0, 5);
    retrievalSet.push({
      docId: `openFDA:recalls`,
      chunkId: "recent",
      text:
        `FDA enforcement/recall actions for this firm:\n` +
        recalls.map((r) => `- ${r.value.recallNumber} (class ${r.value.classification}): ${r.value.reasonForRecall}`).join("\n"),
      score: 0.9,
    });
  }
  if (sig?.sources?.fdaWarningLetter?.letters?.length) {
    const wls = sig.sources.fdaWarningLetter.letters.slice(0, 5);
    retrievalSet.push({
      docId: `fdaWL`,
      chunkId: "recent",
      text:
        `FDA warning letters mentioning this firm:\n` +
        wls.map((w) => `- ${w.value.title}`).join("\n"),
      score: 0.85,
    });
  }

  // Step 4 — LLM risk-weighting.
  const userPrompt = [
    `AUDIT SCOPE:`,
    `- Supplier: ${supplierName || resolved.bestTenantMatch?.name || "(unnamed)"}`,
    `- Provenance verdict: ${resolved.verdict}`,
    `- Product class: ${productClass || "(not specified)"}`,
    `- Scope: ${scope || "full GMP audit"}`,
    `- Audit type: ${auditType}`,
    "",
    `BASELINE SECTIONS (from template ${templateId}):`,
    Object.entries(categories).map(([c, qs]) => `- ${c} (${qs.length} questions)`).join("\n"),
    "",
    `RISK SIGNAL SUMMARY:`,
    `- Past findings in our records: ${pastFindings.length}`,
    `- FDA recalls: ${sig?.summaryCounts?.recalls ?? 0}`,
    `- FDA warning letters: ${sig?.summaryCounts?.warningLetters ?? 0}`,
    `- FDA registered drugs: ${sig?.summaryCounts?.drugs ?? 0}`,
    "",
    "Produce the risk-weighted questionnaire plan. For each section, set priority, explain rationale, and either reuse baseline questions or propose 1-3 new ones. Cite sources for every additional question. If a section has no elevated risk, priority='medium' and reuse baseline.",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "audit.prep.questionnaire",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: ["plan_summary", "sections", "high_risk_signals", "citations", "confidence"],
    },
    minConfidence: 0.35,
    requireCitations: retrievalSet.length > 1,
    tenantContext: {
      ...tenantContext,
      tenantId,
      linkedEntityType: "audit_prep",
      linkedEntityId: resolved.bestTenantMatch?.recordId || supplierId || "unknown",
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  return {
    ok: result.ok,
    reason: result.reason,
    entityResolution: resolved,
    baselineTemplate: templateId,
    baselineCategories: Object.keys(categories),
    pastFindingCount: pastFindings.length,
    publicSummary: sig?.summaryCounts,
    plan: result.ok ? result.output : null,
    meta: {
      llm: result.llmMeta,
      promptVersion: PROMPT_VERSION,
    },
  };
}
