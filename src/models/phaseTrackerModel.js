import mongoose from "mongoose";
import { PHASE_KEYS, STATUS_VALUES } from "../constants/assessmentTracking.js";

const phaseStateSchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUS_VALUES, default: "NOT_STARTED" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    blockers: { type: [String], default: [] },
  },
  { _id: false }
);

const phaseTrackerSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, required: true },
    assessmentTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "assessment-types",
      required: true,
      index: true,
    },
    workflowEntityType: { type: String, default: "AuditRequest" },
    workflowEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    currentPhaseKey: { type: String, enum: PHASE_KEYS, required: true },
    phases: { type: Map, of: phaseStateSchema, default: {} },
  },
  { timestamps: true }
);

phaseTrackerSchema.index({ tenantId: 1, workflowEntityType: 1, workflowEntityId: 1 }, { unique: true });

export const PhaseTracker = mongoose.model("phase-trackers", phaseTrackerSchema);
