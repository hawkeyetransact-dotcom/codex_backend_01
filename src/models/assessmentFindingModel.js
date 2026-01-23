import mongoose from "mongoose";
import { STANDARD_DOMAINS } from "../modules/auditEngine/constants.js";

const linkedStandardSchema = new mongoose.Schema(
  {
    standardId: { type: String },
    clauseId: { type: String },
  },
  { _id: false }
);

const assessmentFindingSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "assessments", index: true, required: true },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM" },
    domain: { type: String, enum: STANDARD_DOMAINS, required: true },
    category: { type: String },
    description: { type: String, required: true },
    linkedStandards: { type: [linkedStandardSchema], default: [] },
    linkedControls: { type: [String], default: [] },
    linkedEvidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ["OPEN", "IN_REVIEW", "CLOSED"], default: "OPEN" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

assessmentFindingSchema.index({ tenantId: 1, assessmentId: 1 });
assessmentFindingSchema.index({ tenantId: 1, status: 1 });

export const AssessmentFinding = mongoose.model("assessment-findings", assessmentFindingSchema);
