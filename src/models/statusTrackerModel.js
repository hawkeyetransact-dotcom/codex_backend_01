import mongoose from "mongoose";
import { PHASE_KEYS, STATUS_VALUES } from "../constants/assessmentTracking.js";

const statusTrackerSchema = new mongoose.Schema(
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
    phaseKey: { type: String, enum: PHASE_KEYS, required: true },
    statusCode: { type: String, required: true },
    status: { type: String, enum: STATUS_VALUES, default: "NOT_STARTED" },
    expectedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    responsibleRole: { type: String, default: null },
    responsibleUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

statusTrackerSchema.index({ tenantId: 1, workflowEntityId: 1, phaseKey: 1, statusCode: 1 }, { unique: true });
statusTrackerSchema.index({ tenantId: 1, workflowEntityId: 1, phaseKey: 1, status: 1 });

export const StatusTracker = mongoose.model("status-trackers", statusTrackerSchema);
