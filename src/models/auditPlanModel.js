import mongoose from "mongoose";
import { AUDIT_PHASE_KEYS } from "../constants/auditPhases.js";

const approvalSchema = new mongoose.Schema(
  {
    role: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    signedAt: { type: Date },
    note: { type: String },
  },
  { _id: false }
);

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    role: { type: String },
    name: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const auditPlanSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      required: true,
    },
    phaseKey: { type: String, enum: AUDIT_PHASE_KEYS, default: "PREP" },
    scope: { type: String, default: "" },
    objectives: { type: String, default: "" },
    riskSummary: { type: String, default: "" },
    requiredDocuments: { type: [String], default: [] },
    participants: { type: [participantSchema], default: [] },
    approvals: { type: [approvalSchema], default: [] },
    status: { type: String, enum: ["DRAFT", "SUBMITTED", "APPROVED"], default: "DRAFT" },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

auditPlanSchema.index({ tenantId: 1, auditId: 1 }, { unique: true, sparse: true });

export const AuditPlan = mongoose.model("audit-plans", auditPlanSchema);
