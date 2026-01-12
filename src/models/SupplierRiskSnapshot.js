import mongoose from "mongoose";

const BreakdownSchema = new mongoose.Schema(
  {
    regulatory: { type: Number, min: 0, max: 100, default: 0 },
    inspections: { type: Number, min: 0, max: 100, default: 0 },
    recalls: { type: Number, min: 0, max: 100, default: 0 },
    responsiveness: { type: Number, min: 0, max: 100, default: 0 },
    capa: { type: Number, min: 0, max: 100, default: 0 },
    transparency: { type: Number, min: 0, max: 100, default: 0 },
    evidenceTrust: { type: Number, min: 0, max: 100 },
    networkExposure: { type: Number, min: 0, max: 100 },
    trend: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

const V2Schema = new mongoose.Schema(
  {
    riskTrendSlope: { type: String, enum: ["UP", "DOWN", "FLAT"] },
    volatility: { type: Number },
    earlyWarnings: { type: [String], default: [] },
    evidenceTrustScore: { type: Number, min: 0, max: 100 },
    networkExposureScore: { type: Number, min: 0, max: 100 },
    auditorBiasFactor: { type: Number },
  },
  { _id: false }
);

const SupplierRiskSnapshotSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    riskModelVersion: { type: String, required: true },
    calculatedAt: { type: Date, default: Date.now, index: true },
    baselineScore: { type: Number, min: 0, max: 40, default: 0 },
    hawkeyeScore: { type: Number, min: 0, max: 60, default: 0 },
    finalScore: { type: Number, min: 0, max: 100, default: 0 },
    finalScoreV2: { type: Number, min: 0, max: 100 },
    riskBand: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    breakdown: { type: BreakdownSchema, default: () => ({}) },
    reasons: { type: [String], default: [] },
    v2: { type: V2Schema },
    debug: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: false }
);

SupplierRiskSnapshotSchema.index({ supplierId: 1, calculatedAt: -1 });

export const SupplierRiskSnapshot = mongoose.model(
  "supplier-risk-snapshots",
  SupplierRiskSnapshotSchema
);
