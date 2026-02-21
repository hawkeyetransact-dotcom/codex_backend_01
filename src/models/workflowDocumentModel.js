import mongoose from "mongoose";

const workflowDocumentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    instanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "workflow_instances",
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["DIGILOCKER", "AUDIT_ATTACHMENT", "UPLOAD", "EXTERNAL_URL"],
      default: "UPLOAD",
      index: true,
    },
    sourceRef: { type: String, default: "" },
    title: { type: String, required: true },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    fileRef: { type: String, default: "" },
    tags: { type: [String], default: [] },
    linkedNodeId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

workflowDocumentSchema.index({ tenantId: 1, instanceId: 1, createdAt: -1 });
workflowDocumentSchema.index({ tenantId: 1, sourceType: 1 });
workflowDocumentSchema.index({ tenantId: 1, tags: 1 });

export const WorkflowDocument = mongoose.model("workflow_documents", workflowDocumentSchema);

