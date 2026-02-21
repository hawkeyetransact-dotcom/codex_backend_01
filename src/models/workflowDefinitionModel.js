import mongoose from "mongoose";

const workflowDefinitionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    packKey: { type: String, required: true, trim: true, index: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
    latestVersion: { type: Number, default: 0 },
    latestVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "workflow_definition_versions", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowDefinitionSchema.index({ tenantId: 1, key: 1 }, { unique: true });
workflowDefinitionSchema.index({ tenantId: 1, packKey: 1, status: 1 });
workflowDefinitionSchema.index({ tenantId: 1, updatedAt: -1 });

export const WorkflowDefinition = mongoose.model(
  "workflow_definitions",
  workflowDefinitionSchema
);

