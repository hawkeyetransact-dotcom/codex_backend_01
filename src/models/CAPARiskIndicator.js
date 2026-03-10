import mongoose from "mongoose";

const CAPARiskIndicatorSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    openCAPACount: { type: Number, default: 0 },
    criticalCAPACount: { type: Number, default: 0 },
    recurringCAPAFlag: { type: Boolean, default: false },
    overdueCAPAFlag: { type: Boolean, default: false },
    riskScore: { type: Number, default: 0 },
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW", index: true },
    sourceCounts: {
      internalCAPACount: { type: Number, default: 0 },
      externalCAPACount: { type: Number, default: 0 },
    },
    breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    modelVersion: { type: String, default: "eqms-v1" },
    computedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

CAPARiskIndicatorSchema.index({ tenantId: 1, supplierId: 1, siteId: 1 }, { unique: true });
CAPARiskIndicatorSchema.index({ tenantId: 1, riskLevel: 1, riskScore: -1 });

export const CAPARiskIndicator = mongoose.model("capa-risk-indicators", CAPARiskIndicatorSchema);
