/**
 * On-Prem LLM registration + health — Wave 3 implementation.
 *
 * Tenants that need data-stays-in-VPC register their vLLM endpoint here.
 * Gateway reads this config and sends provider="local" calls to the tenant's
 * endpoint (via existing llmServiceClient) instead of the shared cloud path.
 */
import { AiOnPremEndpoint } from "../../../models/aiOnPremEndpointModel.js";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

export const ONPREM_VALIDATION_REQUIREMENTS = Object.freeze({
  iq: { required: true, template: "wave3/validation/iq-template.md" },
  oq: { required: true, evalDataset: "wave3/validation/eval-golden-v1.jsonl", passThreshold: 0.95 },
  pq: { required: true, windowDays: 30, metrics: ["groundedRate", "latencyP95", "userAcceptanceRate"] },
  changeControl: { required: true, triggerOn: ["modelWeightChange", "promptVersionBump", "gatewayConfigChange"] },
  drPlan: { required: true, rpo: "24h", rto: "4h" },
  modelCard: { required: true, template: "wave3/validation/model-card-template.md" },
});

/**
 * Register (or update) an on-prem endpoint for a tenant.
 */
export async function registerOnPremEndpoint({
  tenantId,
  endpointUrl,
  model,
  weightsSha256,
  authTokenRef,
  validationKit,
  registeredBy,
} = {}) {
  if (!tenantId || !endpointUrl || !model) {
    throw new Error("registerOnPremEndpoint: tenantId, endpointUrl, model required");
  }

  // Validate required validation-kit sections — we don't inspect content
  // depth; we only ensure the tenant has supplied references.
  const missing = [];
  for (const [k, v] of Object.entries(ONPREM_VALIDATION_REQUIREMENTS)) {
    if (v.required && (!validationKit || !validationKit[k])) missing.push(k);
  }
  if (missing.length) {
    throw new Error(`validation kit missing sections: ${missing.join(", ")}`);
  }

  const doc = await AiOnPremEndpoint.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        endpointUrl, model, weightsSha256, authTokenRef, validationKit,
        registeredBy, healthStatus: "unknown",
      },
    },
    { upsert: true, new: true }
  );

  // Run a health check immediately.
  const health = await healthCheckOnPrem({ tenantId }).catch((e) => ({ ok: false, error: e.message }));
  doc.healthStatus = health.ok ? "healthy" : "down";
  doc.lastHealthCheckAt = new Date();
  doc.lastHealthDetails = health;
  await doc.save();

  recordAiDecision({
    tenantId,
    actorId: registeredBy,
    feature: "onprem.register",
    output: { endpointUrl, model, health: doc.healthStatus },
    confidence: 1.0,
    grounded: true,
    provider: "admin",
    model,
    modelVersion: model,
    promptVersion: "onprem.register@1.0.0",
  }).catch(() => {});

  return { ok: true, endpoint: doc };
}

/**
 * Ping the tenant's vLLM endpoint. Many vLLM/Llama servers expose /health.
 * We tolerate shapes — any 2xx response is considered healthy.
 */
export async function healthCheckOnPrem({ tenantId } = {}) {
  if (!tenantId) throw new Error("healthCheckOnPrem: tenantId required");
  const endpoint = await AiOnPremEndpoint.findOne({ tenantId });
  if (!endpoint) throw new Error(`no on-prem endpoint registered for tenant ${tenantId}`);

  const url = endpoint.endpointUrl.replace(/\/+$/, "") + "/health";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    const ok = res.ok;
    const body = await res.text().catch(() => "");
    clearTimeout(timer);
    const status = ok ? "healthy" : "degraded";
    await AiOnPremEndpoint.updateOne(
      { tenantId },
      { $set: { healthStatus: status, lastHealthCheckAt: new Date(), lastHealthDetails: { httpStatus: res.status, bodyPreview: body.slice(0, 200) } } }
    );
    return { ok, status, httpStatus: res.status };
  } catch (err) {
    clearTimeout(timer);
    await AiOnPremEndpoint.updateOne(
      { tenantId },
      { $set: { healthStatus: "down", lastHealthCheckAt: new Date(), lastHealthDetails: { error: err.message } } }
    );
    return { ok: false, status: "down", error: err.message };
  }
}

export async function getEndpointForTenant(tenantId) {
  return AiOnPremEndpoint.findOne({ tenantId }).lean();
}
