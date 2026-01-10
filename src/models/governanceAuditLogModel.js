import mongoose from "mongoose";

const governanceAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    actorPersona: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String, index: true },
    diff: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

governanceAuditLogSchema.index({ createdAt: -1 });
governanceAuditLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

export const GovernanceAuditLog = mongoose.model(
  "GovernanceAuditLog",
  governanceAuditLogSchema,
  "governance_audit_logs"
);
