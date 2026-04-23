/**
 * CAPA RCA Drafter — Wave 1 inline assist.
 *
 * Drafts a Root Cause Analysis (5-why + fishbone + proposed corrective /
 * preventive / effectiveness-check) for a CAPA from the linked deviation +
 * evidence. The draft is NEVER saved automatically — it's returned to the
 * user, who reviews, edits, and e-signs.
 *
 * Pharma prompt is grounded on FDA/ICH corpus + tenant's past accepted
 * CAPAs. Output is structured JSON with per-field citations.
 *
 * Promptversion is pinned; any change goes through change control (ISO 27k
 * and Annex 11 2026 require model/prompt version tracking).
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { buildCapaRcaPrompt } from "./capaRcaPrompt.js";

const PROMPT_VERSION = "capa.rca@1.0.0";

/**
 * @param {object} args
 * @param {string} args.deviationNarrative - what happened (free text)
 * @param {Array<{id, categoryName, question, answer}>} [args.questionnaireContext]
 * @param {Array<{docId, chunkId, text, score}>} [args.retrievalSet]  // SOPs, prior CAPAs, FDA corpus
 * @param {string} [args.batchInfo] - relevant batch metadata
 * @param {string} [args.productInfo] - product class + regulatory framework
 * @param {object} args.tenantContext - { tenantId, userId, userRole, auditId?, linkedEntityType: "capa", linkedEntityId: capaId }
 * @param {object} [args.llmConfig] - per-tenant LLM preferences
 */
export async function draftCapaRca(args) {
  const {
    deviationNarrative,
    questionnaireContext = [],
    retrievalSet = [],
    batchInfo,
    productInfo,
    tenantContext,
    llmConfig,
  } = args;

  if (!deviationNarrative) {
    throw new Error("draftCapaRca: deviationNarrative is required");
  }
  if (!tenantContext?.tenantId) {
    throw new Error("draftCapaRca: tenantContext.tenantId is required");
  }

  const { systemPrompt, userPrompt } = buildCapaRcaPrompt({
    deviationNarrative,
    questionnaireContext,
    batchInfo,
    productInfo,
  });

  const result = await groundedGenerate({
    feature: "capa.draft_rca",
    systemPrompt,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: [
        "root_cause_analysis",
        "corrective_actions",
        "preventive_actions",
        "effectiveness_check",
        "severity",
        "citations",
        "confidence",
      ],
    },
    minConfidence: 0.6,
    requireCitations: true,
    tenantContext: {
      ...tenantContext,
      linkedEntityType: tenantContext.linkedEntityType || "capa",
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  // Layer-specific presentation polish.
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      fallbackMessage: result.fallbackMessage,
      auditRecord: result.auditRecord,
    };
  }

  return {
    ok: true,
    draft: {
      rootCauseAnalysis: result.output.root_cause_analysis, // { five_why: [...], fishbone: {...}, narrative: "..." }
      correctiveActions: result.output.corrective_actions,  // [{action, owner_role, due_days}]
      preventiveActions: result.output.preventive_actions,  // [{action, owner_role, due_days}]
      effectivenessCheck: result.output.effectiveness_check, // {method, successCriteria, reviewDays}
      severity: result.output.severity,                      // "minor"|"major"|"critical"
      regulatoryClauses: result.output.regulatory_clauses || [],
      citations: result.output.citations,
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
