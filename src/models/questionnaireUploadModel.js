import mongoose from "mongoose";

const questionnaireUploadSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
    },
    message: { type: String, default: "" },
    templateId: { type: Number, default: null },
    templateType: { type: String, default: null },
    assessmentTypeId: { type: mongoose.Schema.Types.ObjectId, ref: "assessment-types", default: null },
    version: { type: Number, default: 1 },
    questions: [
      {
        question: String,
        categoryName: String,
        subCategoryName: String,
        answerType: String,
        options: [String],
      },
    ],
    categories: [String],
    subCategories: [String],
    sourceUrl: { type: String, default: "" }, // e.g., S3 URL if later added
    delta: {
      existingCount: { type: Number, default: 0 },
      newCount: { type: Number, default: 0 },
      duplicateCount: { type: Number, default: 0 },
    },
    metadata: {
      usedOcr: { type: Boolean, default: false },
      textSource: { type: String, default: "" },
      characterCount: { type: Number, default: 0 },
    },
    extractionConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

questionnaireUploadSchema.index({ uploadedBy: 1 });
questionnaireUploadSchema.index({ status: 1 });

export const QuestionnaireUpload = mongoose.model(
  "questionnaireUploads",
  questionnaireUploadSchema,
  "questionnaireUploads"
);
