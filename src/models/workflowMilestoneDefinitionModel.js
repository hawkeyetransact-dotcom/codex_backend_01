import mongoose from "mongoose";

const workflowMilestoneDefinitionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "tenant", required: true, index: true },
    workflowType: { type: String, enum: ["AUDIT"], required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    defaultResponsibleRole: { type: String, enum: ["buyer", "supplier", "auditor", "admin"], required: true },
    defaultDurationHours: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

workflowMilestoneDefinitionSchema.index({ tenantId: 1, workflowType: 1, code: 1 }, { unique: true });

export const WorkflowMilestoneDefinition = mongoose.model("workflow_milestone_definitions", workflowMilestoneDefinitionSchema);
