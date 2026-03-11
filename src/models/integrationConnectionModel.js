import mongoose from "mongoose";

const IntegrationConnectionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    ownerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    sharedOrgIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "organizations" }],
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    ownerRole: {
      type: String,
      enum: ["supplier", "supplierUser", "buyer", "auditor", "tenant_admin", "admin", "superadmin"],
      default: "supplier",
      index: true,
    },
    workspaceMode: { type: String, enum: ["TEAM", "SOLO"], default: "TEAM", index: true },
    providerKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["Draft", "Testing", "Active", "Paused", "Error", "Revoked"],
      default: "Draft",
      index: true,
    },
    auth: {
      authType: {
        type: String,
        enum: ["API_KEY", "OAUTH2", "BASIC", "MTLS", "NONE"],
        default: "NONE",
      },
      credentialsRef: { type: String },
      tokenExpiresAt: { type: Date },
    },
    endpoint: {
      baseUrl: { type: String },
      webhookUrl: { type: String },
      sftpHost: { type: String },
      sftpPath: { type: String },
    },
    selectedFeeds: [
      {
        eventType: {
          type: String,
          enum: ["CAPA", "DEVIATION", "CHANGE_CONTROL", "AUDIT_FINDING", "COMPLAINT", "BATCH_REJECTION"],
          required: true,
        },
        enabled: { type: Boolean, default: true },
      },
    ],
    syncMode: {
      type: String,
      enum: ["SNAPSHOT", "DELTA", "EVENT"],
      default: "DELTA",
    },
    schedule: {
      frequencyMins: { type: Number, default: 240 },
      timezone: { type: String, default: "America/Chicago" },
      lastRunAt: { type: Date },
      nextRunAt: { type: Date },
      cursor: { type: String },
    },
    mappingConfigId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-mapping-configs" },
    visibilityPolicy: {
      shareWithBuyerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
      shareLevel: {
        type: String,
        enum: ["AGGREGATED_ONLY", "RAW_EVENTS", "METRICS_PLUS_SAMPLES"],
        default: "AGGREGATED_ONLY",
      },
      retentionDays: { type: Number, default: 365 },
    },
    health: {
      lastSuccessAt: { type: Date },
      lastErrorAt: { type: Date },
      lastErrorMessage: { type: String },
      consecutiveFailures: { type: Number, default: 0 },
    },
    demoMode: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

IntegrationConnectionSchema.index({ tenantId: 1, supplierId: 1, providerKey: 1 });
IntegrationConnectionSchema.index({ tenantId: 1, ownerUserId: 1, providerKey: 1 });
IntegrationConnectionSchema.index({ ownerOrgId: 1, providerKey: 1 });

export const IntegrationConnection = mongoose.model(
  "integration-connections",
  IntegrationConnectionSchema
);
