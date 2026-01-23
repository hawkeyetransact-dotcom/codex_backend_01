import mongoose from "mongoose";
import { QUESTIONNAIRE_KINDS, QUESTIONNAIRE_STATUSES } from "../modules/auditEngine/constants.js";

const questionnaireSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    status: { type: String, enum: QUESTIONNAIRE_STATUSES, default: "DRAFT" },
  },
  { _id: false }
);

const questionnaireQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String },
    questionCode: { type: String },
    text: { type: String, required: true },
    categoryName: { type: String },
    answerType: { type: String },
    options: { type: [String], default: [] },
    responseSchema: { type: mongoose.Schema.Types.Mixed },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const questionnaireResponseSchema = new mongoose.Schema(
  {
    questionId: { type: String },
    value: { type: mongoose.Schema.Types.Mixed },
    responseDetails: { type: mongoose.Schema.Types.Mixed },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    answeredAt: { type: Date },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const questionnaireArtifactSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "assessments", required: true, index: true },
    kind: { type: String, enum: QUESTIONNAIRE_KINDS, required: true },
    module: { type: String },
    templateRef: {
      templateId: { type: String },
      version: { type: String },
      name: { type: String },
    },
    status: { type: String, enum: QUESTIONNAIRE_STATUSES, default: "DRAFT" },
    sections: { type: [questionnaireSectionSchema], default: [] },
    questions: { type: [questionnaireQuestionSchema], default: [] },
    responses: { type: [questionnaireResponseSchema], default: [] },
    participants: {
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      supplierUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    },
  },
  { timestamps: true }
);

questionnaireArtifactSchema.index({ tenantId: 1, assessmentId: 1, kind: 1 }, { unique: true });
questionnaireArtifactSchema.index({ tenantId: 1, status: 1 });

export const QuestionnaireArtifact = mongoose.model("questionnaire-artifacts", questionnaireArtifactSchema);
