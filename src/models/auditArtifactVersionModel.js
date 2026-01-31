import mongoose from "mongoose";

const auditArtifactVersionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    artifactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-artifacts",
      required: true,
      index: true,
    },
    version: { type: Number, required: true },
    status: { type: String },
    templateId: { type: Number, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    signatures: { type: mongoose.Schema.Types.Mixed, default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

auditArtifactVersionSchema.index({ tenantId: 1, auditId: 1, artifactId: 1, version: -1 });

export const AuditArtifactVersion = mongoose.model(
  "audit-artifact-versions",
  auditArtifactVersionSchema
);
