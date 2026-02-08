import mongoose from "mongoose";
import {
  COMPLIANCE_REVIEW_STATUSES,
  COMPLIANCE_VERDICTS,
} from "../modules/compliance/constants.js";

const mappedControlSchema = new mongoose.Schema(
  {
    controlId: { type: String, required: true },
    title: { type: String, default: "" },
    clauseRef: { type: String, default: "" },
    standardRefs: { type: [String], default: [] },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const evidenceSuggestionSchema = new mongoose.Schema(
  {
    documentId: { type: String, default: "" },
    versionId: { type: String, default: "" },
    title: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    pageNumber: { type: Number, default: 1 },
    effectiveDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    source: { type: String, default: "DigiLockerLatest" },
  },
  { _id: false }
);

const complianceQuestionResultSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "compliance_runs",
      required: true,
      index: true,
    },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    questionId: { type: String, required: true },
    questionCode: { type: String, default: "" },
    questionText: { type: String, default: "" },
    categoryName: { type: String, default: "" },
    regulatoryReference: { type: String, default: "" },
    mappedControls: { type: [mappedControlSchema], default: [] },
    response: {
      yesNo: { type: String, default: "" },
      text: { type: String, default: "" },
      hasEvidence: { type: Boolean, default: false },
      evidenceSources: { type: [String], default: [] },
      responseDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    machineVerdict: {
      type: String,
      enum: COMPLIANCE_VERDICTS,
      default: "INSUFFICIENT",
      index: true,
    },
    machineConfidence: { type: Number, default: 0 },
    machineReason: { type: String, default: "" },
    auditorVerdict: { type: String, enum: COMPLIANCE_VERDICTS, default: null },
    auditorReason: { type: String, default: "" },
    finalVerdict: {
      type: String,
      enum: COMPLIANCE_VERDICTS,
      default: null,
      index: true,
    },
    reviewStatus: {
      type: String,
      enum: COMPLIANCE_REVIEW_STATUSES,
      default: "OPEN",
      index: true,
    },
    evidenceSuggestions: { type: [evidenceSuggestionSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

complianceQuestionResultSchema.index({ runId: 1, questionId: 1 }, { unique: true });
complianceQuestionResultSchema.index({ tenantId: 1, auditId: 1, machineVerdict: 1 });

export const ComplianceQuestionResult = mongoose.model(
  "compliance_question_results",
  complianceQuestionResultSchema
);

