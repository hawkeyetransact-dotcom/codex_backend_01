import mongoose from "mongoose";

const NotificationDeliveryLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification", required: true },
    channel: { type: String, required: true }, // e.g., inApp, email
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
    error: { type: String },
    metadata: { type: Object },
  },
  { timestamps: true }
);

export default mongoose.model("NotificationDeliveryLog", NotificationDeliveryLogSchema);
