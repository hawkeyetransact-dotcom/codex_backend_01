import mongoose from "mongoose";

const approvalRequestSchema = new mongoose.Schema(
  {
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    reason: { type: String },
    decisionNote: { type: String },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

approvalRequestSchema.index({ tenant_id: 1, status: 1, createdAt: -1 });

export const ApprovalRequest = mongoose.model("approval_requests", approvalRequestSchema);
