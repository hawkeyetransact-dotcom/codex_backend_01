import mongoose from "mongoose";

const workflowMilestoneInstanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "tenant", required: true, index: true },
    workflowType: { type: String, enum: ["AUDIT"], required: true },
    workflowEntityType: { type: String, enum: ["AuditRequest"], required: true },
    workflowEntityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    milestoneCode: { type: String, required: true },
    status: { type: String, enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"], default: "NOT_STARTED" },
    responsibleUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    responsibleRole: { type: String, enum: ["buyer", "supplier", "auditor", "admin"] },
    expectedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    isOverdue: { type: Boolean, default: false },
    lastNotifiedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

workflowMilestoneInstanceSchema.index({ tenantId: 1, workflowEntityId: 1, milestoneCode: 1 }, { unique: true });
workflowMilestoneInstanceSchema.index({ tenantId: 1, expectedAt: 1, status: 1 });

export const WorkflowMilestoneInstance = mongoose.model("workflow_milestone_instances", workflowMilestoneInstanceSchema);
