import mongoose from "mongoose";

const EvidenceUploadSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    fileName: { type: String, required: true },
    fileSha256: { type: String, required: true, index: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    pageCount: { type: Number, default: 0 },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing", index: true },
    error: { type: String },
  },
  { timestamps: true }
);

EvidenceUploadSchema.index({ tenantId: 1, createdAt: -1 });
EvidenceUploadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const EvidenceUpload = mongoose.model("evidence_uploads", EvidenceUploadSchema);

export default EvidenceUpload;
