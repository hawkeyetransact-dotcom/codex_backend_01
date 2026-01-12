import mongoose from "mongoose";

const AuditTrailEventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditTrailEventSchema.index({ tenantId: 1, createdAt: -1 });

export const DigiLockerAuditTrailEvent = mongoose.model(
  "digilocker_audit_events",
  AuditTrailEventSchema
);
