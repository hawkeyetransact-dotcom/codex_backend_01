/**
 * Drift Monitor — Wave 3 implementation.
 *
 * Scheduled job that reads recent AI audit trail activity and computes
 * per-feature quality metrics. Raises DriftAlert (+ can auto-pause a
 * feature via a tenant feature flag if drift exceeds threshold).
 */
import mongoose from "mongoose";
import { AuditTrail } from "../../../models/auditTrailModel.js";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

const DriftAlertSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  feature: { type: String, required: true, index: true },
  metric: { type: String, required: true },
  baselineValue: { type: Number },
  currentValue: { type: Number },
  driftPp: { type: Number },
  driftPct: { type: Number },
  status: { type: String, enum: ["open", "acknowledged", "resolved"], default: "open", index: true },
  raisedAt: { type: Date, default: Date.now, index: true },
  resolvedAt: { type: Date },
}, { collection: "ai_drift_alerts" });
const DriftAlert = mongoose.models["ai-drift-alerts"] || mongoose.model("ai-drift-alerts", DriftAlertSchema);

export const DRIFT_THRESHOLDS = Object.freeze({
  groundedRate: { driftPp: 5, window: 7 },
  userAcceptance: { driftPp: 10, window: 7 },
  latencyP95Pct: { driftPct: 25, window: 7 },
  toolFailureRate: { driftPp: 3, window: 7 },
});

/**
 * Compute current + baseline metrics from AuditTrail rows in the windows.
 * Returns a per-feature metric snapshot.
 */
export async function computeDriftSnapshots({ tenantId, windowDays = 7, baselineOffsetDays = 7 } = {}) {
  const now = new Date();
  const currentStart = new Date(now.getTime() - windowDays * 86400000);
  const baselineEnd = new Date(currentStart.getTime() - 1);
  const baselineStart = new Date(baselineEnd.getTime() - windowDays * 86400000);

  const baseQuery = { entityType: "ai_decision" };
  if (tenantId) baseQuery.tenantId = tenantId;

  // Fetch current + baseline windows once each.
  const [currentRows, baselineRows] = await Promise.all([
    AuditTrail.find({ ...baseQuery, createdAt: { $gte: currentStart, $lte: now } }).select("action meta").lean(),
    AuditTrail.find({ ...baseQuery, createdAt: { $gte: baselineStart, $lt: baselineEnd } }).select("action meta").lean(),
  ]);

  const summarise = (rows) => {
    const byFeature = new Map();
    for (const row of rows) {
      const ai = row.meta?.ai || {};
      const feature = ai.feature;
      if (!feature) continue;
      if (!byFeature.has(feature)) byFeature.set(feature, { total: 0, grounded: 0, outcomes: { ACCEPTED: 0, EDITED: 0, REJECTED: 0 }, latencies: [], toolFailures: 0 });
      const agg = byFeature.get(feature);
      agg.total += 1;
      if (ai.grounded) agg.grounded += 1;
      if (ai.latencyMs) agg.latencies.push(ai.latencyMs);
      if (/_OUTCOME$/.test(row.action)) {
        if (ai.outcome === "USER_ACCEPTED") agg.outcomes.ACCEPTED += 1;
        if (ai.outcome === "USER_EDITED") agg.outcomes.EDITED += 1;
        if (ai.outcome === "USER_REJECTED") agg.outcomes.REJECTED += 1;
      }
      if (feature.startsWith("tool.") && ai.outputPreview?.startsWith("{\"error\"")) agg.toolFailures += 1;
    }
    return byFeature;
  };

  const cur = summarise(currentRows);
  const base = summarise(baselineRows);

  const percentile = (arr, p) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };

  const snapshots = [];
  const features = new Set([...cur.keys(), ...base.keys()]);
  for (const feature of features) {
    const c = cur.get(feature) || { total: 0, grounded: 0, outcomes: { ACCEPTED: 0, EDITED: 0, REJECTED: 0 }, latencies: [], toolFailures: 0 };
    const b = base.get(feature) || { total: 0, grounded: 0, outcomes: { ACCEPTED: 0, EDITED: 0, REJECTED: 0 }, latencies: [], toolFailures: 0 };

    const curGrounded = c.total ? c.grounded / c.total : 0;
    const baseGrounded = b.total ? b.grounded / b.total : null;
    const curAccept = (c.outcomes.ACCEPTED + c.outcomes.EDITED + c.outcomes.REJECTED) > 0
      ? (c.outcomes.ACCEPTED + c.outcomes.EDITED) / (c.outcomes.ACCEPTED + c.outcomes.EDITED + c.outcomes.REJECTED) : null;
    const baseAccept = (b.outcomes.ACCEPTED + b.outcomes.EDITED + b.outcomes.REJECTED) > 0
      ? (b.outcomes.ACCEPTED + b.outcomes.EDITED) / (b.outcomes.ACCEPTED + b.outcomes.EDITED + b.outcomes.REJECTED) : null;
    const curP95 = percentile(c.latencies, 95);
    const baseP95 = percentile(b.latencies, 95);
    const curFailRate = c.total ? c.toolFailures / c.total : 0;
    const baseFailRate = b.total ? b.toolFailures / b.total : 0;

    snapshots.push({ feature, metric: "groundedRate", currentValue: curGrounded, baselineValue: baseGrounded });
    if (curAccept !== null) snapshots.push({ feature, metric: "userAcceptance", currentValue: curAccept, baselineValue: baseAccept });
    if (curP95 && baseP95) snapshots.push({ feature, metric: "latencyP95Pct", currentValue: curP95, baselineValue: baseP95 });
    snapshots.push({ feature, metric: "toolFailureRate", currentValue: curFailRate, baselineValue: baseFailRate });
  }
  return snapshots;
}

