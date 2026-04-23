/**
 * Regulatory Impact Classifier — Wave 2.
 *
 * Classifies a change-control request as:
 *   - "notifiable"     (internal notification only · no regulatory filing)
 *   - "cbe_0"          (Changes Being Effected immediately · minor)
 *   - "cbe_30"         (Changes Being Effected in 30 days)
 *   - "pas"            (Prior Approval Supplement · major)
 *   - "annual_report"  (Type II minor)
 *   - "major_eu_variation" | "minor_eu_variation" | "iavariation"  (EU)
 *
 * Grounded on FDA 21 CFR 314.70 and EU Variation Regulations guidance.
 * The output is a *draft* — the regulatory lead reviews + confirms.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "change.regulatory_impact@1.0.0";

const SYSTEM = `
You are a pharmaceutical regulatory affairs specialist. You classify a
proposed change-control request against FDA 21 CFR 314.70 (US filing
categories) and the EU Variation Regulation No 1234/2008.

Classification categories (pick ONE per region):
- FDA: "notifiable" | "cbe_0" | "cbe_30" | "pas" | "annual_report"
- EU:  "iavariation" | "minor_eu_variation" | "major_eu_variation"

Be conservative — if unsure between a higher and lower tier, pick the higher
tier and explain why. Never invent regulatory citations.

OUTPUT (strict JSON):
{
  "us_classification": "notifiable|cbe_0|cbe_30|pas|annual_report",
  "us_reasoning": "1-2 sentences",
  "us_filing_citations": ["21 CFR 314.70(b)(2)(i)", ...],
  "eu_classification": "iavariation|minor_eu_variation|major_eu_variation",
  "eu_reasoning": "1-2 sentences",
  "eu_filing_citations": ["Commission Reg (EC) 1234/2008 Annex I, ..."],
  "risk_level": "low|medium|high|critical",
  "implementation_blockers": ["supplement acceptance", "30-day waiting period", ...],
  "recommended_actions": ["Prepare CBE-30 package", "Update DMF", ...],
  "citations": ["SOURCE_1:..."],
  "confidence": 0.0
}
`.trim();

const CHANGE_TYPE_HINTS = {
  DOCUMENT: "Document-only change. Usually 'notifiable' unless the doc controls a regulated spec.",
  PROCESS: "Process / method change. Often CBE-30 or PAS depending on severity.",
  SUPPLIER: "Supplier change (API supplier, excipient, packaging). Usually CBE-30 for substitutes; PAS for unapproved suppliers.",
  PRODUCT: "Product / formulation change. Typically PAS.",
  SYSTEM: "Computer system / quality system change. Usually 'notifiable' unless it affects GMP-controlled records.",
};

export async function classifyChangeImpact({
  tenantId,
  changeControlId,
  changeType,
  description,
  riskLevel,
  affectedProducts = [],
  affectedMarkets = [],
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("classifyChangeImpact: tenantId required");
  if (!description) throw new Error("classifyChangeImpact: description required");

  const userPrompt = [
    `CHANGE TYPE: ${changeType || "(unspecified)"}`,
    changeType ? `TYPE HINT: ${CHANGE_TYPE_HINTS[changeType] || "(no hint)"}` : "",
    `TENANT-ASSERTED RISK LEVEL: ${riskLevel || "(unspecified)"}`,
    affectedProducts.length ? `AFFECTED PRODUCTS: ${affectedProducts.join(", ")}` : "",
    affectedMarkets.length ? `AFFECTED MARKETS: ${affectedMarkets.join(", ")}` : "",
    "",
    `CHANGE DESCRIPTION:\n${description}`,
    "",
    "Classify this change against FDA 21 CFR 314.70 and the EU Variation Regulation. Be conservative.",
  ].filter(Boolean).join("\n");

  const result = await groundedGenerate({
    feature: "change.regulatory_impact",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: [
        "us_classification", "us_reasoning", "eu_classification", "eu_reasoning",
        "risk_level", "recommended_actions", "citations", "confidence",
      ],
    },
    minConfidence: 0.45,
    requireCitations: retrievalSet.length > 0,
    tenantContext: {
      ...tenantContext,
      tenantId,
      linkedEntityType: "change_control",
      linkedEntityId: changeControlId,
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason, fallbackMessage: result.fallbackMessage };
  return {
    ok: true,
    classification: result.output,
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION },
  };
}

export const __private = { PROMPT_VERSION, CHANGE_TYPE_HINTS };
