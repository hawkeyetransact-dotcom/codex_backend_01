import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "tenants", index: true, required: true },
    uploaderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    ownerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      default: null,
      index: true,
    },
    classification: {
      type: String,
      enum: ["internal", "shared", "audit_only", "public"],
      default: "internal",
      index: true,
    },
    contextType: { type: String, required: true, index: true },
    contextRef: { type: String, required: true, index: true },
    originalFileRef: { type: String, required: true },
    fileName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "REDACTION_ACCEPTED", "SHARED"],
      default: "DRAFT",
    },
    encryptionMode: {
      type: String,
      enum: ["STANDARD", "ENHANCED", "ZERO_KNOWLEDGE"],
      default: "STANDARD",
    },
    encryptionMeta: { type: mongoose.Schema.Types.Mixed },
    fileHash: { type: String, default: "" },
    processingConsent: { type: Boolean, default: false },
    redactionDraft: { type: Array, default: [] },
    redactedText: { type: String, default: "" },
  },
  { timestamps: true }
);

documentSchema.index({ tenantId: 1, contextType: 1, contextRef: 1, createdAt: -1 });
documentSchema.index({ ownerOrgId: 1, engagementId: 1, classification: 1 });

export const Document = mongoose.model("documents", documentSchema);
