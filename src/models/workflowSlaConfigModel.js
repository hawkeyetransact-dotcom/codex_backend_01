import mongoose from "mongoose";

const escalationSchema = new mongoose.Schema(
  {
    afterHours: { type: Number, required: true },
    notifyRoles: [{ type: String, enum: ["buyer", "supplier", "auditor", "admin", "tenant_admin", "superadmin"] }],
    severity: { type: String, enum: ["info", "warning", "critical"], default: "warning" },
    channels: [{ type: String, enum: ["inApp", "email"] }],
  },
  { _id: false }
);

const workflowSlaConfigSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "tenant", required: true, index: true },
    workflowType: { type: String, enum: ["AUDIT"], required: true },
    auditType: { type: String, default: "DEFAULT" },
    milestoneCode: { type: String, required: true },
    durationDays: { type: Number },
    durationHours: { type: Number },
    escalation: [escalationSchema],
    allowUserOverride: { type: Boolean, default: true },
  },
  { timestamps: true }
);

workflowSlaConfigSchema.index({ tenantId: 1, workflowType: 1, auditType: 1, milestoneCode: 1 }, { unique: true });

export const WorkflowSlaConfig = mongoose.model("workflow_sla_configs", workflowSlaConfigSchema);
