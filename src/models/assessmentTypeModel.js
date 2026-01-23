import mongoose from "mongoose";
import { PHASE_KEYS, TRACKING_GRANULARITY } from "../constants/assessmentTracking.js";

const phaseSchema = new mongoose.Schema(
  {
    phaseKey: { type: String, enum: PHASE_KEYS, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const assessmentTypeSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true, default: null },
    key: { type: String, required: true },
    name: { type: String, required: true },
    workflowType: { type: String, default: "AUDIT" },
    phases: { type: [phaseSchema], default: [] },
    defaultGranularity: { type: String, enum: TRACKING_GRANULARITY, default: "STANDARD" },
  },
  { timestamps: true }
);

assessmentTypeSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const AssessmentType = mongoose.model("assessment-types", assessmentTypeSchema);
