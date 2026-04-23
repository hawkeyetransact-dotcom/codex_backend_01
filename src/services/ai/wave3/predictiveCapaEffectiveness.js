/**
 * Predictive CAPA Effectiveness — Wave 3 implementation (heuristic).
 *
 * Production version would be LightGBM trained on historical outcomes.
 * This initial implementation is a calibrated rule-based predictor that
 * computes from structured features — good enough to surface the UX and
 * collect labels; swap for ML when training data is ready.
 */
import mongoose from "mongoose";
import { AiPrediction } from "../../../models/aiPredictionModel.js";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

const MODEL_VERSION = "capa.heuristic@1.0.0";

/**
 * Clamp to [0,1] and round to 2 dp.
 */
const bound = (x) => Math.max(0, Math.min(1, Math.round(x * 100) / 100));

/**
 * Compute the prediction from structured features.
 * Returns { pOnTime, pEffective, topFactors }.
 */
export function computePrediction(features = {}) {
  const {
    slack_days = 14,
    owner_prior_closure_rate = 0.7, // 0..1
    owner_avg_cycle_days = 14,
    deviation_recurrence_count = 0,
    linked_artifact_count = 0,
    capa_type = "corrective",
    severity = "minor",
    owner_role = "QA Specialist",
    supplier_risk_band = "LOW",
  } = features;

  // On-time base rate from slack + owner history.
  let pOnTime =
    0.4 +
    Math.max(0, Math.min(0.25, (slack_days - 7) / 30)) + // more slack = better
    0.25 * owner_prior_closure_rate;

  // Penalties.
  if (severity === "major") pOnTime -= 0.08;
  if (severity === "critical") pOnTime -= 0.18;
  if (deviation_recurrence_count > 2) pOnTime -= 0.1;
  if (supplier_risk_band === "HIGH") pOnTime -= 0.06;
  if (supplier_risk_band === "CRITICAL") pOnTime -= 0.12;

  // Effectiveness base rate.
  let pEffective =
    0.55 +
    0.15 * owner_prior_closure_rate +
    Math.min(0.1, linked_artifact_count * 0.02);
  if (capa_type === "preventive") pEffective += 0.05;
  if (severity === "critical") pEffective -= 0.1;
  if (owner_avg_cycle_days > 45) pEffective -= 0.05;

  pOnTime = bound(pOnTime);
  pEffective = bound(pEffective);

  // Top factors — rough contribution scoring.
  const factors = [
    { factor: "owner_prior_closure_rate", contribution: +0.25 * owner_prior_closure_rate, direction: "positive" },
    { factor: "slack_days", contribution: (slack_days - 7) / 30, direction: slack_days > 7 ? "positive" : "negative" },
    { factor: "severity", contribution: severity === "critical" ? -0.18 : severity === "major" ? -0.08 : 0, direction: severity === "minor" ? "positive" : "negative" },
    { factor: "deviation_recurrence_count", contribution: deviation_recurrence_count > 2 ? -0.1 : 0, direction: deviation_recurrence_count > 2 ? "negative" : "positive" },
    { factor: "supplier_risk_band", contribution: supplier_risk_band === "CRITICAL" ? -0.12 : supplier_risk_band === "HIGH" ? -0.06 : 0, direction: supplier_risk_band === "LOW" ? "positive" : "negative" },
  ]
    .filter((f) => Math.abs(f.contribution) > 0.01)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  return { pOnTime, pEffective, topFactors: factors };
}

/**
 * Predict + persist + audit.
 */
export async function predictCapaOutcome({ tenantId, actorId, capaId, features } = {}) {
  if (!tenantId) throw new Error("predictCapaOutcome: tenantId required");
  const { pOnTime, pEffective, topFactors } = computePrediction(features || {});
  // Model "confidence" for a heuristic: lower when inputs are missing.
  const knownFields = features ? Object.keys(features).filter((k) => features[k] !== undefined && features[k] !== null).length : 0;
  const confidence = Math.min(0.95, 0.5 + 0.05 * knownFields);

  const record = await AiPrediction.create({
    tenantId,
    feature: "capa.outcome",
    subjectType: "capa",
    subjectId: capaId ? String(capaId) : new mongoose.Types.ObjectId().toString(),
    predictions: { pOnTime, pEffective },
    topFactors,
    modelVersion: MODEL_VERSION,
    confidence,
    actorId,
  });

  recordAiDecision({
    tenantId,
    actorId,
    feature: "capa.predict_outcome",
    linkedEntityType: "capa",
    linkedEntityId: capaId,
    output: { pOnTime, pEffective, topFactors },
    confidence,
    grounded: true,
    provider: "heuristic",
    model: "capa-predictor-v1",
    modelVersion: MODEL_VERSION,
    promptHash: null,
    promptVersion: MODEL_VERSION,
  }).catch(() => {});

  return { ok: true, prediction: { pOnTime, pEffective, topFactors, modelVersion: MODEL_VERSION, confidence }, recordId: record._id };
}

/**
 * Future: train a real model. For now, return an informational response.
 */
export async function trainCapaModel(/* { tenantId, trainingData, hyperparams } */) {
  return {
    ok: false,
    reason: "ml_training_not_implemented",
    note:
      "Heuristic scorer is live. Training pipeline integrates LightGBM / XGBoost through a Python sidecar or lambda; the Node stub here just enqueues a training job once that infra exists.",
  };
}

export const CAPA_FEATURE_SCHEMA = {
  numeric: ["slack_days", "owner_prior_closure_rate", "owner_avg_cycle_days", "deviation_recurrence_count", "linked_artifact_count"],
  categorical: ["capa_type", "severity", "owner_role", "department", "regulatory_clause_family", "supplier_risk_band"],
};

export const __private = { MODEL_VERSION, bound };
