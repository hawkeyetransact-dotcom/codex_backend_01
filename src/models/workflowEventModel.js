import mongoose from "mongoose";

const workflowEventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    instanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_instances",
      required: true,
      index: true,
    },
    seq: { type: Number, required: true },
    eventType: { type: String, required: true, index: true },
    nodeId: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    actorRole: { type: String, default: "" },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

workflowEventSchema.index({ instanceId: 1, seq: 1 }, { unique: true });
workflowEventSchema.index({ tenantId: 1, instanceId: 1, occurredAt: 1 });
workflowEventSchema.index({ tenantId: 1, eventType: 1, occurredAt: -1 });

export const WorkflowEvent = mongoose.model("workflow_events", workflowEventSchema);

