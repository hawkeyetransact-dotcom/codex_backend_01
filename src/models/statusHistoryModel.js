import mongoose from "mongoose";
import { PHASE_KEYS, STATUS_VALUES } from "../constants/assessmentTracking.js";

const statusHistorySchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, required: true },
    workflowEntityType: { type: String, default: "AuditRequest" },
    workflowEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      index: true,
    },
    phaseKey: { type: String, enum: PHASE_KEYS, required: true },
    statusCode: { type: String, required: true },
    fromStatus: { type: String, enum: STATUS_VALUES, default: "NOT_STARTED" },
    toStatus: { type: String, enum: STATUS_VALUES, default: "NOT_STARTED" },
    changedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    changedByRole: { type: String, default: null },
    reason: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    changedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

statusHistorySchema.index({ tenantId: 1, workflowEntityId: 1, phaseKey: 1, statusCode: 1 });
statusHistorySchema.index({ tenantId: 1, changedAt: -1 });

export const StatusHistory = mongoose.model("status-history", statusHistorySchema);
