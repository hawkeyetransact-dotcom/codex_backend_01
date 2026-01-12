import mongoose from "mongoose";

const DocumentVersionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_documents", required: true, index: true },
    versionLabel: { type: String, default: "v1.0" },
    effectiveDate: { type: Date },
    expiryDate: { type: Date, index: true },
    file: {
      storageProvider: { type: String, enum: ["local", "s3"], default: "local" },
      bucket: { type: String },
      key: { type: String },
      url: { type: String },
      originalFileName: { type: String },
      mimeType: { type: String },
      sizeBytes: { type: Number },
      checksumSha256: { type: String },
    },
    extractedTextRef: { type: String },
    extractedFields: {
      sopNumber: { type: String },
      docNumber: { type: String },
      revision: { type: String },
      siteName: { type: String },
      siteAddress: { type: String },
      productNames: { type: [String], default: [] },
      equipmentIds: { type: [String], default: [] },
      issuer: { type: String },
      signaturePresent: { type: Boolean },
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DocumentVersionSchema.index({ tenantId: 1, documentId: 1, expiryDate: 1 });

export const DigiLockerDocumentVersion = mongoose.model(
  "digilocker_document_versions",
  DocumentVersionSchema
);
