import mongoose from "mongoose";

const workflowFormSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
    schema: { type: mongoose.Schema.Types.Mixed, default: {} },
    uiSchema: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowFormSchema.index({ tenantId: 1, key: 1, version: 1 }, { unique: true });
workflowFormSchema.index({ tenantId: 1, status: 1 });

export const WorkflowForm = mongoose.model("forms", workflowFormSchema);

