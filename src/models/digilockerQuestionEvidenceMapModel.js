import mongoose from "mongoose";

const QuestionEvidenceMapSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    templateId: { type: Number },
    questionId: { type: String, required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_documents", required: true },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_document_versions" },
    mappingType: {
      type: String,
      enum: ["Recommended", "Supporting", "SupplierAttached", "AuditorRequested"],
      default: "SupplierAttached",
    },
    confidence: { type: Number, min: 0, max: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

QuestionEvidenceMapSchema.index({ tenantId: 1, auditId: 1, questionId: 1 });

export const DigiLockerQuestionEvidenceMap = mongoose.model(
  "digilocker_question_evidence_maps",
  QuestionEvidenceMapSchema
);
