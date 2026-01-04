import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    recipientRole: { type: String },
    type: { type: String, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    action: {
      label: { type: String },
      url: { type: String },
    },
    channels: { type: [String], default: ["inApp"] },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    snoozedUntil: { type: Date },
    expiresAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    idempotencyKey: { type: String, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

NotificationSchema.index({ tenantId: 1, recipientUserId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ tenantId: 1, type: 1, createdAt: -1 });

export default mongoose.model("Notification", NotificationSchema);
