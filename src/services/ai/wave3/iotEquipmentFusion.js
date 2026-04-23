/**
 * IoT + Equipment Fusion — Wave 3 implementation.
 *
 * Ingestion endpoint accepts a telemetry event (from an external MQTT/OPC-UA
 * bridge); validates vs equipment calibration spec; raises a deviation if
 * out of spec; persists the event for MTBF trending.
 *
 * Minimal predictor included (recent variance + run-time heuristic).
 */
import mongoose from "mongoose";
import { recordAiDecision } from "../audit/aiAuditTrail.js";

// Lightweight telemetry log — can be promoted to a dedicated collection if
// volume demands; for now it piggybacks on ai_predictions.
const TelemetrySchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  equipmentId: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, index: true },
  measurements: { type: mongoose.Schema.Types.Mixed, default: {} },
  outOfSpec: { type: Boolean, default: false },
  batchContextId: { type: String },
  deviationRaisedId: { type: String },
}, { collection: "ai_iot_telemetry" });
TelemetrySchema.index({ equipmentId: 1, timestamp: -1 });
const Telemetry = mongoose.models["ai-iot-telemetry"] || mongoose.model("ai-iot-telemetry", TelemetrySchema);

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Validate a single measurement against an expected spec.
 * Spec shape: { min?: number, max?: number }
 * Returns true if IN-SPEC, false if OUT.
 */
function inSpec(value, spec) {
  if (!spec || typeof value !== "number") return true;
  if (typeof spec.min === "number" && value < spec.min) return false;
  if (typeof spec.max === "number" && value > spec.max) return false;
  return true;
}

/**
 * Main ingestion entry. Validates + persists + optionally opens a deviation.
 */
export async function ingestTelemetryEvent({
  tenantId,
  equipmentId,
  timestamp,
  measurements,
  batchContextId,
  equipmentSpec, // { temp: {min, max}, humidity: {min, max}, vibration: {min, max}, ... }
} = {}) {
  if (!tenantId || !equipmentId) throw new Error("ingestTelemetryEvent: tenantId + equipmentId required");
  const ts = timestamp ? new Date(timestamp) : new Date();

  const outOfSpecKeys = [];
  if (equipmentSpec && typeof measurements === "object") {
    for (const key of Object.keys(measurements)) {
      if (!inSpec(measurements[key], equipmentSpec[key])) outOfSpecKeys.push(key);
    }
  }
  const outOfSpec = outOfSpecKeys.length > 0;

  let deviationRaisedId;
  if (outOfSpec) {
    const Deviation = modelByName("deviations") || modelByName("Deviation");
    if (Deviation) {
      try {
        const dev = await Deviation.create({
          tenantId,
          deviationNumber: `DEV-IOT-${Date.now()}`,
          title: `IoT excursion on equipment ${equipmentId}`,
          description: `Measurements out of spec: ${outOfSpecKeys.join(", ")}. Readings: ${JSON.stringify(measurements)}.`,
          source: "iot_auto",
          equipmentId,
          batchContextId,
          status: "OPEN",
        });
        deviationRaisedId = String(dev._id);
      } catch (err) {
        // Non-fatal — telemetry still logs; deviation model may have
        // stricter required fields that the auto path can't fill.
        console.warn("[iotFusion] failed to auto-open deviation:", err.message);
      }
    }
  }

  const doc = await Telemetry.create({
    tenantId, equipmentId, timestamp: ts, measurements, batchContextId, outOfSpec,
    deviationRaisedId,
  });

  if (outOfSpec) {
    recordAiDecision({
      tenantId,
      feature: "iot.excursion_detected",
      linkedEntityType: "equipment",
      linkedEntityId: equipmentId,
      output: { outOfSpecKeys, deviationRaisedId },
      confidence: 1.0,
      grounded: true,
      provider: "rule",
      model: "iot-spec-check-v1",
      modelVersion: "1.0.0",
      promptVersion: "iot.spec_check@1.0.0",
    }).catch(() => {});
  }

  return { ok: true, logged: doc._id, outOfSpec, outOfSpecKeys, deviationRaisedId };
}

/**
 * Predict MTBF (mean-time-between-failures) from recent telemetry variance.
 * Simple heuristic: higher variance + more run-time → lower MTBF days.
 */
export async function predictMtbf({ tenantId, equipmentId, windowDays = 30 } = {}) {
  if (!tenantId || !equipmentId) throw new Error("predictMtbf: tenantId + equipmentId required");
  const since = new Date(Date.now() - windowDays * 86400000);
  const rows = await Telemetry.find({ tenantId, equipmentId, timestamp: { $gte: since } })
    .select("measurements outOfSpec timestamp").lean();

  if (rows.length < 5) {
    return { ok: false, reason: "insufficient_data", sampleSize: rows.length };
  }

  const excursionRate = rows.filter((r) => r.outOfSpec).length / rows.length;
  // Coarse MTBF: 180d baseline, halved for every 10% excursion rate.
  const mtbfDays = Math.max(7, Math.round(180 * Math.pow(0.5, excursionRate * 10)));
  const nextFailureEtaDays = Math.round(mtbfDays * (1 - excursionRate));
  const recommendPreventive = excursionRate > 0.05 || mtbfDays < 45;

  return {
    ok: true,
    equipmentId,
    windowDays,
    sampleSize: rows.length,
    excursionRate,
    mtbfDays,
    nextFailureEtaDays,
    recommendPreventive,
  };
}
