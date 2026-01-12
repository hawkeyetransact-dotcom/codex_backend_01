import mongoose from "mongoose";

const IntegrationRunLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "integration-connections", index: true },
    runType: { type: String, enum: ["MANUAL", "SCHEDULED", "WEBHOOK"], required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    status: { type: String, enum: ["Success", "Partial", "Failed"], default: "Success" },
    stats: {
      fetched: { type: Number, default: 0 },
      ingestedRaw: { type: Number, default: 0 },
      normalized: { type: Number, default: 0 },
      deduped: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
    errorSummary: { type: String },
    traceId: { type: String },
  },
  { timestamps: true }
);

IntegrationRunLogSchema.index({ tenantId: 1, connectionId: 1, startedAt: -1 });

export const IntegrationRunLog = mongoose.model(
  "integration-run-logs",
  IntegrationRunLogSchema
);
