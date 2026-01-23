import mongoose from "mongoose";
import { AUDIT_MODULES, AUDIT_PHASE_KEYS } from "../modules/auditEngine/constants.js";

const milestoneTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    defaultOwnerRole: { type: String, enum: ["buyer", "supplier", "auditor", "admin"] },
    defaultDueInDays: { type: Number, default: 2 },
    required: { type: Boolean, default: true },
    dependencies: { type: [String], default: [] },
  },
  { _id: false }
);

const phaseTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, enum: Object.values(AUDIT_PHASE_KEYS), required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    required: { type: Boolean, default: true },
    milestones: { type: [milestoneTemplateSchema], default: [] },
  },
  { _id: false }
);

const auditCycleTemplateSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    templateId: { type: String, required: true },
    module: { type: String, enum: AUDIT_MODULES, required: true },
    name: { type: String, required: true },
    phases: { type: [phaseTemplateSchema], default: [] },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditCycleTemplateSchema.index({ tenantId: 1, module: 1 }, { unique: true });
auditCycleTemplateSchema.index({ tenantId: 1, templateId: 1 }, { unique: true });

export const AuditCycleTemplate = mongoose.model("audit-cycle-templates", auditCycleTemplateSchema);
