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
        questionCode: { type: String },
        subCategoryName: { type: String },
        normalizedQuestion: { type: String },
        riskcategory: { type: String },
        Audittype: { type: String },
        industry: { type: String },
        responseSchema: { type: mongoose.Schema.Types.Mixed }, // full JSON schema for rendering/validation
        responseDetails: { type: mongoose.Schema.Types.Mixed },
        autoFillMeta: {
            sources: [{ type: String }],
            note: { type: String },
            hasAny: { type: Boolean },
            full: { type: Boolean },
        },
        answerType: {
            type: String,
            enum: ["radio", "checkbox", "text", "textarea", "number", "attachment"],
            default: "text",
        },
        options: [{ type: String }],
        helperText: { type: String },
        subQuestions: [
            {
                key: { type: String },
                label: { type: String },
                answerType: {
                    type: String,
                    enum: ["radio", "checkbox", "text", "textarea", "number", "attachment"],
                    default: "text",
                },
                options: [{ type: String }],
                helperText: { type: String },
            },
        ],
        order: { type: Number, default: 0 },
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
        YesNoAnswers: { type: String, enum: ['Yes', 'No', 'NA', null], default: null },
        textResponse: { type: String, required: false },
        internalNotes: { type: String, required: false },
        isComplient: { type: String, enum: ['Yes', 'No'], default: null },
        isTempDeleted: { type: Boolean, default: false },
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

auditQuestionSchema.index({ auditRequestId: 1 });
auditQuestionSchema.index({ question_id: 1 });
auditQuestionSchema.index({ templateId: 1 });
auditQuestionSchema.index({ auditRequestId: 1, order: 1 });

export const AuditQuestions = mongoose.model("auditQuestions", auditQuestionSchema);
