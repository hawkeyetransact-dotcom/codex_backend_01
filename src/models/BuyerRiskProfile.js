import mongoose from "mongoose";

const WeightSchema = new mongoose.Schema(
  {
    regulatory: { type: Number, default: 1 },
    inspections: { type: Number, default: 1 },
    recalls: { type: Number, default: 1 },
    responsiveness: { type: Number, default: 1 },
    capa: { type: Number, default: 1 },
    transparency: { type: Number, default: 1 },
    evidenceTrust: { type: Number, default: 1 },
    networkExposure: { type: Number, default: 1 },
    trend: { type: Number, default: 1 },
  },
  { _id: false }
);

const BuyerRiskProfileSchema = new mongoose.Schema(
  {
    buyerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    name: { type: String, required: true },
    weights: { type: WeightSchema, default: () => ({}) },
    productCriticalityRules: {
      type: [
        new mongoose.Schema(
          { productType: { type: String }, multiplier: { type: Number, default: 1 } },
          { _id: false }
        ),
      ],
      default: [],
    },
    markets: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false },
    version: { type: String, default: "v1" },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: false }
);

BuyerRiskProfileSchema.index({ buyerTenantId: 1 });

export const BuyerRiskProfile = mongoose.model(
  "buyer-risk-profiles",
  BuyerRiskProfileSchema
);
