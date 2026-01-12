import mongoose from "mongoose";

const IntegrationProviderSchema = new mongoose.Schema(
  {
    providerKey: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    category: {
      type: String,
      enum: ["QMS", "ERP", "LIMS", "MES", "Generic"],
      default: "Generic",
    },
    capabilities: {
      supportsWebhook: { type: Boolean, default: false },
      supportsPolling: { type: Boolean, default: false },
      supportsSftp: { type: Boolean, default: false },
      supportsCsv: { type: Boolean, default: false },
      supportsApiAuth: { type: Boolean, default: false },
    },
    configSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
    mappingTemplates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isEnabled: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const IntegrationProvider = mongoose.model(
  "integration-providers",
  IntegrationProviderSchema
);
