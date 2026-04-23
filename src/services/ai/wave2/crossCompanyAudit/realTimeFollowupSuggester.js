/**
 * Real-time Follow-up Suggester — Wave 2 implementation.
 *
 * Proposes 2-3 follow-up questions after each supplier response during a
 * live audit. Kept tight + fast (target <2s p95) by using a cheap model
 * and a short retrieval set.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "audit.followup_suggester@1.0.0";

const SYSTEM = `
You are assisting a pharmaceutical auditor during a live GMP audit. After
each supplier response, you propose 2-3 follow-up questions the auditor
should raise to probe deeper. Be specific, tied to the response, and
grounded on regulatory knowledge + supplier risk context.

OUTPUT (strict JSON, at most 3 items in suggestions):
{
  "suggestions": [
    {
      "question": "...",
      "rationale": "why this follow-up matters",
      "severity_if_unanswered": "minor | major | critical",
      "citation": "SOURCE_1:..." (optional)
    }
  ],
  "citations": [...],
  "confidence": 0.0
}
`.trim();

function buildContextBlock({ currentResponse, priorQuestionsAnswered, supplierRiskBand, supplierDossierExcerpt }) {
  const parts = [];
  parts.push(`CURRENT QUESTION: ${currentResponse.questionText || "(unknown)"}`);
  parts.push(`RESPONDENT ROLE: ${currentResponse.respondentRole || "(unknown)"}`);
  parts.push(`RESPONSE: ${currentResponse.responseText || "(empty)"}`);
  parts.push(`PRIOR QUESTIONS ANSWERED: ${priorQuestionsAnswered ?? 0}`);
  if (supplierRiskBand) parts.push(`SUPPLIER RISK BAND: ${supplierRiskBand}`);
  if (supplierDossierExcerpt) parts.push(`SUPPLIER DOSSIER EXCERPT:\n${supplierDossierExcerpt}`);
  return parts.join("\n");
}

export async function suggestFollowups({
  auditId,
  currentResponse,
  priorQuestionsAnswered,
  supplierRiskBand,
  supplierDossierExcerpt,
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantContext?.tenantId) throw new Error("suggestFollowups: tenantContext.tenantId required");
  if (!currentResponse?.responseText) {
    return { ok: false, reason: "empty_response" };
  }

  const userPrompt = [
    buildContextBlock({ currentResponse, priorQuestionsAnswered, supplierRiskBand, supplierDossierExcerpt }),
    "",
    "Propose at most 3 follow-up questions. Be specific. If no useful follow-ups, return an empty suggestions array.",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "audit.suggest_followups",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: { requiredFields: ["suggestions", "citations", "confidence"] },
    minConfidence: 0.4,
    requireCitations: retrievalSet.length > 0,
    tenantContext: {
      ...tenantContext,
      auditId,
      linkedEntityType: "audit",
      linkedEntityId: auditId,
    },
    llmConfig: llmConfig || {
      callOverride: {
        // Prefer a fast model for interactive latency.
        provider: process.env.LLM_FAST_PROVIDER || "anthropic",
        model: process.env.LLM_FAST_MODEL || "claude-haiku-4.5",
        temperature: 0.2,
        maxTokens: 900,
      },
    },
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  const suggestions = Array.isArray(result.output.suggestions) ? result.output.suggestions.slice(0, 3) : [];
  return { ok: true, suggestions, confidence: result.output.confidence, meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION } };
}

export const __private = { PROMPT_VERSION };
