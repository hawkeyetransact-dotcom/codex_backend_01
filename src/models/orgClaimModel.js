import mongoose from "mongoose";

const orgClaimSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    claimType: {
      type: String,
      enum: ["PRIMARY", "AFFILIATE", "INFERRED", "PLATFORM_CREATED"],
      default: "PRIMARY",
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "REJECTED", "REVOKED"],
      default: "PENDING",
      index: true,
    },
    confidence: { type: Number, min: 0, max: 1, default: 1 },
    isPrimary: { type: Boolean, default: false, index: true },
    claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedAt: { type: Date, default: null },
    sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

orgClaimSchema.index({ orgId: 1, tenantId: 1 }, { unique: true });
orgClaimSchema.index({ tenantId: 1, status: 1, isPrimary: 1 });

export const OrgClaim = mongoose.model("org_claims", orgClaimSchema);
