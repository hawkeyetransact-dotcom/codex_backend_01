import mongoose from "mongoose";

const COMPLIANCE_GUIDELINE_VECTOR_STATUSES = ["ACTIVE", "ARCHIVED"];

const complianceGuidelineVectorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    standardKey: { type: String, required: true, uppercase: true, trim: true, index: true },
    standardVersion: { type: String, required: true, trim: true, index: true },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "compliance_guideline_documents",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: COMPLIANCE_GUIDELINE_VECTOR_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    chunkOrder: { type: Number, default: 0, min: 0 },
    chunkText: { type: String, required: true },
    tokenCount: { type: Number, default: 0 },
    embedding: { type: [Number], default: [] },
    embeddingNorm: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

complianceGuidelineVectorSchema.index({
  tenantId: 1,
  standardKey: 1,
  standardVersion: 1,
  status: 1,
  updatedAt: -1,
});
complianceGuidelineVectorSchema.index({ documentId: 1, chunkOrder: 1 }, { unique: true });

export const ComplianceGuidelineVector = mongoose.model(
  "compliance_guideline_vectors",
  complianceGuidelineVectorSchema
);

export { COMPLIANCE_GUIDELINE_VECTOR_STATUSES };
