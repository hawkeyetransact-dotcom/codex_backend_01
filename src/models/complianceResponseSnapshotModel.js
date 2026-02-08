import mongoose from "mongoose";
import { RESPONSE_SNAPSHOT_SOURCES } from "../modules/compliance/constants.js";

const responseSnapshotQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    questionCode: { type: String, default: "" },
    question: { type: String, default: "" },
    categoryName: { type: String, default: "" },
    cfrReference: { type: String, default: "" },
    regulatoryReferences: { type: [String], default: [] },
    response: {
      yesNo: { type: String, default: "" },
      text: { type: String, default: "" },
      responseDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
      docUrls: { type: [String], default: [] },
      autoFillSources: { type: [String], default: [] },
      updatedAt: { type: Date, default: null },
    },
  },
  { _id: false }
);

const complianceResponseSnapshotSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    source: { type: String, enum: RESPONSE_SNAPSHOT_SOURCES, default: "LIVE" },
    snapshotHash: { type: String, required: true, index: true },
    totalQuestions: { type: Number, default: 0 },
    answeredQuestions: { type: Number, default: 0 },
    questions: { type: [responseSnapshotQuestionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

complianceResponseSnapshotSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });

export const ComplianceResponseSnapshot = mongoose.model(
  "compliance_response_snapshots",
  complianceResponseSnapshotSchema
);

