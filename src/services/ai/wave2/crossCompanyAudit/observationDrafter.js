/**
 * Observation Drafter — Wave 2 implementation.
 *
 * Drafts an audit observation from live session context + retrieved FDA
 * corpus. The auditor reviews, edits, e-signs. Never auto-publishes.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "audit.draft_observation@1.0.0";

const SYSTEM = `
You are a pharmaceutical GMP auditor drafting an observation for an audit
report. Style: concise, factual, regulatory voice (passive, third-person).
Each claim must cite at least one SOURCE from the retrieval set.

SEVERITY GUIDANCE:
- "critical": risk to patient safety; immediate regulatory action warranted
- "major":    significant quality system gap affecting batch quality
- "minor":    documentation or local process gap; does not affect quality

OUTPUT (strict JSON):
{
  "observation_title": "short title (6-12 words)",
  "observation_description": "2-4 sentence factual narrative",
  "severity": "minor|major|critical",
  "capa_worthy": boolean,
  "regulatory_clauses": ["21 CFR 211.x", "ICH Q7 §n", "EU GMP Annex 11 item m"],
  "evidence_citations": ["evidence_id_1", ...],
  "suggested_capa": "1-2 sentence suggestion (or null if not capa_worthy)",
  "citations": ["SOURCE_1:...", ...],
  "confidence": 0.0
}
`.trim();

function buildPrompt({ auditContext, interviewExcerpts = [], evidenceIds = [], responseIds = [] }) {
  const blocks = [];
  if (auditContext) {
    blocks.push("AUDIT CONTEXT:\n" + JSON.stringify(auditContext, null, 2));
  }
  if (interviewExcerpts.length) {
    blocks.push("INTERVIEW EXCERPTS:\n" + interviewExcerpts.map((e, i) => `[${i + 1}] ${e}`).join("\n"));
  }
  if (evidenceIds.length) {
    blocks.push(`LINKED EVIDENCE IDs: ${evidenceIds.join(", ")}`);
  }
  if (responseIds.length) {
    blocks.push(`LINKED QUESTIONNAIRE RESPONSE IDs: ${responseIds.join(", ")}`);
  }
  blocks.push(
    "Draft an observation grounded in the SOURCES. If the evidence is ambiguous, return insufficient_evidence=true."
  );
  return blocks.join("\n\n");
}

export async function draftObservation({
  auditId,
  auditContext,
  interviewExcerpts,
  evidenceIds,
  responseIds,
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantContext?.tenantId) throw new Error("draftObservation: tenantContext.tenantId required");
  if (!retrievalSet.length && !interviewExcerpts?.length) {
    // Need at least some grounding material.
    return { ok: false, reason: "no_grounding_material" };
  }

  const userPrompt = buildPrompt({ auditContext, interviewExcerpts, evidenceIds, responseIds });

  const result = await groundedGenerate({
    feature: "audit.draft_observation",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: [
        "observation_title",
        "observation_description",
        "severity",
        "capa_worthy",
        "regulatory_clauses",
        "evidence_citations",
        "citations",
        "confidence",
      ],
    },
    minConfidence: 0.55,
    requireCitations: true,
    tenantContext: {
      ...tenantContext,
      auditId,
      linkedEntityType: "audit_observation",
      linkedEntityId: auditId,
    },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason, fallbackMessage: result.fallbackMessage };
  return { ok: true, draft: result.output, meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION } };
}

export const __private = { PROMPT_VERSION };
