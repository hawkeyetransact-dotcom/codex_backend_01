import mongoose from "mongoose";

const ComplianceEventRawSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-connections", index: true },
    providerKey: { type: String, index: true },
    eventType: { type: String, index: true },
    sourceEventId: { type: String },
    receivedAt: { type: Date, default: Date.now },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    checksum: { type: String, index: true },
    ingestionRunId: { type: String },
  },
  { timestamps: true }
);

ComplianceEventRawSchema.index(
  { tenantId: 1, connectionId: 1, sourceEventId: 1, eventType: 1 },
  { unique: true, sparse: true }
);

export const ComplianceEventRaw = mongoose.model(
  "compliance-event-raw",
  ComplianceEventRawSchema
);
