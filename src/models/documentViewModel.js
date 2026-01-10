import mongoose from "mongoose";

const documentViewSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "documents", index: true, required: true },
    viewType: { type: String, enum: ["AUDITOR", "BUYER"], required: true },
    version: { type: Number, default: 1 },
    redactionSpec: { type: Array, default: [] },
    generatedFileRef: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

documentViewSchema.index({ documentId: 1, viewType: 1, version: -1 });

export const DocumentView = mongoose.model("document_views", documentViewSchema);
