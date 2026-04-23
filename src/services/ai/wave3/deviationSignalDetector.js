/**
 * Deviation Signal Detector — Wave 3 implementation (simple clustering).
 *
 * Clusters deviations by shared features (equipment, material lot, process
 * step, operator, SOP reference, supplier). If a cluster has >= 3 recent
 * deviations AND frequency z-score > 2.0 vs the historical baseline, raise
 * an AiSignalAlert for Head of QA to triage.
 *
 * Production upgrade path: replace shared-feature clustering with HDBSCAN
 * over deviation narrative embeddings.
 */
import mongoose from "mongoose";
import { AiSignalAlert } from "../../../models/aiSignalAlertModel.js";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Pick a shared-feature key per deviation. Returns a tuple key suitable
 * for clustering (e.g. "equipment:EQ-123" or "materialLot:LOT-XYZ").
 */
function clusterKeyForDeviation(d) {
  if (d.equipmentId) return `equipment:${d.equipmentId}`;
  if (d.materialLotId) return `materialLot:${d.materialLotId}`;
  if (d.processStepId) return `processStep:${d.processStepId}`;
  if (d.operatorId) return `operator:${d.operatorId}`;
  if (d.supplierId) return `supplier:${d.supplierId}`;
  if (d.sopRef) return `sop:${d.sopRef}`;
  return null; // not clusterable
}

/**
 * Run the detector on a tenant. Returns created alerts.
 */
export async function detectSignalsForTenant({ tenantId, windowDays = 30 } = {}) {
  if (!tenantId) throw new Error("detectSignalsForTenant: tenantId required");
  const Deviation = modelByName("deviations") || modelByName("Deviation");
  if (!Deviation) {
    return { ok: false, reason: "deviation_model_not_available", alertsCreated: 0 };
  }

  const since = new Date(Date.now() - windowDays * 86400000);
  const baselineStart = new Date(Date.now() - 6 * 30 * 86400000); // 6 months prior
  const baselineEnd = since;

  const recent = await Deviation.find({ tenantId, createdAt: { $gte: since } }).lean();
  const baseline = await Deviation.find({ tenantId, createdAt: { $gte: baselineStart, $lt: baselineEnd } }).lean();

  // Build cluster counts.
  const recentByCluster = new Map();
  for (const d of recent) {
    const key = clusterKeyForDeviation(d);
    if (!key) continue;
    if (!recentByCluster.has(key)) recentByCluster.set(key, []);
    recentByCluster.get(key).push(d);
  }
  const baselineByCluster = new Map();
  for (const d of baseline) {
    const key = clusterKeyForDeviation(d);
    if (!key) continue;
    baselineByCluster.set(key, (baselineByCluster.get(key) || 0) + 1);
  }

  const alerts = [];
  for (const [key, members] of recentByCluster.entries()) {
    if (members.length < 3) continue;
    const baselineCount = baselineByCluster.get(key) || 0;
    // Baseline frequency per window, normalised to windowDays.
    const baselineWindowCount = baselineCount * (windowDays / 180);
    const z = baselineWindowCount > 0
      ? (members.length - baselineWindowCount) / Math.sqrt(Math.max(1, baselineWindowCount))
      : members.length; // no baseline → z = member count (will raise alert for >=3)
    if (z < 2.0 && baselineWindowCount > 0) continue;

    // Avoid duplicating an already-open alert for the same cluster.
    const existing = await AiSignalAlert.findOne({ tenantId, clusterKey: key, status: { $in: ["open", "under_review"] } });
    if (existing) continue;

    const alert = await AiSignalAlert.create({
      tenantId,
      signalType: "deviation_cluster",
      clusterKey: key,
      clusterSize: members.length,
      baselineFrequency: baselineWindowCount,
      currentFrequency: members.length,
      zScore: z,
      sharedFeature: key.split(":")[0],
      members: members.slice(0, 20).map((m) => ({ deviationId: m._id, title: m.title, createdAt: m.createdAt })),
      status: "open",
    });
    alerts.push(alert);

    recordAiDecision({
      tenantId,
      feature: "deviation.signal_detection",
      linkedEntityType: "signal_alert",
      linkedEntityId: String(alert._id),
      output: { clusterKey: key, clusterSize: members.length, zScore: z },
      confidence: Math.min(0.95, 0.6 + Math.min(0.3, z / 10)),
      grounded: true,
      provider: "heuristic",
      model: "deviation-cluster-v1",
      modelVersion: "1.0.0",
      promptVersion: "deviation.signal_detection@1.0.0",
    }).catch(() => {});
  }

  return { ok: true, alertsCreated: alerts.length, alerts };
}

export async function getActiveSignals({ tenantId, status = "open" } = {}) {
  if (!tenantId) throw new Error("getActiveSignals: tenantId required");
  return AiSignalAlert.find({ tenantId, status }).sort({ raisedAt: -1 }).lean();
}

export async function closeAlert({ alertId, outcome = "closed_true_positive", note, actorId, actorRole }) {
  if (!["closed_true_positive", "closed_false_positive"].includes(outcome)) {
    throw new Error("closeAlert: invalid outcome");
  }
  const alert = await AiSignalAlert.findById(alertId);
  if (!alert) throw new Error("alert not found");
  alert.status = outcome;
  alert.closedAt = new Date();
  alert.closureNote = note || "";
  await alert.save();

  recordAiDecision({
    tenantId: alert.tenantId,
    actorId,
    actorRole,
    feature: "deviation.signal_outcome",
    linkedEntityType: "signal_alert",
    linkedEntityId: String(alert._id),
    output: { outcome, note },
    confidence: null,
    grounded: true,
    provider: "manual",
    model: "human-review",
    modelVersion: "1.0.0",
    promptVersion: "deviation.signal_outcome@1.0.0",
  }).catch(() => {});
  return alert;
}
