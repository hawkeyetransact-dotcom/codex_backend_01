import mongoose from "mongoose";

const workflowInstanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    packKey: { type: String, required: true, trim: true, index: true },
    definitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_definitions",
      required: true,
      index: true,
    },
    definitionVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_definition_versions",
      required: true,
      index: true,
    },
    definitionVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: ["RUNNING", "COMPLETED", "BLOCKED", "CANCELLED"],
      default: "RUNNING",
      index: true,
    },
    currentNodeId: { type: String, default: "" },
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    roleAssignments: { type: mongoose.Schema.Types.Mixed, default: {} },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastEventSeq: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    blockedReason: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowInstanceSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
workflowInstanceSchema.index({ tenantId: 1, definitionId: 1, createdAt: -1 });
workflowInstanceSchema.index({ tenantId: 1, "legacyRefs.auditRequestId": 1 });

export const WorkflowInstance = mongoose.model(
  "workflow_instances",
  workflowInstanceSchema
);

