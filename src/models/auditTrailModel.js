import mongoose from "mongoose";

const auditTrailSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      required: true,
    },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    actorRole: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditTrailSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });
auditTrailSchema.index({ tenantId: 1, entityType: 1, createdAt: -1 });
auditTrailSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

export const AuditTrail = mongoose.model("audit-trails", auditTrailSchema);
