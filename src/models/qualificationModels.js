import mongoose from "mongoose";

const qualificationCaseSchema = new mongoose.Schema(
  {
    qualificationCode: { type: String, required: true, unique: true, index: true },
    ownerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    buyerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN"],
      default: "DRAFT",
      index: true,
    },
    criticality: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM", index: true },
    riskBand: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: "MEDIUM", index: true },
    decision: {
      type: String,
      enum: ["PENDING", "APPROVED", "CONDITIONAL", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    scope: { type: mongoose.Schema.Types.Mixed, default: {} },
    approvedScope: { type: mongoose.Schema.Types.Mixed, default: {} },
    requalDueDate: { type: Date, default: null, index: true },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

qualificationCaseSchema.index({ ownerTenantId: 1, status: 1 });
qualificationCaseSchema.index({ buyerOrgId: 1, supplierOrgId: 1, status: 1 });

const qualificationMethodSchema = new mongoose.Schema(
  {
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      required: true,
      index: true,
    },
    methodType: {
      type: String,
      enum: ["DESK_REVIEW", "AUDIT_REQUIRED", "SAMPLING_VERIFICATION", "QUESTIONNAIRE", "REFERENCE_CHECK", "OTHER"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "WAIVED"],
      default: "PLANNED",
    },
    rationale: { type: String, default: "" },
    outcome: { type: String, default: "" },
    performedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

qualificationMethodSchema.index({ qualificationCaseId: 1, methodType: 1 });

export const QualificationCase = mongoose.model("qualification_cases", qualificationCaseSchema);
export const QualificationMethod = mongoose.model("qualification_methods", qualificationMethodSchema);
