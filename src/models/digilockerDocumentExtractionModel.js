import mongoose from "mongoose";

const SuggestedTagSchema = new mongoose.Schema(
  {
    tag: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
  },
  { _id: false }
);

const DocumentExtractionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_documents", required: true, index: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_document_versions", required: true, index: true },
    provider: { type: String, default: "mock" },
    classification: {
      docTypeGuess: { type: String },
      departmentGuess: { type: String },
      confidence: { type: Number, min: 0, max: 1 },
    },
    suggestedTags: { type: [SuggestedTagSchema], default: [] },
    suggestedSiteId: { type: mongoose.Schema.Types.ObjectId },
    suggestedProductId: { type: mongoose.Schema.Types.ObjectId },
    suggestedSiteConfidence: { type: Number, min: 0, max: 1 },
    suggestedProductConfidence: { type: Number, min: 0, max: 1 },
    keyFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    embeddingsRef: { type: String },
  },
  { timestamps: true }
);

DocumentExtractionSchema.index({ tenantId: 1, documentId: 1, versionId: 1 });

export const DigiLockerDocumentExtraction = mongoose.model(
  "digilocker_document_extractions",
  DocumentExtractionSchema
);
