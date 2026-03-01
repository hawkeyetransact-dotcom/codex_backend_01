import mongoose from "mongoose";

const COMPLIANCE_GUIDELINE_DOCUMENT_STATUSES = [
  "PROCESSING",
  "ACTIVE",
  "ARCHIVED",
  "FAILED",
];

const COMPLIANCE_GUIDELINE_DOCUMENT_SOURCES = ["STANDARD_CONTROL_SEED", "UPLOADED_GUIDELINE"];

const complianceGuidelineDocumentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    standardKey: { type: String, required: true, uppercase: true, trim: true, index: true },
    standardVersion: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: COMPLIANCE_GUIDELINE_DOCUMENT_STATUSES,
      default: "PROCESSING",
      index: true,
    },
    sourceType: {
      type: String,
      enum: COMPLIANCE_GUIDELINE_DOCUMENT_SOURCES,
      default: "UPLOADED_GUIDELINE",
      index: true,
    },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, default: "application/octet-stream" },
    fileSize: { type: Number, default: 0 },
    contentHash: { type: String, required: true, trim: true, index: true },
    extractedTextLength: { type: Number, default: 0 },
    instructionContext: { type: String, default: "" },
    contextTags: { type: [String], default: [] },
    vectorCount: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorMessage: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

complianceGuidelineDocumentSchema.index({ tenantId: 1, standardKey: 1, standardVersion: 1, status: 1 });
complianceGuidelineDocumentSchema.index({ tenantId: 1, standardKey: 1, standardVersion: 1, contentHash: 1 });
complianceGuidelineDocumentSchema.index({
  tenantId: 1,
  standardKey: 1,
  standardVersion: 1,
  sourceType: 1,
  status: 1,
});

export const ComplianceGuidelineDocument = mongoose.model(
  "compliance_guideline_documents",
  complianceGuidelineDocumentSchema
);

export { COMPLIANCE_GUIDELINE_DOCUMENT_STATUSES, COMPLIANCE_GUIDELINE_DOCUMENT_SOURCES };
