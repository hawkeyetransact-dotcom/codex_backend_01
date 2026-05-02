/**
 * Deviation → CAPA Recommender — Wave 2.
 *
 * At the CAPA-decision step, recommends:
 *   - Whether a CAPA is needed (yes/no)
 *   - CAPA type (CORRECTIVE / PREVENTIVE / BOTH)
 *   - Suggested action title + owner role + due-day window
 *   - Effectiveness check method + success criteria + review window
 *   - Cites the root cause [R1] + similar past CAPAs [P1..Pn] when supplied
 *
 * Hands off to the existing capa.draft_rca service for full RCA expansion
 * once the CAPA record itself is created.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "deviation.recommend_capa@1.0.0";

const CAPA_TYPE_ENUM = ["CORRECTIVE", "PREVENTIVE", "BOTH", "NONE"];
const SEVERITY_ENUM = ["minor", "major", "critical"];
const OWNER_ROLE_ENUM = ["Production Mgr", "QC Lab Lead", "Engineering Lead", "QA Manager", "Supplier QA", "Training Coordinator"];

export async function recommendCapaFromDeviation(args) {
  const { deviation, similarPastCapas = [], tenantContext, llmConfig } = args;
  if (!deviation) throw new Error("recommendCapaFromDeviation: deviation required");
  if (!tenantContext?.tenantId) throw new Error("tenantContext.tenantId required");

  const rootCause = deviation.investigation?.rootCause || "";
  const retrievalSet = [
    { docId: "R1", chunkId: "R1", text: `[R1] Root cause: ${rootCause || "(not yet identified)"}`, score: 1.0 },
    { docId: "N1", chunkId: "N1", text: `[N1] ${String(deviation.description || "").slice(0, 1500)}`, score: 1.0 },
    ...similarPastCapas.slice(0, 5).map((c, i) => ({
      docId: `P${i + 1}`, chunkId: `P${i + 1}`,
      text: `[P${i + 1}] CAPA ${c._id || c.title}: ${c.title} :: ${(c.actions?.[0]?.message || c.description || "").slice(0, 240)}`,
      score: 1.0,
    })),
  ];

  const systemPrompt = `You are a senior pharma cGMP CAPA architect. Given a deviation that has
reached its CAPA-decision step, recommend whether a CAPA is needed and, if so,
draft the CAPA shape.

NON-NEGOTIABLE RULES:
1. Every claim cites [R1], [N1], or [P1..Pn].
2. capaNeeded must be FALSE only when the deviation classification is MINOR
   AND the impact is none AND no repeat finding. Otherwise TRUE — bias toward
   action per ICH Q10.
3. capaType MUST be one of: ${CAPA_TYPE_ENUM.join(" | ")}.
4. ownerRole MUST be one of: ${OWNER_ROLE_ENUM.join(" | ")}.
5. severity in capaShape MUST be one of: ${SEVERITY_ENUM.join(" | ")}.
6. Output JSON only.

OUTPUT SCHEMA:
- capaNeeded               boolean
- capaType                 enum
- capaShape                {
    title: string,
    severity: enum,
    correctiveAction: string,
    preventiveAction: string,
    ownerRole: enum,
    dueDays: int,            // recommended target window
    effectivenessCheck: {
      method: string,
      successCriteria: string,
      reviewDays: int,
    },
  }
- rationale                ≤ 250 chars, cited
- linkedPastCapaIds        string[]   // from [P1..Pn] when patterns repeat
- confidence               0–1
- citations                [{ id, excerpt }]`;

  const userPrompt = `Recommend CAPA for deviation ${deviation.deviationNumber || deviation._id}.

Title:           ${deviation.title || ""}
Classification:  ${deviation.classification || ""}
Category:        ${deviation.category || ""}
Disposition:     ${deviation.dispositionDecision || "(pending)"}

EVIDENCE (cite as [Rn]/[Nn]/[Pn]):
${retrievalSet.map((r) => r.text).join("\n")}

Return JSON only.`;

  const result = await groundedGenerate({
    feature: "deviation.recommend_capa",
    systemPrompt, userPrompt, retrievalSet,
    outputSchema: {
      requiredFields: ["capaNeeded", "capaType", "capaShape", "rationale", "confidence", "citations"],
    },
    minConfidence: 0.55,
    requireCitations: true,
    tenantContext: { ...tenantContext, linkedEntityType: "deviation" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    // Skeleton — bias toward CAPA when uncertain (ICH Q10 default).
    const needsCapa = (deviation.classification || "MINOR") !== "MINOR";
    return {
      ok: true,
      source: "skeleton.fallback",
      recommendation: {
        capaNeeded: needsCapa,
        capaType: needsCapa ? "BOTH" : "NONE",
        capaShape: needsCapa
          ? {
              title: `CAPA from deviation: ${deviation.title || ""}`.slice(0, 80),
              severity: deviation.classification === "CRITICAL" ? "critical" : "major",
              correctiveAction: "Define corrective action — LLM unavailable, manual draft required.",
              preventiveAction: "Define preventive action — LLM unavailable, manual draft required.",
              ownerRole: "QA Manager",
              dueDays: deviation.classification === "CRITICAL" ? 5 : 30,
              effectivenessCheck: {
                method: "TBD",
                successCriteria: "TBD",
                reviewDays: 90,
              },
            }
          : null,
        rationale: "LLM unavailable — conservative recommendation per ICH Q10.",
        linkedPastCapaIds: [],
        confidence: 0,
        citations: [],
      },
      meta: { reason: result.reason, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
    };
  }

  const out = result.output || {};
  return {
    ok: true,
    source: "llm.groundedGenerate",
    recommendation: {
      capaNeeded: !!out.capaNeeded,
      capaType: CAPA_TYPE_ENUM.includes(out.capaType) ? out.capaType : "NONE",
      capaShape: out.capaShape || null,
      rationale: out.rationale,
      linkedPastCapaIds: Array.isArray(out.linkedPastCapaIds) ? out.linkedPastCapaIds : [],
      confidence: Number(out.confidence) || 0,
      citations: out.citations || [],
    },
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
  };
}
