/**
 * Deviation Disposition Drafter — Wave 2.
 *
 * After investigation completes, drafts the QA disposition memo:
 *   - dispositionDecision (RELEASE / REJECT / REWORK / REPROCESS / QUARANTINE)
 *   - justification narrative with regulatory clause citations
 *   - residualRiskNotes (per ICH Q9)
 *
 * Mandatory citations to: rootCause [R1], impactAssessment [I1], cited
 * standards [S1..Sn].
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "deviation.draft_disposition@1.0.0";

const DISPOSITION_ENUM = ["RELEASE", "REJECT", "REWORK", "REPROCESS", "QUARANTINE", "PENDING", "NOT_APPLICABLE"];
const DEFAULT_STANDARDS = ["21_CFR_211_192", "ICH_Q7_§13", "ICH_Q9_R1", "EU_GMP_Ch_1"];

export async function draftDeviationDisposition(args) {
  const { deviation, citedStandards = DEFAULT_STANDARDS, tenantContext, llmConfig } = args;
  if (!deviation) throw new Error("draftDeviationDisposition: deviation required");
  if (!tenantContext?.tenantId) throw new Error("tenantContext.tenantId required");

  const rootCause = deviation.investigation?.rootCause || "";
  const impact = [
    deviation.impactAssessment?.productQualityImpact ? `Product quality: ${deviation.impactAssessment.productQualityImpact}` : null,
    deviation.impactAssessment?.patientSafetyImpact ? `Patient safety: ${deviation.impactAssessment.patientSafetyImpact}` : null,
    deviation.impactAssessment?.regulatoryImpact ? `Regulatory: ${deviation.impactAssessment.regulatoryImpact}` : null,
  ].filter(Boolean).join(" | ");

  const retrievalSet = [
    { docId: "R1", chunkId: "R1", text: `[R1] Root cause: ${rootCause || "(not yet identified)"}`, score: 1.0 },
    { docId: "I1", chunkId: "I1", text: `[I1] Impact: ${impact || "(not assessed)"}`, score: 1.0 },
    { docId: "N1", chunkId: "N1", text: `[N1] ${String(deviation.description || "").slice(0, 1500)}`, score: 1.0 },
    ...citedStandards.map((s, i) => ({ docId: `S${i + 1}`, chunkId: `S${i + 1}`, text: `[S${i + 1}] ${s}`, score: 1.0 })),
  ];

  const systemPrompt = `You are a senior pharma QA. You write the formal disposition memo for a
deviation that has reached its disposition stage. Apply 21 CFR 211.192 and
ICH Q7 §13 reasoning.

NON-NEGOTIABLE RULES:
1. dispositionDecision MUST be one of: ${DISPOSITION_ENUM.join(" | ")}.
2. Every factual claim in the justification MUST cite [R1], [I1], [N1], or [S1..Sn].
3. Disposition MUST be JUSTIFIED by the impact + root cause — never RELEASE if
   patient safety impact > none, never REJECT if rework is feasible & impact is
   low. State your reasoning explicitly.
4. residualRiskNotes per ICH Q9(R1) — what risk remains after disposition?
5. Output JSON only.

OUTPUT SCHEMA:
- dispositionDecision     enum
- justification           paragraph form, every claim cited
- residualRiskNotes       1–3 sentences citing [I1] / [S1..Sn]
- regulatoryClauses       string[] — cited standards from S-block
- batchActions            [{ batchId: string, action: enum, rationale: string }]  // empty array if not applicable
- confidence              0–1
- citations               [{ id, excerpt }]`;

  const userPrompt = `Draft the disposition memo.

DEVIATION ${deviation.deviationNumber || deviation._id}
Title:           ${deviation.title || ""}
Classification:  ${deviation.classification || ""}
Category:        ${deviation.category || ""}
Affected batches: ${(deviation.batchNumbers || []).join(", ") || "(none)"}

EVIDENCE BLOCKS (cite as [Rn]/[In]/[Nn]/[Sn]):
${retrievalSet.map((r) => r.text).join("\n")}

Return JSON only.`;

  const result = await groundedGenerate({
    feature: "deviation.draft_disposition",
    systemPrompt, userPrompt, retrievalSet,
    outputSchema: {
      requiredFields: ["dispositionDecision", "justification", "residualRiskNotes", "regulatoryClauses", "batchActions", "confidence", "citations"],
    },
    minConfidence: 0.6,
    requireCitations: true,
    tenantContext: { ...tenantContext, linkedEntityType: "deviation" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    // Skeleton — conservative QUARANTINE recommendation when LLM unavailable.
    return {
      ok: true,
      source: "skeleton.fallback",
      draft: {
        dispositionDecision: deviation.classification === "CRITICAL" ? "QUARANTINE" : "PENDING",
        justification: `LLM unavailable. Conservative recommendation: ${deviation.classification === "CRITICAL" ? "quarantine pending review" : "hold pending QA assessment"}. Manual review required.`,
        residualRiskNotes: "Not assessed by AI — QA must complete manually per ICH Q9(R1).",
        regulatoryClauses: [],
        batchActions: [],
        confidence: 0,
        citations: [],
      },
      meta: { reason: result.reason, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
    };
  }

  const decision = DISPOSITION_ENUM.includes(result.output.dispositionDecision) ? result.output.dispositionDecision : "PENDING";

  return {
    ok: true,
    source: "llm.groundedGenerate",
    draft: {
      dispositionDecision: decision,
      justification: result.output.justification,
      residualRiskNotes: result.output.residualRiskNotes,
      regulatoryClauses: Array.isArray(result.output.regulatoryClauses) ? result.output.regulatoryClauses : [],
      batchActions: Array.isArray(result.output.batchActions) ? result.output.batchActions : [],
      confidence: Number(result.output.confidence) || 0,
      citations: result.output.citations || [],
    },
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
  };
}
