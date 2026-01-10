import mongoose from "mongoose";

const notificationEventSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["WORKFLOW", "RISK", "SYSTEM", "COMMERCIAL"],
      required: true,
    },
    severity: { type: String, enum: ["INFO", "WARN", "CRITICAL"], default: "INFO" },
    payloadSchema: { type: mongoose.Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const NotificationEvent = mongoose.model("NotificationEvent", notificationEventSchema, "notification_events");
