/**
 * Active Learning Loop — Wave 2 implementation.
 *
 * Runs as a scheduled job (recommend: daily cron). Reads AI-decision
 * outcomes from the main AuditTrail and computes per-feature quality
 * metrics: acceptance rate, edit-distance proxy, top rejection reasons.
 *
 * Emits FeedbackReport documents; does NOT retrain/tune automatically —
 * it surfaces signals that a human reviews in the AI admin dashboard
 * and then promotes via a manual approval step (promoteRetrievalWeights
 * / promotePromptVariant).
 */
import { AuditTrail } from "../../../models/auditTrailModel.js";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "active_learning.propose_variant@1.0.0";

/**
 * Aggregate feedback in a window.
 */
export async function ingestFeedbackWindow({ since, until = new Date(), tenantId } = {}) {
  if (!since) throw new Error("ingestFeedbackWindow: since required");
  const query = {
    entityType: "ai_decision",
    action: { $regex: /^AI_.*_OUTCOME$/ },
    createdAt: { $gte: new Date(since), $lte: new Date(until) },
  };
  if (tenantId) query.tenantId = tenantId;

  const rows = await AuditTrail.find(query).select("tenantId action meta createdAt").lean();

  const byFeature = new Map();
  for (const row of rows) {
    const feature = row.meta?.ai?.feature;
    if (!feature) continue;
    const outcome = row.meta?.ai?.outcome;
    if (!outcome) continue;
    if (!byFeature.has(feature)) byFeature.set(feature, { total: 0, accepted: 0, edited: 0, rejected: 0, superseded: 0, feedback: [] });
    const agg = byFeature.get(feature);
    agg.total += 1;
    if (outcome === "USER_ACCEPTED") agg.accepted += 1;
    else if (outcome === "USER_EDITED") agg.edited += 1;
    else if (outcome === "USER_REJECTED") agg.rejected += 1;
    else if (outcome === "SUPERSEDED") agg.superseded += 1;
    if (row.meta?.ai?.feedback) agg.feedback.push(row.meta.ai.feedback);
  }

  const reports = [];
  for (const [feature, agg] of byFeature.entries()) {
    const acceptanceRate = agg.total ? (agg.accepted + agg.edited) / agg.total : 0;
    const rejectionRate = agg.total ? agg.rejected / agg.total : 0;
    reports.push({
      feature,
      windowStart: new Date(since),
      windowEnd: new Date(until),
      totals: { total: agg.total, accepted: agg.accepted, edited: agg.edited, rejected: agg.rejected, superseded: agg.superseded },
      acceptanceRate,
      rejectionRate,
      topFeedback: agg.feedback.slice(0, 20),
    });
  }

  return reports;
}

/**
 * Generate a candidate prompt variant for a low-performing feature.
 * Returns the proposed variant text + rationale. Human must approve
 * before the A/B harness enrols it.
 */
