import mongoose from "mongoose";

const redact = (text) => {
  if (!text) return text;
  return String(text).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]");
};

const adminAuditLogSchema = new mongoose.Schema(
  {
    tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    adminScope: { type: String, enum: ["NONE", "TENANT", "PLATFORM"], default: "NONE" },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    details: { type: String },
    ip: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        if (ret.details) ret.details = redact(ret.details);
        return ret;
      },
    },
  }
);

adminAuditLogSchema.index({ tenant_id: 1, createdAt: -1 });

export const AdminAuditLog = mongoose.model("admin_audit_logs", adminAuditLogSchema);
