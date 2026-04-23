import mongoose from "mongoose";

const AiPredictionSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  feature: { type: String, required: true, index: true }, // e.g. "capa.outcome"
  subjectType: { type: String, required: true }, // e.g. "capa"
  subjectId: { type: String, required: true, index: true },
  predictions: { type: mongoose.Schema.Types.Mixed, default: {} }, // {pOnTime, pEffective, ...}
  topFactors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  modelVersion: { type: String },
  confidence: { type: Number },
  createdAt: { type: Date, default: Date.now, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
}, { collection: "ai_predictions" });

export const AiPrediction = mongoose.model("ai-predictions", AiPredictionSchema);
