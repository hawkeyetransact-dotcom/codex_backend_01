/**
 * Deviation 5-Why Scaffolder — Wave 1 inline assist.
 *
 * A lighter companion to capaRcaDrafter. Used on the deviation form itself
 * (before a CAPA is opened) to help the investigator structure their
 * thinking. Output is a scaffold — not a final RCA.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { buildDeviationFiveWhyPrompt } from "./deviationFiveWhyPrompt.js";
import { buildSupplierContextForAi } from "../../../crossModule/supplierQualityEventService.js";

const PROMPT_VERSION = "deviation.five_why@1.1.0";

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
    supplierId,             // NEW — pulls supplier history into the prompt
    tenantOrgKey,           // optional — for V1 CAPA scoping
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

  const { systemPrompt, userPrompt: basePrompt } = buildDeviationFiveWhyPrompt({
    deviationTitle,
    deviationDescription,
    detectionSource,
    immediateAction,
  });

  // Append supplier history block (small, headline-only) so the agent can
  // surface systemic patterns ("this mirrors supplier X's prior failure").
  const supplierContext = await buildSupplierContextForAi({
    tenantId: tenantContext.tenantId, tenantOrgKey, supplierId,
  }).catch(() => null);
  const supplierBlock = supplierContext
    ? [
        "",
        "SUPPLIER HISTORY (look for systemic root-cause patterns):",
        `  Open: ${supplierContext.open.capas} CAPAs · ${supplierContext.open.deviations} deviations · ${supplierContext.open.complaints} complaints`,
        `  Recently closed (90d): ${supplierContext.recentlyClosed.capas} CAPAs · ${supplierContext.recentlyClosed.deviations} deviations`,
        ...(supplierContext.topOpenDeviations.length ? ["  Top open deviations:", ...supplierContext.topOpenDeviations.map((d) => `    - [${d.classification}] ${d.title}${d.lot ? ` (lot ${d.lot})` : ""}`)] : []),
      ].join("\n")
    : "";
  const userPrompt = supplierBlock ? `${basePrompt}\n${supplierBlock}` : basePrompt;

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