/**
 * Evaluate snapshots against thresholds; raise + persist alerts for drifts.
 */
export async function evaluateAndRaiseAlerts({ tenantId, snapshots } = {}) {
  const alerts = [];
  for (const s of snapshots) {
    if (s.baselineValue === null || s.baselineValue === undefined) continue;
    const threshold = DRIFT_THRESHOLDS[s.metric];
    if (!threshold) continue;
    let drifted = false, driftPp = null, driftPct = null;
    if (typeof threshold.driftPp === "number") {
      driftPp = (s.baselineValue - s.currentValue) * 100;
      drifted = driftPp >= threshold.driftPp;
    } else if (typeof threshold.driftPct === "number") {
      driftPct = s.baselineValue > 0 ? ((s.currentValue - s.baselineValue) / s.baselineValue) * 100 : 0;
      drifted = driftPct >= threshold.driftPct;
    }
    if (!drifted) continue;

    // Dedupe: don't raise a second alert for the same open one.
    const existing = await DriftAlert.findOne({ tenantId, feature: s.feature, metric: s.metric, status: "open" });
    if (existing) continue;

    const alert = await DriftAlert.create({
      tenantId, feature: s.feature, metric: s.metric,
      baselineValue: s.baselineValue, currentValue: s.currentValue,
      driftPp, driftPct, status: "open",
    });
    alerts.push(alert);

    recordAiDecision({
      tenantId,
      feature: "drift.alert",
      linkedEntityType: "drift_alert",
      linkedEntityId: String(alert._id),
      output: { feature: s.feature, metric: s.metric, driftPp, driftPct },
      confidence: 0.9,
      grounded: true,
      provider: "drift-monitor",
      model: "drift-rules-v1",
      modelVersion: "1.0.0",
      promptVersion: "drift.alert@1.0.0",
    }).catch(() => {});
  }
  return { ok: true, alertsCreated: alerts.length, alerts };
}

/**
 * Convenience: run the daily check end-to-end.
 */
export async function runDailyDriftCheck({ tenantId } = {}) {
  const snapshots = await computeDriftSnapshots({ tenantId });
  const alerts = await evaluateAndRaiseAlerts({ tenantId, snapshots });
  return { ok: true, snapshotCount: snapshots.length, ...alerts };
}

export async function getDriftDashboard({ tenantId } = {}) {
  const snapshots = await computeDriftSnapshots({ tenantId });
  const openAlerts = await DriftAlert.find({ tenantId, status: "open" }).sort({ raisedAt: -1 }).lean();
  const annotated = snapshots.map((s) => {
    const alert = openAlerts.find((a) => a.feature === s.feature && a.metric === s.metric);
    return {
      ...s,
      alertRaised: Boolean(alert),
      raisedAt: alert?.raisedAt,
      driftPp: alert?.driftPp,
      driftPct: alert?.driftPct,
    };
  });
  return { ok: true, snapshots: annotated, openAlertCount: openAlerts.length };
}
