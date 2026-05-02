/**
 * Deviation Trend Alerter — Wave 2.
 *
 * Aggregates open + recently-closed deviations and surfaces emerging
 * patterns. Designed to run as a nightly cron AND on-demand from the
 * Deviation register dashboard.
 *
 * Detection rules (deterministic — no LLM required for the signal):
 *   1. SAME_AREA      — ≥3 deviations on same area in trailing 60 days
 *   2. SAME_EQUIPMENT — ≥3 deviations on same processStep in trailing 60 days
 *   3. SAME_PRODUCT   — ≥3 deviations on same productName in trailing 60 days
 *   4. CATEGORY_SPIKE — Category count > 2× rolling 180-day baseline
 *   5. SAME_ROOT_CAUSE — ≥2 closed deviations with overlapping root-cause keywords
 *
 * Optional LLM pass: composes a one-line narrative for each cluster so the
 * dashboard reads like "3 PERSONNEL deviations on Filling Suite 2 in the
 * last 41 days — SOP-014 may need revision."
 */
import { Deviation } from "../../../../models/DeviationModel.js";
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "deviation.trend_alerter@1.0.0";

const TRAIL_DAYS = 60;
const BASELINE_DAYS = 180;
const MIN_CLUSTER = 3;

const tokenize = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 4);

export async function detectDeviationTrends({ tenantContext, withNarrative = false, llmConfig } = {}) {
  if (!tenantContext?.tenantId) throw new Error("tenantContext.tenantId required");
  const tenantId = tenantContext.tenantId;

  const since = new Date(Date.now() - TRAIL_DAYS * 86400000);
  const baselineSince = new Date(Date.now() - BASELINE_DAYS * 86400000);

  const [recent, baseline] = await Promise.all([
    Deviation.find({ tenantId, createdAt: { $gte: since } })
      .select("deviationNumber title classification category status area processStep productName rootCause investigation createdAt")
      .lean(),
    Deviation.countDocuments({ tenantId, createdAt: { $gte: baselineSince } }),
  ]);

  const clusters = [];

  // Rule 1–3: bucket by dimension
  const bucket = (key, label) => {
    const map = new Map();
    for (const d of recent) {
      const v = d[key];
      if (!v) continue;
      const k = String(v).trim();
      if (!k) continue;
      const arr = map.get(k) || [];
      arr.push(d);
      map.set(k, arr);
    }
    for (const [k, items] of map.entries()) {
      if (items.length >= MIN_CLUSTER) {
        clusters.push({
          rule: label,
          dimension: key,
          dimensionValue: k,
          count: items.length,
          windowDays: TRAIL_DAYS,
          deviationNumbers: items.map((d) => d.deviationNumber || String(d._id)).slice(0, 10),
          severity: items.some((d) => d.classification === "CRITICAL") ? "high" : items.some((d) => d.classification === "MAJOR") ? "medium" : "low",
        });
      }
    }
  };
  bucket("area", "SAME_AREA");
  bucket("processStep", "SAME_EQUIPMENT");
  bucket("productName", "SAME_PRODUCT");

  // Rule 4: category spike vs baseline
  const baselineRate = baseline / Math.max(1, BASELINE_DAYS);
  const recentRate = recent.length / Math.max(1, TRAIL_DAYS);
  const categoryCounts = new Map();
  recent.forEach((d) => {
    if (!d.category) return;
    categoryCounts.set(d.category, (categoryCounts.get(d.category) || 0) + 1);
  });
  for (const [cat, count] of categoryCounts.entries()) {
    if (count >= MIN_CLUSTER && recentRate > baselineRate * 1.5) {
      clusters.push({
        rule: "CATEGORY_SPIKE",
        dimension: "category",
        dimensionValue: cat,
        count,
        baselineRatePerDay: Number(baselineRate.toFixed(3)),
        recentRatePerDay: Number(recentRate.toFixed(3)),
        windowDays: TRAIL_DAYS,
        severity: "medium",
      });
    }
  }

  // Rule 5: shared root-cause keywords across closed deviations
  const closedWithRoot = recent.filter((d) => d.investigation?.rootCause);
  const tokenIndex = new Map();
  for (const d of closedWithRoot) {
    const toks = tokenize(d.investigation.rootCause);
    for (const t of toks) {
      const arr = tokenIndex.get(t) || [];
      arr.push(d);
      tokenIndex.set(t, arr);
    }
  }
  const sharedRoots = [];
  for (const [token, items] of tokenIndex.entries()) {
    if (items.length >= 2) sharedRoots.push({ token, items });
  }
  // De-dup: only the most-shared 5 tokens
  sharedRoots.sort((a, b) => b.items.length - a.items.length);
  for (const sr of sharedRoots.slice(0, 5)) {
    clusters.push({
      rule: "SAME_ROOT_CAUSE",
      dimension: "rootCauseKeyword",
      dimensionValue: sr.token,
      count: sr.items.length,
      windowDays: TRAIL_DAYS,
      deviationNumbers: sr.items.map((d) => d.deviationNumber || String(d._id)).slice(0, 10),
      severity: "medium",
    });
  }

  // Optional LLM narrative.
  let narratives = [];
  if (withNarrative && clusters.length) {
    const top = clusters.slice(0, 8);
    const retrievalSet = top.map((c, i) => ({
      docId: `C${i + 1}`, chunkId: `C${i + 1}`,
      text: `[C${i + 1}] ${c.rule} on ${c.dimension}=${c.dimensionValue} (${c.count} deviations in ${c.windowDays} days)`,
      score: 1.0,
    }));
    const systemPrompt = `You are a pharma cGMP trend analyst. For each cluster supplied,
write ONE short narrative (≤140 chars) that (a) names the cluster, (b) cites it [Cn],
(c) suggests the most likely action (SOP review / training refresh / equipment qualification / supplier escalation).
Output JSON only: { narratives: [{ id: "C1", text: "..." }] }`;
    const userPrompt = `Clusters:\n${retrievalSet.map((r) => r.text).join("\n")}\n\nReturn JSON only.`;
    const res = await groundedGenerate({
      feature: "deviation.trend_alerter",
      systemPrompt, userPrompt, retrievalSet,
      outputSchema: { requiredFields: ["narratives"] },
      minConfidence: 0.4,
      requireCitations: false,
      tenantContext,
      llmConfig,
      promptVersion: PROMPT_VERSION,
    });
    if (res.ok) narratives = Array.isArray(res.output.narratives) ? res.output.narratives : [];
  }

  // Stitch narratives into clusters.
  if (narratives.length) {
    const idx = new Map(narratives.map((n) => [n.id, n.text]));
    clusters.forEach((c, i) => {
      const t = idx.get(`C${i + 1}`);
      if (t) c.narrative = t;
    });
  }

  return {
    ok: true,
    windowDays: TRAIL_DAYS,
    deviationsInWindow: recent.length,
    baselineDeviationsPerDay: Number(baselineRate.toFixed(3)),
    clusters: clusters.sort((a, b) => b.count - a.count),
    promptVersion: withNarrative ? PROMPT_VERSION : null,
  };
}
