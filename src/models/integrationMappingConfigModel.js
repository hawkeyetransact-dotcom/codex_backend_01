import mongoose from "mongoose";

const IntegrationMappingConfigSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-connections", index: true },
    eventType: {
      type: String,
      enum: ["CAPA", "DEVIATION", "CHANGE_CONTROL", "AUDIT_FINDING", "COMPLAINT", "BATCH_REJECTION"],
      required: true,
    },
    sourceToCanonicalMap: { type: mongoose.Schema.Types.Mixed, default: {} },
    transforms: { type: [mongoose.Schema.Types.Mixed], default: [] },
    fieldMasking: { type: [String], default: [] },
    approvedBySupplier: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

IntegrationMappingConfigSchema.index({ tenantId: 1, connectionId: 1, eventType: 1 }, { unique: true });

export const IntegrationMappingConfig = mongoose.model(
  "integration-mapping-configs",
  IntegrationMappingConfigSchema
);
