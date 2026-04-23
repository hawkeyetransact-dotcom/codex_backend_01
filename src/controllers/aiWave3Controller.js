/**
 * AI Wave 3 Controller — predictive CAPA · signals · IoT · on-prem · coach · drift.
 */
import { predictCapaOutcome } from "../services/ai/wave3/predictiveCapaEffectiveness.js";
import {
  detectSignalsForTenant,
  getActiveSignals,
  closeAlert,
} from "../services/ai/wave3/deviationSignalDetector.js";
import {
  ingestTelemetryEvent,
  predictMtbf,
} from "../services/ai/wave3/iotEquipmentFusion.js";
import {
  registerOnPremEndpoint,
  healthCheckOnPrem,
  getEndpointForTenant,
} from "../services/ai/wave3/onPremLlmDeploy.js";
import {
  reviewDraftObservation,
  recommendGrowthPlan,
} from "../services/ai/wave3/auditorCoach.js";
import {
  computeDriftSnapshots,
  evaluateAndRaiseAlerts,
  runDailyDriftCheck,
  getDriftDashboard,
} from "../services/ai/wave3/driftMonitor.js";

function tc(req) {
  return {
    tenantId: req.user?.tenant_id || req.user?.tenantId,
    userId: req.user?._id,
    userRole: req.user?.role,
  };
}

// Predictive
export const postPredictCapaOutcome = async (req, res) => {
  try {
    const t = tc(req);
    const { capaId, features } = req.body || {};
    const result = await predictCapaOutcome({ tenantId: t.tenantId, actorId: t.userId, capaId, features });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

// Signals
export const postDetectSignals = async (req, res) => {
  try {
    const t = tc(req);
    const result = await detectSignalsForTenant({ tenantId: t.tenantId, windowDays: req.body?.windowDays });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const getSignals = async (req, res) => {
  try {
    const t = tc(req);
    const alerts = await getActiveSignals({ tenantId: t.tenantId, status: req.query.status });
    return res.status(200).json({ ok: true, alerts });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const postCloseSignal = async (req, res) => {
  try {
    const t = tc(req);
    const alert = await closeAlert({ alertId: req.params.alertId, outcome: req.body?.outcome, note: req.body?.note, actorId: t.userId, actorRole: t.userRole });
    return res.status(200).json({ ok: true, alert });
  } catch (err) { return res.status(400).json({ error: err.message }); }
};

// IoT
export const postIngestTelemetry = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    const result = await ingestTelemetryEvent({
      tenantId: t.tenantId,
      equipmentId: body.equipmentId,
      timestamp: body.timestamp,
      measurements: body.measurements,
      batchContextId: body.batchContextId,
      equipmentSpec: body.equipmentSpec,
    });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const getMtbf = async (req, res) => {
  try {
    const t = tc(req);
    const windowDays = Number(req.query.windowDays) || 30;
    const result = await predictMtbf({ tenantId: t.tenantId, equipmentId: req.params.equipmentId, windowDays });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

// On-prem LLM
export const postRegisterOnPremEndpoint = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    const result = await registerOnPremEndpoint({
      tenantId: t.tenantId,
      endpointUrl: body.endpointUrl,
      model: body.model,
      weightsSha256: body.weightsSha256,
      authTokenRef: body.authTokenRef,
      validationKit: body.validationKit,
      registeredBy: t.userId,
    });
    return res.status(200).json(result);
  } catch (err) { return res.status(400).json({ error: err.message }); }
};
export const getOnPremEndpoint = async (req, res) => {
  try {
    const t = tc(req);
    const endpoint = await getEndpointForTenant(t.tenantId);
    return res.status(200).json({ ok: true, endpoint });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const postHealthCheckOnPrem = async (req, res) => {
  try {
    const t = tc(req);
    const result = await healthCheckOnPrem({ tenantId: t.tenantId });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

// Auditor coach
export const postReviewAuditorDraft = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    const result = await reviewDraftObservation({
      auditorId: body.auditorId,
      auditId: body.auditId,
      draftObservation: body.draftObservation,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const getAuditorGrowthPlan = async (req, res) => {
  try {
    const t = tc(req);
    const result = await recommendGrowthPlan({ tenantId: t.tenantId, auditorId: req.params.auditorId, lookbackDays: Number(req.query.lookbackDays) || 365 });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

// Drift
export const getDriftDashboardRoute = async (req, res) => {
  try {
    const t = tc(req);
    const result = await getDriftDashboard({ tenantId: t.tenantId });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
export const postRunDriftCheck = async (req, res) => {
  try {
    const t = tc(req);
    const result = await runDailyDriftCheck({ tenantId: t.tenantId });
    return res.status(200).json(result);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
