import mongoose from "mongoose";

const userNotificationPreferenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    eventKey: { type: String, required: true, index: true },
    channelOverrides: {
      type: [String],
      enum: ["IN_APP", "EMAIL", "WEBHOOK", "SLACK", "TEAMS"],
      default: undefined,
    },
    mutedUntil: { type: Date },
    snoozeRules: { type: mongoose.Schema.Types.Mixed },
    deliveryModeOverride: { type: String, enum: ["REALTIME", "DIGEST_DAILY", "DIGEST_WEEKLY"] },
  },
  { timestamps: true }
);

userNotificationPreferenceSchema.index({ tenantId: 1, userId: 1, eventKey: 1 }, { unique: true });

export const UserNotificationPreference = mongoose.model(
  "UserNotificationPreference",
  userNotificationPreferenceSchema,
  "user_notification_preferences"
);
