import mongoose from "mongoose";

const templeteQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        categoryName: { type: String, required: true },
        templateId: { type: Number, ref: "template", required: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "categories", required: true },
        riskcategory: { type: String },
        Audittype: { type: String },
        industry: { type: String },
        Physical: { type: String, enum: ["Y", "N"], default: "Y" },
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

export const TemplateQuestions = mongoose.model(
    "templateQuestions",    // Model name (used in code)
    templeteQuestionSchema,
    "templateQuestions"     // Exact collection name in MongoDB
);
