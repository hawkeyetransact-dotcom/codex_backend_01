import mongoose from "mongoose";

const AvailabilityBlockSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true, default: null },
    ownerType: { type: String, enum: ["auditor", "supplier", "supplierSite", "buyer"], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    blockType: { type: String, enum: ["available", "blackout", "conditional"], default: "available" },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    timezone: { type: String, default: "UTC" },
    conditions: { type: mongoose.Schema.Types.Mixed },
    recurrence: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

AvailabilityBlockSchema.index({ ownerType: 1, ownerId: 1, start: 1, end: 1 });

export const AvailabilityBlock = mongoose.model("AvailabilityBlock", AvailabilityBlockSchema);
