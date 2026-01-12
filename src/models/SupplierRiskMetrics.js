import mongoose from "mongoose";

const SupplierRiskMetricsSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
      unique: true,
    },
    questionnaireOnTimeRate: { type: Number, min: 0, max: 1, default: 0 },
    avgResponseHoursToFollowups: { type: Number, default: 0 },
    capaOverdueCount: { type: Number, default: 0 },
    capaReopenRate: { type: Number, min: 0, max: 1, default: 0 },
    evidenceQualityScore: { type: Number, min: 0, max: 100, default: 0 },
    docCompletenessScore: { type: Number, min: 0, max: 100, default: 0 },
    computedFrom: { type: String, enum: ["manual", "derived"], default: "manual" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

SupplierRiskMetricsSchema.index({ supplierId: 1 }, { unique: true });

export const SupplierRiskMetrics = mongoose.model(
  "supplier-risk-metrics",
  SupplierRiskMetricsSchema
);
