import mongoose from "mongoose";
import {
  AUDIT_MODULES,
  AUDIT_PHASE_KEYS,
  PHASE_STATUSES,
  MILESTONE_STATUSES,
  ASSESSMENT_TYPES,
  ASSESSMENT_STATUSES,
} from "../modules/auditEngine/constants.js";

const milestoneInstanceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    module: { type: String, enum: AUDIT_MODULES },
    status: { type: String, enum: MILESTONE_STATUSES, default: "NOT_STARTED" },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    ownerRole: { type: String, enum: ["buyer", "supplier", "auditor", "admin"] },
    dueDate: { type: Date },
    completedAt: { type: Date },
    notes: { type: String },
    dependencies: { type: [String], default: [] },
    artifacts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const phaseInstanceSchema = new mongoose.Schema(
  {
    key: { type: String, enum: Object.values(AUDIT_PHASE_KEYS), required: true },
    name: { type: String, required: true },
    status: { type: String, enum: PHASE_STATUSES, default: "NOT_STARTED" },
    startDate: { type: Date },
    endDate: { type: Date },
    milestones: { type: [milestoneInstanceSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const assessmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    assessmentCode: { type: String, index: true },
    modules: { type: [String], enum: AUDIT_MODULES, required: true },
    type: { type: String, enum: ASSESSMENT_TYPES, default: "External" },
    scope: {
      siteId: { type: mongoose.Schema.Types.ObjectId },
      productId: { type: mongoose.Schema.Types.ObjectId },
      supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      description: { type: String },
    },
    currentPhaseKey: { type: String, enum: Object.values(AUDIT_PHASE_KEYS), default: AUDIT_PHASE_KEYS.PREP },
    phases: { type: [phaseInstanceSchema], default: [] },
    status: { type: String, enum: ASSESSMENT_STATUSES, default: "ACTIVE", index: true },
    assignedAuditors: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
        role: { type: String, enum: ["LEAD", "COAUDITOR", "REVIEWER"], default: "LEAD" },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      },
    ],
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
        role: { type: String },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

assessmentSchema.index({ tenantId: 1, "assignedAuditors.userId": 1 });
assessmentSchema.index({ tenantId: 1, "participants.userId": 1 });
assessmentSchema.index({ tenantId: 1, modules: 1 });
assessmentSchema.index({ tenantId: 1, currentPhaseKey: 1 });
assessmentSchema.index({ tenantId: 1, "legacyRefs.auditRequestId": 1 });

export const Assessment = mongoose.model("assessments", assessmentSchema);
