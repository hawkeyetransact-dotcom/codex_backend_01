import mongoose from "mongoose";

const AiSignalAlertSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  signalType: { type: String, required: true, enum: ["deviation_cluster", "supplier_drift", "capa_overdue_wave"] },
  clusterKey: { type: String, required: true },
  clusterSize: { type: Number, default: 0 },
  baselineFrequency: { type: Number, default: 0 },
  currentFrequency: { type: Number, default: 0 },
  zScore: { type: Number },
  sharedFeature: { type: String },
  members: { type: [mongoose.Schema.Types.Mixed], default: [] }, // references to deviations/capas
  status: { type: String, enum: ["open", "under_review", "closed_true_positive", "closed_false_positive"], default: "open", index: true },
  raisedAt: { type: Date, default: Date.now, index: true },
  closedAt: { type: Date },
  closureNote: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: "ai_signal_alerts" });

AiSignalAlertSchema.index({ tenantId: 1, status: 1, raisedAt: -1 });

export const AiSignalAlert = mongoose.model("ai-signal-alerts", AiSignalAlertSchema);
