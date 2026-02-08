import mongoose from "mongoose";
import {
  COMPLIANCE_RUN_MODES,
  COMPLIANCE_RUN_STATUSES,
} from "../modules/compliance/constants.js";

const complianceSummarySchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    compliant: { type: Number, default: 0 },
    nonCompliant: { type: Number, default: 0 },
    insufficient: { type: Number, default: 0 },
    notApplicable: { type: Number, default: 0 },
  },
  { _id: false }
);

const complianceRunSchema = new mongoose.Schema(
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
    responseSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "compliance_response_snapshots",
      required: true,
      index: true,
    },
    standardKey: { type: String, required: true, uppercase: true, trim: true },
    standardVersion: { type: String, required: true, trim: true },
    standardName: { type: String, default: "" },
    mode: { type: String, enum: COMPLIANCE_RUN_MODES, default: "ADVISORY" },
    status: {
      type: String,
      enum: COMPLIANCE_RUN_STATUSES,
      default: "RUNNING",
      index: true,
    },
    engine: { type: String, default: "RULES_V1" },
    noCost: { type: Boolean, default: true },
    summary: { type: complianceSummarySchema, default: () => ({}) },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

complianceRunSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });
complianceRunSchema.index({ tenantId: 1, standardKey: 1, standardVersion: 1, createdAt: -1 });

export const ComplianceRun = mongoose.model("compliance_runs", complianceRunSchema);

