import mongoose from "mongoose";

const responseSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: "templateQuestions" },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const preAuditQuestionnaireSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      required: true,
    },
    templateId: { type: Number },
    status: {
      type: String,
      enum: ["DRAFT", "SENT", "IN_PROGRESS", "SUBMITTED", "REVIEWED"],
      default: "DRAFT",
    },
    responses: { type: [responseSchema], default: [] },
    sentAt: { type: Date },
    submittedAt: { type: Date },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

preAuditQuestionnaireSchema.index({ tenantId: 1, auditId: 1 }, { unique: true, sparse: true });

export const PreAuditQuestionnaire = mongoose.model(
  "pre-audit-questionnaires",
  preAuditQuestionnaireSchema
);
