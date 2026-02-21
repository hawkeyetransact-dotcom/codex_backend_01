import mongoose from "mongoose";

const workflowDefinitionVersionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    definitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_definitions",
      required: true,
      index: true,
    },
    packKey: { type: String, required: true, trim: true, index: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
    schemaVersion: { type: Number, default: 1 },
    definition: { type: mongoose.Schema.Types.Mixed, required: true },
    checksum: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowDefinitionVersionSchema.index({ definitionId: 1, version: 1 }, { unique: true });
workflowDefinitionVersionSchema.index({ tenantId: 1, packKey: 1, status: 1 });
workflowDefinitionVersionSchema.index({ tenantId: 1, createdAt: -1 });

export const WorkflowDefinitionVersion = mongoose.model(
  "workflow_definition_versions",
  workflowDefinitionVersionSchema
);

