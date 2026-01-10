import mongoose from "mongoose";

const notificationOutboxSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    eventKey: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    channel: { type: String, enum: ["IN_APP", "EMAIL", "WEBHOOK", "SLACK", "TEAMS"], required: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING", index: true },
    scheduledAt: { type: Date, index: true },
    sentAt: { type: Date },
    attempts: { type: Number, default: 0 },
    error: { type: String },
  },
  { timestamps: true }
);

notificationOutboxSchema.index({ tenantId: 1, userId: 1, channel: 1, createdAt: -1 });

export const NotificationOutbox = mongoose.model("NotificationOutbox", notificationOutboxSchema, "notification_outbox");