export async function proposePromptVariant({ report, currentPromptExcerpt, tenantContext, llmConfig }) {
  if (!report) throw new Error("proposePromptVariant: report required");

  const userPrompt = [
    `FEATURE: ${report.feature}`,
    `ACCEPTANCE RATE: ${(report.acceptanceRate * 100).toFixed(1)}%`,
    `REJECTION RATE: ${(report.rejectionRate * 100).toFixed(1)}%`,
    `TOTAL INTERACTIONS: ${report.totals.total}`,
    "",
    "TOP USER FEEDBACK:",
    (report.topFeedback || []).slice(0, 10).map((f, i) => `${i + 1}. ${f}`).join("\n"),
    "",
    "CURRENT PROMPT (excerpt):",
    currentPromptExcerpt || "(not provided)",
    "",
    "Propose a revised SYSTEM prompt excerpt that would address the most",
    "common user complaints. Do not change the JSON output schema. Keep it",
    "concise (<1500 chars).",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "active_learning.propose_variant",
    systemPrompt: "You are a prompt engineer for a regulated pharma QMS AI. Propose incremental prompt improvements.",
    userPrompt,
    outputSchema: { requiredFields: ["variant_system_prompt", "rationale", "citations", "confidence"] },
    minConfidence: 0.4,
    requireCitations: false,
    tenantContext: tenantContext || { tenantId: "platform" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    variant: {
      systemPromptExcerpt: result.output.variant_system_prompt,
      rationale: result.output.rationale,
      confidence: result.output.confidence,
    },
  };
}

/**
 * Promote retrieval weights — flags certain chunks as preferred/deprioritised
 * based on how often they appeared in accepted vs rejected drafts.
 *
 * Simplified heuristic: if a docId appears in ≥5 accepted AI decisions
 * within the window, boost it; if it appears in ≥5 rejected decisions,
 * deprioritise. Writes to TenantRetrievalConfig (upserted).
 *
 * TODO: require a human approval gate before applying weights to prod
 * retrieval — currently this is a pure compute job.
 */
export async function computeRetrievalAdjustments({ since, until = new Date(), tenantId }) {
  const baseQuery = {
    entityType: "ai_decision",
    tenantId,
    createdAt: { $gte: new Date(since), $lte: new Date(until) },
  };

  // 1. Pull both the original AI_* and AI_*_OUTCOME rows in the window.
  const rows = await AuditTrail.find(baseQuery)
    .select("action meta entityId createdAt actorId")
    .lean();

  // 2. Index originals by (feature, linkedEntityId) so we can join their
  //    retrieval set (stored as retrievalHash + retrievalCount) to the
  //    subsequent OUTCOME row. The retrievalHash alone isn't enough to
  //    tune individual doc weights — so we also look at outputPreview
  //    which often contains citation strings like "SOURCE_1:doc-id:chunk".
  const originals = new Map(); // key: `${feature}::${linkedEntityId}` -> meta.ai
  for (const r of rows) {
    const ai = r.meta?.ai;
    if (!ai) continue;
    if (/_OUTCOME$/.test(r.action)) continue; // skip outcomes
    const key = `${ai.feature}::${ai.linkedEntityId || r.entityId || "_"}`;
    if (!originals.has(key)) originals.set(key, ai);
  }

  // 3. Walk OUTCOME rows, join to the original, tally per-citation.
  const citationStats = new Map(); // citation string -> { acceptWeight, rejectWeight, count }
  const featureStats = new Map(); // feature -> { accepted, edited, rejected }
  for (const r of rows) {
    const ai = r.meta?.ai;
    if (!ai) continue;
    if (!/_OUTCOME$/.test(r.action)) continue;
    const key = `${ai.feature}::${ai.linkedEntityId || r.entityId || "_"}`;
    const orig = originals.get(key);
    if (!orig) continue;

    const outcome = ai.outcome;
    if (!outcome) continue;

    // Per-feature aggregates.
    if (!featureStats.has(ai.feature)) featureStats.set(ai.feature, { accepted: 0, edited: 0, rejected: 0 });
    const feat = featureStats.get(ai.feature);
    if (outcome === "USER_ACCEPTED") feat.accepted += 1;
    else if (outcome === "USER_EDITED") feat.edited += 1;
    else if (outcome === "USER_REJECTED") feat.rejected += 1;

    // Per-citation scoring. Extract citations from the original outputPreview.
    // Format we emit: `SOURCE_n:docId:chunk` or plain `docId:chunk`.
    const preview = String(orig.outputPreview || "");
    const citationMatches = preview.match(/([A-Za-z0-9_\-./]+:[A-Za-z0-9_\-./]+)/g) || [];
    const weight = outcome === "USER_ACCEPTED" ? 1 : outcome === "USER_EDITED" ? 0.4 : -1;
    for (const c of citationMatches) {
      if (!citationStats.has(c)) citationStats.set(c, { accept: 0, reject: 0, count: 0 });
      const s = citationStats.get(c);
      if (weight > 0) s.accept += weight;
      else s.reject += Math.abs(weight);
      s.count += 1;
    }
  }

  // 4. Produce weight-adjustment suggestions. These are PROPOSALS only —
  //    a human admin approves before they're applied to retrieval.
  const proposals = [];
  for (const [citation, stats] of citationStats.entries()) {
    if (stats.count < 5) continue; // require at least 5 appearances for signal
    const ratio = stats.accept / (stats.accept + stats.reject || 1);
    if (ratio > 0.75) {
      proposals.push({ citation, direction: "boost", count: stats.count, acceptRatio: +ratio.toFixed(2), weightDelta: +0.15 });
    } else if (ratio < 0.35) {
      proposals.push({ citation, direction: "deprioritise", count: stats.count, acceptRatio: +ratio.toFixed(2), weightDelta: -0.15 });
    }
  }
  proposals.sort((a, b) => Math.abs(b.weightDelta) - Math.abs(a.weightDelta));

  const featureSummaries = Array.from(featureStats.entries()).map(([feature, s]) => {
    const total = s.accepted + s.edited + s.rejected;
    return {
      feature,
      total,
      accepted: s.accepted,
      edited: s.edited,
      rejected: s.rejected,
      acceptanceRate: total ? +((s.accepted + s.edited) / total).toFixed(2) : null,
    };
  });

  return {
    ok: true,
    tenantId,
    windowStart: new Date(since),
    windowEnd: new Date(until),
    totalsScanned: rows.length,
    originalsJoined: originals.size,
    featureSummaries,
    topProposals: proposals.slice(0, 25),
    note:
      proposals.length === 0
        ? "No citation with ≥5 samples crossed the boost/deprioritise threshold. Loop still warming up."
        : `Generated ${proposals.length} retrieval-weight proposals. Admin approval required before any is applied.`,
  };
}

export const __private = { PROMPT_VERSION };
