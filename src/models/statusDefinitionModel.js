import mongoose from "mongoose";
import { PHASE_KEYS } from "../constants/assessmentTracking.js";

const escalationSchema = new mongoose.Schema(
  {
    afterHours: { type: Number, default: 0 },
    notifyRoles: { type: [String], default: [] },
  },
  { _id: false }
);

const statusDefinitionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, required: true },
    assessmentTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "assessment-types",
      required: true,
      index: true,
    },
    phaseKey: { type: String, enum: PHASE_KEYS, required: true },
    statusCode: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    defaultResponsibleRole: { type: String, default: null },
    defaultDurationHours: { type: Number, default: 0 },
    allowUserOverride: { type: Boolean, default: true },
    escalation: { type: [escalationSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: true },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

statusDefinitionSchema.index({ tenantId: 1, assessmentTypeId: 1, phaseKey: 1, statusCode: 1 }, { unique: true });
statusDefinitionSchema.index({ tenantId: 1, assessmentTypeId: 1, phaseKey: 1, isActive: 1 });

export const StatusDefinition = mongoose.model("status-definitions", statusDefinitionSchema);
