/**
 * Auditor Draft-Quality Coach — Wave 3 implementation.
 *
 * Private to the auditor. Reviews their draft observations for clarity,
 * regulatory alignment, and evidence coverage. Output feeds a per-auditor
 * quality record (used by the marketplace fit-score algorithm).
 */
import mongoose from "mongoose";
import { groundedGenerate } from "../grounded/groundedGenerationService.js";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

const PROMPT_VERSION = "auditor.coach.review@1.0.0";

const AuditorReviewSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  auditorId: { type: String, required: true, index: true },
  auditId: { type: String },
  draftHash: { type: String },
  scores: {
    clarity: { type: Number },
    regulatory_alignment: { type: Number },
    evidence_coverage: { type: Number },
  },
  improvements: { type: [String], default: [] },
  citations: { type: [String], default: [] },
  confidence: { type: Number },
  promptVersion: { type: String },
  reviewedAt: { type: Date, default: Date.now, index: true },
}, { collection: "ai_auditor_reviews" });
const AuditorReview = mongoose.models["ai-auditor-reviews"] || mongoose.model("ai-auditor-reviews", AuditorReviewSchema);

const SYSTEM = `
You are a senior pharmaceutical audit coach reviewing a junior auditor's
draft observation. Score + suggest improvements privately (NOT visible to
the supplier). Be concrete and constructive.

Scoring (0-1):
- clarity: how clearly the observation is phrased, in regulatory voice
- regulatory_alignment: whether the cited clauses actually match the concern
- evidence_coverage: whether the evidence supports the claims

OUTPUT (strict JSON):
{
  "clarity_score": 0.0,
  "regulatory_alignment_score": 0.0,
  "evidence_coverage_score": 0.0,
  "improvement_suggestions": ["..."],
  "citations": ["SOURCE_1:..."],
  "confidence": 0.0
}
`.trim();

export async function reviewDraftObservation({
  auditorId,
  auditId,
  draftObservation,
  retrievalSet = [],
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantContext?.tenantId) throw new Error("reviewDraftObservation: tenantContext.tenantId required");
  if (!auditorId) throw new Error("auditorId required");
  if (!draftObservation) throw new Error("draftObservation required");

  const userPrompt = [
    "DRAFT OBSERVATION:",
    JSON.stringify(draftObservation, null, 2),
    "",
    "Score + suggest improvements. Keep suggestions specific (e.g. 'cite 21 CFR 211.84(d)(6) instead of 211.84 generally').",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "auditor.coach.review_draft",
    systemPrompt: SYSTEM,
    userPrompt,
    retrievalSet,
    outputSchema: { requiredFields: ["clarity_score", "regulatory_alignment_score", "evidence_coverage_score", "improvement_suggestions", "citations", "confidence"] },
    minConfidence: 0.4,
    requireCitations: retrievalSet.length > 0,
    tenantContext: { ...tenantContext, linkedEntityType: "audit", linkedEntityId: auditId },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  if (!result.ok) return { ok: false, reason: result.reason };

  const review = {
    clarity_score: result.output.clarity_score,
    regulatory_alignment_score: result.output.regulatory_alignment_score,
    evidence_coverage_score: result.output.evidence_coverage_score,
    improvement_suggestions: result.output.improvement_suggestions,
    citations: result.output.citations,
    confidence: result.output.confidence,
  };

  // Persist to auditor's private review log.
  const record = await AuditorReview.create({
    tenantId: tenantContext.tenantId,
    auditorId,
    auditId,
    scores: {
      clarity: review.clarity_score,
      regulatory_alignment: review.regulatory_alignment_score,
      evidence_coverage: review.evidence_coverage_score,
    },
    improvements: review.improvement_suggestions,
    citations: review.citations,
    confidence: review.confidence,
    promptVersion: PROMPT_VERSION,
  });

  return { ok: true, review, recordId: record._id, meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION } };
}

/**
 * Summarise an auditor's recent reviews; surface strongest + weakest axes.
 * Used by the marketplace fit-score + the auditor's growth plan.
 */
export async function recommendGrowthPlan({ tenantId, auditorId, lookbackDays = 365 } = {}) {
  if (!auditorId) throw new Error("recommendGrowthPlan: auditorId required");
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const rows = await AuditorReview.find({ tenantId, auditorId, reviewedAt: { $gte: since } })
    .select("scores improvements").lean();
  if (!rows.length) {
    return { ok: false, reason: "insufficient_reviews", sampleSize: 0 };
  }

  const agg = { clarity: [], regulatory_alignment: [], evidence_coverage: [] };
  for (const r of rows) {
    if (typeof r.scores?.clarity === "number") agg.clarity.push(r.scores.clarity);
    if (typeof r.scores?.regulatory_alignment === "number") agg.regulatory_alignment.push(r.scores.regulatory_alignment);
    if (typeof r.scores?.evidence_coverage === "number") agg.evidence_coverage.push(r.scores.evidence_coverage);
  }
  const avg = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const scores = {
    clarity: avg(agg.clarity),
    regulatory_alignment: avg(agg.regulatory_alignment),
    evidence_coverage: avg(agg.evidence_coverage),
  };
  const ranked = Object.entries(scores)
    .filter(([, v]) => v !== null)
    .sort((a, b) => a[1] - b[1]);
  const weakest = ranked[0];
  const strongest = ranked[ranked.length - 1];

  // Collect top 5 repeated improvement themes (simple frequency).
  const improvementFreq = new Map();
  for (const r of rows) {
    for (const imp of r.improvements || []) {
      const normalised = String(imp).slice(0, 160);
      improvementFreq.set(normalised, (improvementFreq.get(normalised) || 0) + 1);
    }
  }
  const topImprovements = Array.from(improvementFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  recordAiDecision({
    tenantId,
    feature: "auditor.coach.growth_plan",
    linkedEntityType: "auditor",
    linkedEntityId: auditorId,
    output: { scores, weakest, strongest, topImprovements },
    confidence: 0.9,
    grounded: true,
    provider: "aggregation",
    model: "auditor-coach-v1",
    modelVersion: "1.0.0",
    promptVersion: "auditor.coach.growth_plan@1.0.0",
  }).catch(() => {});

  return { ok: true, auditorId, sampleSize: rows.length, scores, weakest, strongest, topImprovements };
}
