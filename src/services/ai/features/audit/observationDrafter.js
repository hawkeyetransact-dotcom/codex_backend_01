/**
 * Audit Observation Drafter — Wave 2 LLM-backed.
 *
 * Replaces the prior deterministic skeleton with a real groundedGenerate call
 * using the same envelope as capa.draft_rca:
 *   - structured output schema
 *   - mandatory citations
 *   - 0.6 confidence floor
 *   - prompt-version pinned for change-control
 *
 * Upstream caller (observationDrafterController) is responsible for building
 * the citations[] from questionnaire + standards. We pass them through to
 * groundedGenerate as the retrievalSet so the LLM is forced to pick from them.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { buildObservationPrompt } from "./observationDrafterPrompt.js";

const PROMPT_VERSION = "audit.observation@1.0.0";

export async function draftObservationLlm(args) {
  const {
    findingTitle,
    findingDetail,
    questionnaireContext = [],
    standards = [],
    retrievalSet = [],
    formalityTier,
    riskBandAtCreate,
    tenantContext,
    llmConfig,
  } = args;

  if (!findingTitle) throw new Error("draftObservationLlm: findingTitle is required");
  if (!tenantContext?.tenantId) throw new Error("draftObservationLlm: tenantContext.tenantId is required");

  const { systemPrompt, userPrompt } = buildObservationPrompt({
    findingTitle,
    findingDetail,
    questionnaireContext,
    standards,
    formalityTier,
    riskBandAtCreate,
  });

  // Build a synthetic retrievalSet from the evidence blocks so the citation gate
  // in groundedGenerate can verify the model picks supplied IDs.
  const synthRetrievalSet = [
    ...questionnaireContext.map((q) => ({
      docId: q.id,
      chunkId: q.id,
      text: `[${q.id}] ${q.question} :: ${q.answer || ""} :: ${q.note || ""}`,
      score: 1.0,
    })),
    ...standards.map((s) => ({
      docId: s.id,
      chunkId: s.id,
      text: `[${s.id}] ${s.standard}`,
      score: 1.0,
    })),
    ...retrievalSet,
  ];

  const result = await groundedGenerate({
    feature: "audit.draft_observation",
    systemPrompt,
    userPrompt,
    retrievalSet: synthRetrievalSet,
    outputSchema: {
      requiredFields: [
        "title",
        "observation",
        "classification",
        "severity",
        "recommendedCapa",
        "regulatoryClauses",
        "citations",
        "confidence",
      ],
    },
    minConfidence: 0.6,
    requireCitations: true,
    tenantContext: {
      ...tenantContext,
      linkedEntityType: tenantContext.linkedEntityType || "audit_observation",
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      fallbackMessage: result.fallbackMessage,
      auditRecord: result.auditRecord,
      llmMeta: result.llmMeta,
    };
  }

  return {
    ok: true,
    draft: {
      title: result.output.title,
      observation: result.output.observation,
      classification: result.output.classification,
      severity: result.output.severity,
      recommendedCapa: result.output.recommendedCapa,
      regulatoryClauses: result.output.regulatoryClauses || [],
      citations: result.output.citations || [],
      confidence: result.output.confidence,
    },
    meta: {
      llm: result.llmMeta,
      promptVersion: PROMPT_VERSION,
      auditRecord: result.auditRecord,
    },
  };
}

export const __private = { PROMPT_VERSION };
