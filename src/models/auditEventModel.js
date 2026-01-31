import mongoose from "mongoose";

const auditEventSchema = new mongoose.Schema(
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
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditEventSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });
auditEventSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

export const AuditEvent = mongoose.model("audit-events", auditEventSchema);
