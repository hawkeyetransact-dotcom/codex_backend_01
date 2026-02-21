import mongoose from "mongoose";

const workflowTaskSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    instanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_instances",
      required: true,
      index: true,
    },
    nodeId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    assigneeUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null, index: true },
    assigneeRole: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "OPEN",
      index: true,
    },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    formRef: { type: String, default: "" },
    output: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowTaskSchema.index({ tenantId: 1, assigneeUserId: 1, status: 1, dueAt: 1 });
workflowTaskSchema.index({ tenantId: 1, assigneeRole: 1, status: 1, dueAt: 1 });
workflowTaskSchema.index({ tenantId: 1, instanceId: 1, status: 1 });

export const WorkflowTask = mongoose.model("tasks", workflowTaskSchema);

