// models/User.js
import mongoose from "mongoose";

const customAuditQuestionSchema = new mongoose.Schema(
    {
        supplier_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        observationId: { type: String, required: false },
        question: { type: String, required: false },
        categoryName: { type: String, required: false },
        processingStatus: {
            type: String,
            enum: ['processing', 'completed', 'failed'],
            default: 'processing'
          }
    },
    { timestamps: true }
);

export const CustomAuditQuestions = mongoose.model("customAudit-question", customAuditQuestionSchema);
