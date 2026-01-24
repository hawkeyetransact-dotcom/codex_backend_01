import mongoose from "mongoose";

const monitoringSignalSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products" },
    source: { type: String, default: "INTERNAL" },
    type: { type: String, default: "GENERIC" },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "LOW" },
    status: { type: String, enum: ["OPEN", "ACKED", "RESOLVED"], default: "OPEN" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    detectedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

monitoringSignalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
monitoringSignalSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });
monitoringSignalSchema.index({ tenantId: 1, siteId: 1, createdAt: -1 });

export const MonitoringSignal = mongoose.model("monitoring-signals", monitoringSignalSchema);
