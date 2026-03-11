import mongoose from "mongoose";
import {
  AUDIT_ARTIFACT_TYPES,
  ARTIFACT_STATUSES,
  AUDIT_PHASE_KEYS,
} from "../constants/auditPhases.js";

const auditArtifactSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      default: null,
      index: true,
    },
    phaseKey: { type: String, enum: AUDIT_PHASE_KEYS, required: true },
    artifactType: { type: String, enum: AUDIT_ARTIFACT_TYPES, required: true },
    templateId: { type: Number, default: null },
    linkedEntityType: { type: String, default: null },
    linkedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ownerRole: { type: String, default: null },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ARTIFACT_STATUSES, default: "draft" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

auditArtifactSchema.index({ tenantId: 1, auditId: 1, phaseKey: 1, artifactType: 1 });
auditArtifactSchema.index({ auditId: 1, artifactType: 1, status: 1 });
auditArtifactSchema.index({ engagementId: 1, artifactType: 1, status: 1 });

export const AuditArtifact = mongoose.model("audit-artifacts", auditArtifactSchema);
