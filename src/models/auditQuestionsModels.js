// models/User.js
import mongoose from "mongoose";

const auditQuestionSchema = new mongoose.Schema(
    {
        question_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "templateQuestions",
            required: true,
        },
        auditRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AuditRequestMaster",
            required: true,
        },
        question: { type: String, required: true },
        categoryName: { type: String, required: true },
        templateId: { type: Number, ref: "template", required: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "categories", required: true },
        YesNoAnswers: { type: String, enum: ['Yes', 'No', 'NA', null], default: null },
        textResponse: { type: String, required: false },
        internalNotes: { type: String, required: false },
        isComplient: { type: String, enum: ['Yes', 'No'], default: null },
        flagStatus: {
            type: String,
            enum: ['auditor_flagged', 'supplier_responded', 'auditor_accepted'],
            default: 'auditor_accepted',
        },
        messages: { type: String, required: false },
        docUrls: { type: String, required: false },
        PhysicalAuditRequired: { type: Boolean, default: false },
        responseStatus: {
            type: String,
            enum: ['supplier_draft', 'supplier_submitted', 'auditor_draft', 'auditor_submitted'],
            default: 'supplier_draft'
        },
    },
    { timestamps: true }
);

// Indexes for frequent queries
auditQuestionSchema.index({ auditRequestId: 1 });
auditQuestionSchema.index({ question_id: 1 });
auditQuestionSchema.index({ templateId: 1 });

export const AuditQuestions = mongoose.model("auditQuestions", auditQuestionSchema);
