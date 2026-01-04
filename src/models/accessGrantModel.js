import mongoose from "mongoose";

const accessGrantSchema = new mongoose.Schema(
  {
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    granteeUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    expiresAt: { type: Date },
    status: { type: String, enum: ["ACTIVE", "REVOKED", "EXPIRED"], default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

accessGrantSchema.index({ tenant_id: 1, resourceId: 1, status: 1 });
accessGrantSchema.index({ granteeUserId: 1, resourceId: 1, status: 1 });

export const AccessGrant = mongoose.model("access_grants", accessGrantSchema);
