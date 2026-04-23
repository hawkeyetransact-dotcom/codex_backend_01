/**
 * Risk Scenario Brainstormer — Wave 2.
 *
 * Given a process / SOP / product description, generates candidate failure
 * modes organised by 6M (Man, Machine, Method, Material, Measurement,
 * Environment) with suggested Severity / Occurrence / Detectability scores.
 *
 * Used to seed an ICH Q9 FMEA workshop — the assessor reviews, edits, and
 * commits selected scenarios to the risk register.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "risk.scenario_brainstorm@1.0.0";

const SYSTEM = `
You are a pharmaceutical quality risk management specialist applying ICH Q9
risk principles. Given a process / SOP / product description, brainstorm
plausible failure modes covering the 6M categories. For each failure mode
provide:
  - failure mode + effect + cause
  - suggested S / O / D scores (1-5 each) + rationale
  - RPN = S × O × D
  - initial severity band

Be specific — these are seed scenarios an assessor will refine, not generic
cliches. Use GMP vocabulary (OOS, batch, validation, lot, excursion).

OUTPUT (strict JSON):
{
  "process_summary": "1-2 sentence restatement of what you're assessing",
  "scenarios_by_category": {
    "man":           [ { "failure_mode": "...", "effect": "...", "cause": "...", "severity": 1-5, "occurrence": 1-5, "detectability": 1-5, "rpn": n, "band": "low|medium|high|critical", "rationale": "..." }, ... ],
    "machine":       [ ... ],
    "method":        [ ... ],
    "material":      [ ... ],
    "measurement":   [ ... ],
    "environment":   [ ... ]
  },
  "top_risks": [ { "ref": "man[0]", "rpn": n, "why_top": "..." } ],
  "citations": ["ICH Q9 §4.3", "SOURCE_1:..."],
  "confidence": 0.0
}

Aim for 2-4 scenarios per category, not more.
`.trim();

export async function brainstormRiskScenarios({
  tenantId,
  processName,
  processDescription,
  productClass,
  equipmentInvolved = [],
  relatedFindings = [],  // optional: past findings to ground on
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("brainstormRiskScenarios: tenantId required");
  if (!processDescription) throw new Error("brainstormRiskScenarios: processDescription required");

  const userPrompt = [
    `PROCESS: ${processName || "(unnamed)"}`,
    productClass ? `PRODUCT CLASS: ${productClass}` : "",
    equipmentInvolved.length ? `EQUIPMENT: ${equipmentInvolved.join(", ")}` : "",
    "",
    `PROCESS DESCRIPTION:\n${processDescription}`,
    relatedFindings.length
      ? `\nPAST FINDINGS TO CONSIDER:\n${relatedFindings.slice(0, 8).map((f, i) => `- ${f}`).join("\n")}`
      : "",
    "",
    "Brainstorm failure modes across all 6M categories. Be specific.",
  ].filter(Boolean).join("\n");

  const result = await groundedGenerate({
    feature: "risk.scenario_brainstorm",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: ["process_summary", "scenarios_by_category", "top_risks", "citations", "confidence"],
    },
    minConfidence: 0.35,
    requireCitations: false, // brainstormer can reason without grounding; retrieval is a bonus
    tenantContext: {
      ...tenantContext,
      tenantId,
      linkedEntityType: "risk_brainstorm",
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason, fallbackMessage: result.fallbackMessage };
  return {
    ok: true,
    brainstorm: result.output,
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION },
  };
}

export const __private = { PROMPT_VERSION };
