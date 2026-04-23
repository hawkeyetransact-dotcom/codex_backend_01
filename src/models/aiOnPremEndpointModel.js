import mongoose from "mongoose";

const OnPremEndpointSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true, index: true },
  endpointUrl: { type: String, required: true },
  model: { type: String, required: true },
  weightsSha256: { type: String }, // expected weights hash, optional
  authTokenRef: { type: String }, // reference to SystemSetting where the actual token lives
  validationKit: { type: mongoose.Schema.Types.Mixed, default: {} },
  healthStatus: { type: String, enum: ["unknown", "healthy", "degraded", "down"], default: "unknown" },
  lastHealthCheckAt: { type: Date },
  lastHealthDetails: { type: mongoose.Schema.Types.Mixed },
  registeredAt: { type: Date, default: Date.now },
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
}, { timestamps: true, collection: "ai_onprem_endpoints" });

export const AiOnPremEndpoint = mongoose.model("ai-onprem-endpoints", OnPremEndpointSchema);
