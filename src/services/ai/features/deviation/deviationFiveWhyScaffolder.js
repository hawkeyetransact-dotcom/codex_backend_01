/**
 * Deviation 5-Why Scaffolder — Wave 1 inline assist.
 *
 * A lighter companion to capaRcaDrafter. Used on the deviation form itself
 * (before a CAPA is opened) to help the investigator structure their
 * thinking. Output is a scaffold — not a final RCA.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { buildDeviationFiveWhyPrompt } from "./deviationFiveWhyPrompt.js";

const PROMPT_VERSION = "deviation.five_why@1.0.0";

/**
 * @param {object} args
 * @param {string} args.deviationTitle
 * @param {string} args.deviationDescription
 * @param {string} [args.detectionSource]
 * @param {string} [args.immediateAction]
 * @param {Array} [args.retrievalSet]
 * @param {object} args.tenantContext
 * @param {object} [args.llmConfig]
 */
export async function scaffoldFiveWhy(args) {
  const {
    deviationTitle,
    deviationDescription,
    detectionSource,
    immediateAction,
    retrievalSet = [],
    tenantContext,
    llmConfig,
  } = args;

  if (!deviationDescription) {
    throw new Error("scaffoldFiveWhy: deviationDescription is required");
  }
  if (!tenantContext?.tenantId) {
    throw new Error("scaffoldFiveWhy: tenantContext.tenantId is required");
  }

  const { systemPrompt, userPrompt } = buildDeviationFiveWhyPrompt({
    deviationTitle,
    deviationDescription,
    detectionSource,
    immediateAction,
  });

  const result = await groundedGenerate({
    feature: "deviation.scaffold_five_why",
    systemPrompt,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: [
        "five_why",
        "suggested_followup_questions",
        "categorisation",
        "citations",
        "confidence",
      ],
    },
    minConfidence: 0.35, // lower floor — scaffold quality; investigator edits anyway
    requireCitations: retrievalSet.length > 0, // don't enforce citations if no KB given
    tenantContext: {
      ...tenantContext,
      linkedEntityType: tenantContext.linkedEntityType || "deviation",
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
    };
  }

  return {
    ok: true,
    scaffold: {
      fiveWhy: result.output.five_why, // [{why:1, question, probableAnswer, citation?}]
      suggestedFollowupQuestions: result.output.suggested_followup_questions,
      categorisation: result.output.categorisation, // { investigationType, likelyContributors: [...] }
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
