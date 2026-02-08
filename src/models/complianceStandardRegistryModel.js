import mongoose from "mongoose";
import { STANDARD_DOMAINS } from "../modules/auditEngine/constants.js";
import {
  COMPLIANCE_STANDARD_SCOPES,
  COMPLIANCE_STANDARD_STATUSES,
} from "../modules/compliance/constants.js";

const controlSchema = new mongoose.Schema(
  {
    controlId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    clauseRef: { type: String, default: "" },
    standardRefs: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    expectedAnswer: {
      type: String,
      enum: ["YES", "NO", "TEXT", "ANY"],
      default: "ANY",
    },
    requiredEvidence: { type: Boolean, default: false },
    weight: { type: Number, default: 1, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const complianceStandardRegistrySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    standardKey: { type: String, required: true, uppercase: true, trim: true },
    version: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    domain: { type: String, enum: STANDARD_DOMAINS, default: "GMP" },
    scope: {
      type: String,
      enum: COMPLIANCE_STANDARD_SCOPES,
      default: "TENANT",
    },
    status: {
      type: String,
      enum: COMPLIANCE_STANDARD_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    controls: { type: [controlSchema], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

complianceStandardRegistrySchema.index(
  { tenantId: 1, standardKey: 1, version: 1 },
  { unique: true }
);
complianceStandardRegistrySchema.index({ tenantId: 1, standardKey: 1, status: 1 });
complianceStandardRegistrySchema.index({ tenantId: 1, domain: 1, status: 1 });

export const ComplianceStandardRegistry = mongoose.model(
  "compliance_standard_registry",
  complianceStandardRegistrySchema
);

