import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowSlaConfig } from "../models/workflowSlaConfigModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { writeAdminAuditLog } from "../middlewares/tenantMiddleware.js";
import { AUDIT_WORKFLOW_TRANSITIONS } from "./auditWorkflowTransitions.js";

const addDays = (baseDate, days) => {
  if (!baseDate || !days) return baseDate || null;
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d;
};

const resolveDurationDays = (sla, def) => {
  if (sla?.durationDays && sla.durationDays > 0) return sla.durationDays;
  if (sla?.durationHours && sla.durationHours > 0) {
    return Math.max(1, Math.ceil(sla.durationHours / 24));
  }
  if (def?.defaultDurationHours && def.defaultDurationHours > 0) {
    return Math.max(1, Math.ceil(def.defaultDurationHours / 24));
  }
  return 1;
};

const resolveAssignee = async ({ entityType, entityId, role }) => {
  if (entityType === "AuditRequest") {
    const audit = await AuditRequestMaster.findById(entityId);
    if (!audit) return {};
    if (role === "auditor" && audit.auditor_id) return { responsibleUserId: audit.auditor_id, responsibleRole: "auditor" };
    if (role === "buyer" && audit.create_by_buyer_id) return { responsibleUserId: audit.create_by_buyer_id, responsibleRole: "buyer" };
    if (role === "supplier" && audit.supplier_id) return { responsibleUserId: audit.supplier_id, responsibleRole: "supplier" };
  }
  return { responsibleRole: role };
};

const emitMilestoneEvent = async (milestone, context, options = {}) => {
  const { actionRequired = false, message, step } = options;
  try {
    const eventName = `milestone.${milestone.milestoneCode}`;
    const recipientUserIds = milestone.responsibleUserId ? [milestone.responsibleUserId] : [];
    if (!recipientUserIds.length) return;
    const recipientStrategy = "explicit";
    const recipientRole = milestone.responsibleRole || context.role;
    await NotificationOrchestratorService.emitEvent(
      eventName,
      {
        entityType: milestone.workflowEntityType,
        entityId: milestone.workflowEntityId,
        title: `Milestone ${milestone.milestoneCode}`,
        message: message || milestone.status,
        recipientStrategy,
        recipientUserIds,
        role: recipientRole,
        severity: "info",
        actionRequired,
        step: step || milestone.status,
      },
      { tenantId: context.tenantId, role: recipientRole }
    );
  } catch (err) {
    console.error("emit milestone event failed", err.message);
  }
};

const logAudit = async (action, before, after, context, entityId) => {
  try {
    await writeAdminAuditLog({
      req: context.req || {},
      action,
      entityType: "workflow_milestone",
      entityId,
      before,
      after,
      tenantId: context.tenantId,
    });
  } catch (err) {
    // silent
  }
};

