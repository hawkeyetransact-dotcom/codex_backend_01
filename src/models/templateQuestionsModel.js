import mongoose from "mongoose";

const templeteQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        categoryName: { type: String, required: true },
        templateId: { type: Number, ref: "template", required: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "categories", required: true },
        questionCode: { type: String }, // stable identifier per question
        subCategoryName: { type: String },
        normalizedQuestion: { type: String, index: true },
        riskcategory: { type: String },
        Audittype: { type: String },
        industry: { type: String },
        Physical: { type: String, enum: ["Y", "N"], default: "Y" },
        version: { type: Number, default: 1 },
        // Form rendering metadata
        answerType: { type: String, enum: ["radio", "checkbox", "text", "textarea", "number", "attachment"], default: "text" },
        options: [{ type: String }],
        helperText: { type: String },
        responseSchema: { type: mongoose.Schema.Types.Mixed }, // full JSON schema for rendering/validation
        extractionHints: {
          keywords: [{ type: String }],
          sections: [{ type: String }],
          expectedEntities: [{ type: String }],
          confidencePolicy: { type: String },
        },
        answerMapping: {
          type: { type: String, enum: ["yesno", "checkbox", "text", "select", "number"] },
          options: [
            {
              value: { type: String },
              aliases: [{ type: String }],
            },
          ],
          joinChar: { type: String, default: "|" },
        },
        subQuestions: [
          {
            key: { type: String },
            label: { type: String },
            answerType: { type: String, enum: ["radio", "checkbox", "text", "textarea", "number", "attachment"], default: "text" },
            options: [{ type: String }],
            helperText: { type: String },
          },
        ],
        order: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: {
            transform: function (doc, ret) {
                delete ret.__v;
                return ret;
            },
        },
    }
);

templeteQuestionSchema.index({ templateId: 1 });
templeteQuestionSchema.index({ categoryId: 1 });
templeteQuestionSchema.index({ categoryName: 1 });
templeteQuestionSchema.index({ templateId: 1, normalizedQuestion: 1 }, { unique: false });

export const TemplateQuestions = mongoose.model(
  "templateQuestions",    // Model name (used in code)
  templeteQuestionSchema,
  "templateQuestions"     // Exact collection name in MongoDB
);
