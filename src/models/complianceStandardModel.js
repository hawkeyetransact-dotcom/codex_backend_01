import mongoose from "mongoose";
import { STANDARD_DOMAINS } from "../modules/auditEngine/constants.js";

const clauseSchema = new mongoose.Schema(
  {
    clauseId: { type: String, required: true },
    title: { type: String, required: true },
    text: { type: String },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const complianceStandardSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    standardId: { type: String, required: true },
    name: { type: String, required: true },
    version: { type: String },
    domain: { type: String, enum: STANDARD_DOMAINS, required: true },
    clauses: { type: [clauseSchema], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

complianceStandardSchema.index({ tenantId: 1, standardId: 1 }, { unique: true });
complianceStandardSchema.index({ tenantId: 1, domain: 1 });

export const ComplianceStandard = mongoose.model("compliance-standards", complianceStandardSchema);
