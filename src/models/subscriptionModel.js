import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true, index: true },
    plan: { type: String, enum: ["FREE", "STANDARD", "PREMIUM", "ENTERPRISE"], default: "FREE" },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED", "CANCELLED"], default: "ACTIVE" },
    seats: { type: Number, default: 10 },
    entitlements: { type: [String], default: [] },
    renewalDate: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

subscriptionSchema.index({ tenant_id: 1, status: 1 });

export const Subscription = mongoose.model("subscriptions", subscriptionSchema);
