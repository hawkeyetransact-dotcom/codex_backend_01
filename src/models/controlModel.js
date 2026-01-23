import mongoose from "mongoose";
import { STANDARD_DOMAINS } from "../modules/auditEngine/constants.js";

const linkedClauseSchema = new mongoose.Schema(
  {
    standardId: { type: String, required: true },
    clauseId: { type: String, required: true },
  },
  { _id: false }
);

const controlSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    controlId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    domain: { type: String, enum: STANDARD_DOMAINS, required: true },
    linkedClauses: { type: [linkedClauseSchema], default: [] },
    evidenceTypes: { type: [String], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

controlSchema.index({ tenantId: 1, controlId: 1 }, { unique: true });
controlSchema.index({ tenantId: 1, domain: 1 });

export const Control = mongoose.model("controls", controlSchema);
