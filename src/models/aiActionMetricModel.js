import mongoose from "mongoose";

const aiActionMetricSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, required: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    actionKey: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    userRole: { type: String, default: "" },
    status: { type: String, enum: ["success", "error"], default: "success", index: true },
    inputCount: { type: Number, default: 0 },
    outputCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

aiActionMetricSchema.index({ tenantId: 1, actionKey: 1, createdAt: -1 });
aiActionMetricSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });

export const AiActionMetric = mongoose.model("ai_action_metrics", aiActionMetricSchema);
