import mongoose from "mongoose";

const PlanStepSchema = new mongoose.Schema({
  tool: { type: String, required: true },
  input: { type: mongoose.Schema.Types.Mixed, default: {} },
  rationale: { type: String, default: "" },
  executed: { type: Boolean, default: false },
  executedAt: { type: Date },
  output: { type: mongoose.Schema.Types.Mixed },
  failure: { type: String },
  latencyMs: { type: Number },
}, { _id: false });

const AiAgentPlanSchema = new mongoose.Schema({
  planId: { type: String, required: true, unique: true, index: true },
  tenantId: { type: String, required: true, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  actorRole: { type: String },
  goal: { type: String, required: true },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  steps: { type: [PlanStepSchema], default: [] },
  budget: {
    maxSteps: { type: Number, default: 8 },
    maxTokens: { type: Number, default: 20000 },
    maxSeconds: { type: Number, default: 180 },
  },
  status: {
    type: String,
    enum: ["pending_approval", "approved", "executing", "completed", "failed", "cancelled", "reverted"],
    default: "pending_approval",
    index: true,
  },
  observations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  finalOutput: { type: mongoose.Schema.Types.Mixed },
  statusReason: { type: String },
  completedAt: { type: Date },
}, { timestamps: true, collection: "ai_agent_plans" });

export const AiAgentPlan = mongoose.model("ai-agent-plans", AiAgentPlanSchema);
