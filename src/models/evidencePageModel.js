import mongoose from "mongoose";

const EvidencePageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    uploadId: { type: mongoose.Schema.Types.ObjectId, ref: "evidence_uploads", index: true, required: true },
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    fileName: { type: String, required: true },
    fileSha256: { type: String, required: true },
    mime: { type: String, required: true },
    pageNumber: { type: Number, required: true },
    text: { type: String, default: "" },
  },
  { timestamps: true }
);

EvidencePageSchema.index({ tenantId: 1, uploadId: 1, pageNumber: 1 }, { unique: true });
EvidencePageSchema.index({ tenantId: 1, pageNumber: 1 });

const EvidencePage = mongoose.model("evidence_pages", EvidencePageSchema);

export default EvidencePage;
