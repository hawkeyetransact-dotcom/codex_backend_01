import mongoose from "mongoose";

const quietHoursSchema = new mongoose.Schema(
  {
    start: { type: String },
    end: { type: String },
    timezone: { type: String },
  },
  { _id: false }
);

const escalationSchema = new mongoose.Schema(
  {
    afterMinutes: { type: Number },
    escalateToPersonas: { type: [String], default: undefined },
    maxEscalations: { type: Number },
  },
  { _id: false }
);

const notificationPolicySchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["PLATFORM_DEFAULT", "TENANT_OVERRIDE"],
      required: true,
      index: true,
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    persona: {
      type: String,
      enum: ["PLATFORM_ADMIN", "TENANT_ADMIN", "AUDITOR", "SUPPLIER_ADMIN", "SUPPLIER_USER", "BUYER_USER"],
      required: true,
      index: true,
    },
    eventKey: { type: String, required: true, index: true },
    allowedChannels: {
      type: [String],
      enum: ["IN_APP", "EMAIL", "WEBHOOK", "SLACK", "TEAMS"],
      default: ["IN_APP"],
    },
    deliveryMode: { type: String, enum: ["REALTIME", "DIGEST_DAILY", "DIGEST_WEEKLY"], default: "REALTIME" },
    quietHours: { type: quietHoursSchema },
    escalation: { type: escalationSchema },
    isEnabled: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

notificationPolicySchema.index(
  { scope: 1, persona: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { scope: "PLATFORM_DEFAULT" } }
);
notificationPolicySchema.index(
  { tenantId: 1, persona: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { scope: "TENANT_OVERRIDE" } }
);

notificationPolicySchema.pre("validate", function (next) {
  if (this.scope === "TENANT_OVERRIDE" && !this.tenantId) {
    return next(new Error("tenantId is required for TENANT_OVERRIDE policies"));
  }
  if (this.scope === "PLATFORM_DEFAULT") {
    this.tenantId = null;
  }
  next();
});

export const NotificationPolicy = mongoose.model("NotificationPolicy", notificationPolicySchema, "notification_policies");
