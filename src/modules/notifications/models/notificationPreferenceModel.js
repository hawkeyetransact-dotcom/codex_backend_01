import mongoose from "mongoose";

const NotificationPreferenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true, unique: true },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    digestMode: { type: String, enum: ["immediate", "daily", "weekly"], default: "immediate" },
    doNotDisturb: {
      startTime: { type: String, default: null }, // "22:00"
      endTime: { type: String, default: null },   // "07:00"
    },
    mutedTypes: { type: [String], default: [] },
    minimumSeverity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
  },
  { timestamps: true }
);

export default mongoose.model("NotificationPreference", NotificationPreferenceSchema);
