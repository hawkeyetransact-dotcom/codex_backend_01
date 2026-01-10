import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "tenants", index: true, required: true },
    uploaderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
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

export const Document = mongoose.model("documents", documentSchema);
