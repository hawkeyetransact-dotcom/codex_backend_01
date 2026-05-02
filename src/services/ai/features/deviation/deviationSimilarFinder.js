/**
 * Deviation Similar-Finder — Wave 2.
 *
 * Pulls similar past deviations from the SAME tenant and asks the LLM to:
 *   - Rank top 5 most similar (with reasons)
 *   - Cite the actual past deviation IDs
 *   - Flag if this looks like a REPEAT FINDING (same root cause / same equipment)
 *
 * If LLM is unavailable, returns the raw top 5 (by simple text + metadata
 * overlap heuristic) without ranking — auditor can still browse.
 */
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";
import { Deviation } from "../../../../models/DeviationModel.js";

const PROMPT_VERSION = "deviation.similar_finder@1.0.0";

const tokenize = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3);
const overlap = (a, b) => {
  const setB = new Set(b);
  return a.filter((t) => setB.has(t)).length;
};

export async function findSimilarDeviations(args) {
  const { current, lookbackDays = 365, max = 5, tenantContext, llmConfig } = args;
  if (!current?.description) throw new Error("findSimilarDeviations: current.description required");
  if (!tenantContext?.tenantId) throw new Error("tenantContext.tenantId required");

  const since = new Date(Date.now() - lookbackDays * 86400000);
  const candidates = await Deviation.find({
    tenantId: tenantContext.tenantId,
    _id: { $ne: current._id },
    createdAt: { $gte: since },
  })
    .select("deviationNumber title description category classification status rootCause area processStep productName batchNumbers createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (!candidates.length) {
    return { ok: true, source: "no-history", similar: [], repeatFinding: false, meta: { promptVersion: PROMPT_VERSION } };
  }

  // Heuristic pre-rank by token overlap to keep the LLM context budget small.
  const currentTokens = tokenize(`${current.title} ${current.description} ${current.area} ${current.processStep}`);
  const ranked = candidates
    .map((d) => ({
      doc: d,
      score: overlap(currentTokens, tokenize(`${d.title} ${d.description} ${d.area} ${d.processStep} ${d.rootCause}`)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const retrievalSet = ranked.map((r, i) => ({
    docId: `D${i + 1}`, chunkId: `D${i + 1}`,
    text: `[D${i + 1}] ${r.doc.deviationNumber || r.doc._id} | ${r.doc.classification}/${r.doc.category} | ${r.doc.title} :: ${String(r.doc.description || "").slice(0, 280)} :: rootCause=${r.doc.rootCause || "(unknown)"}`,
    score: 1.0,
  }));

  const systemPrompt = `You are a senior pharma cGMP investigator. You are given a NEW deviation
and a corpus of recent past deviations from the same tenant. Pick the ${max}
MOST SIMILAR past deviations and explain why, with mandatory citations [Dn].

NON-NEGOTIABLE RULES:
1. Only cite [Dn] markers from the corpus block.
2. similar[].whyMatch must reference at least one citation.
3. repeatFinding = true ONLY when ≥2 past deviations share BOTH the same area/equipment AND the same root cause family. Spell out why.
4. Output JSON only.

OUTPUT SCHEMA:
- similar          [{ pastId: "<deviationNumber>", whyMatch: "≤140 chars [Dn]", relevance: 0–1 }]
- repeatFinding    boolean
- repeatRationale  string (≤200 chars; cite [Dn] of repeats)
- confidence       0–1
- citations        [{ id: "Dn", excerpt: "≤140 chars" }]`;

  const userPrompt = `NEW DEVIATION:
Title: ${current.title}
Area / Step: ${current.area || ""} / ${current.processStep || ""}
Product: ${current.productName || ""}
Description: ${String(current.description || "").slice(0, 1500)}

PAST DEVIATIONS (cite as [D1..D${ranked.length}]):
${retrievalSet.map((r) => r.text).join("\n")}

Return JSON only.`;

  const result = await groundedGenerate({
    feature: "deviation.similar_finder",
    systemPrompt, userPrompt, retrievalSet,
    outputSchema: { requiredFields: ["similar", "repeatFinding", "confidence", "citations"] },
    minConfidence: 0.5,
    requireCitations: true,
    tenantContext: { ...tenantContext, linkedEntityType: "deviation" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) {
    // Heuristic fallback — return top-5 by token overlap, no LLM narrative.
    return {
      ok: true,
      source: "skeleton.fallback",
      similar: ranked.slice(0, max).map((r) => ({
        pastId: r.doc.deviationNumber || String(r.doc._id),
        whyMatch: `Token-overlap score ${r.score} on title + narrative.`,
        relevance: Math.min(1, r.score / Math.max(1, currentTokens.length)),
      })),
      repeatFinding: false,
      repeatRationale: null,
      confidence: 0,
      citations: [],
      meta: { reason: result.reason, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
    };
  }

  return {
    ok: true,
    source: "llm.groundedGenerate",
    similar: result.output.similar || [],
    repeatFinding: !!result.output.repeatFinding,
    repeatRationale: result.output.repeatRationale || null,
    confidence: Number(result.output.confidence) || 0,
    citations: result.output.citations || [],
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION, auditRecord: result.auditRecord },
  };
}