export const WorkflowMilestoneService = {
  initializeWorkflow: async (workflowType, entityType, entityId, context) => {
    const tenantId = context.tenantId;
    const defs = await WorkflowMilestoneDefinition.find({ tenantId, workflowType, isActive: true }).sort({ order: 1 });
    if (!defs.length) return [];

    let auditType = "DEFAULT";
    if (entityType === "AuditRequest") {
      const auditMeta = await AuditRequestMaster.findById(entityId).select("auditType").lean();
      if (auditMeta?.auditType) auditType = auditMeta.auditType;
    }

    let slaConfigs = await WorkflowSlaConfig.find({ tenantId, workflowType, auditType }).lean();
    if (!slaConfigs.length && auditType !== "DEFAULT") {
      slaConfigs = await WorkflowSlaConfig.find({ tenantId, workflowType, auditType: "DEFAULT" }).lean();
    }
    const slaMap = Object.fromEntries(slaConfigs.map((s) => [s.milestoneCode, s]));

    let baseDate = new Date();
    if (entityType === "AuditRequest") {
      const audit = await AuditRequestMaster.findById(entityId).select("createdAt").lean();
      if (audit?.createdAt) baseDate = new Date(audit.createdAt);
    }
    let cursorDate = baseDate;

    const created = [];
    for (const def of defs) {
      const exists = await WorkflowMilestoneInstance.findOne({
        tenantId,
        workflowEntityType: entityType,
        workflowEntityId: entityId,
        milestoneCode: def.code,
      });
      if (exists) continue;

      const sla = slaMap[def.code];
      const durationDays = resolveDurationDays(sla, def);
      cursorDate = addDays(cursorDate, durationDays);
      const expectedAt = cursorDate;
      const assignee = await resolveAssignee({ entityType, entityId, role: def.defaultResponsibleRole });

      const inst = await WorkflowMilestoneInstance.create({
        tenantId,
        workflowType,
        workflowEntityType: entityType,
        workflowEntityId: entityId,
        milestoneCode: def.code,
        status: "NOT_STARTED",
        expectedAt,
        responsibleRole: assignee.responsibleRole,
        responsibleUserId: assignee.responsibleUserId,
      });
      created.push(inst);
    }
    return created;
  },

  markMilestoneStarted: async (entityId, milestoneCode, context) => {
    const filter = {
      tenantId: context.tenantId,
      workflowEntityId: entityId,
      milestoneCode,
    };
    const before = await WorkflowMilestoneInstance.findOne(filter);
    const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
      filter,
      { status: "IN_PROGRESS", startedAt: new Date() },
      { new: true }
    );
    if (inst) {
      await emitMilestoneEvent(inst, context, { actionRequired: true, step: "IN_PROGRESS" });
      await logAudit("milestone_started", before, inst, context, inst._id);
    }
    return inst;
  },

  markMilestoneCompleted: async (entityId, milestoneCode, context) => {
    const filter = { tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode };
    const before = await WorkflowMilestoneInstance.findOne(filter);
    const now = new Date();
    const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
      filter,
      {
        status: "COMPLETED",
        completedAt: now,
        isOverdue: before?.expectedAt ? before.expectedAt < now : false,
      },
      { new: true }
    );
    if (inst) {
      await emitMilestoneEvent(inst, context, { actionRequired: false, step: "COMPLETED" });
      await logAudit("milestone_completed", before, inst, context, inst._id);
    }
    return inst;
  },

  skipMilestone: async (entityId, milestoneCode, reason, context) => {
    const filter = { tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode };
    const before = await WorkflowMilestoneInstance.findOne(filter);
    const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
      filter,
      { status: "SKIPPED", metadata: { ...(before?.metadata || {}), skipReason: reason } },
      { new: true }
    );
    if (inst) {
      await emitMilestoneEvent(inst, context, { actionRequired: false, message: reason || "Skipped", step: "SKIPPED" });
      await logAudit("milestone_skipped", before, inst, context, inst._id);
    }
    return inst;
  },

  updateExpectedAt: async (entityId, milestoneCode, expectedAt, context) => {
    const filter = { tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode };
    const before = await WorkflowMilestoneInstance.findOne(filter);
    const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
      filter,
      { expectedAt },
      { new: true }
    );
    if (inst) {
      await emitMilestoneEvent(inst, context, { actionRequired: false, message: "Due date updated", step: "DUE_UPDATED" });
      await logAudit("milestone_expectedAt_updated", before, inst, context, inst._id);
    }
    return inst;
  },
};

export const applyWorkflowTransition = async ({ workflowType = "AUDIT", entityType = "AuditRequest", entityId, transitionCode, context }) => {
  const steps = AUDIT_WORKFLOW_TRANSITIONS[transitionCode] || {};
  const results = [];

  const startList = steps.start || [];
  for (const code of startList) {
    const r = await WorkflowMilestoneService.markMilestoneStarted(entityId, code, context);
    if (r) results.push(r);
  }

  const completeList = steps.complete || [];
  for (const code of completeList) {
    const r = await WorkflowMilestoneService.markMilestoneCompleted(entityId, code, context);
    results.push(r);
  }

  const skipList = steps.skip || [];
  for (const s of skipList) {
    const r = await WorkflowMilestoneService.skipMilestone(entityId, s.code, s.reason, context);
    if (r) results.push(r);
  }

  return results;
};
