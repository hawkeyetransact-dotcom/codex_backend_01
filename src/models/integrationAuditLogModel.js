import mongoose from "mongoose";

const IntegrationAuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

IntegrationAuditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const IntegrationAuditLog = mongoose.model(
  "integration-audit-logs",
  IntegrationAuditLogSchema
);
