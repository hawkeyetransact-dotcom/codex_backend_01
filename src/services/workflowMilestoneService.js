import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowSlaConfig } from "../models/workflowSlaConfigModel.js";
import { NotificationOrchestratorService } from "../modules/notifications/services/orchestratorService.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { writeAdminAuditLog } from "../middlewares/tenantMiddleware.js";
import { AUDIT_WORKFLOW_TRANSITIONS } from "./auditWorkflowTransitions.js";

const nowPlusHours = (hours) => {
  if (!hours) return null;
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
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

const emitMilestoneEvent = async (eventName, milestone, context) => {
  try {
    await NotificationOrchestratorService.emitEvent(
      eventName,
      {
        entityType: milestone.workflowEntityType,
        entityId: milestone.workflowEntityId,
        title: `Milestone ${milestone.milestoneCode} ${eventName.toLowerCase()}`,
        message: milestone.status,
        recipientStrategy: "tenant_admins",
        severity: "info",
      },
      { tenantId: context.tenantId, role: context.role }
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

    const slaConfigs = await WorkflowSlaConfig.find({ tenantId, workflowType }).lean();
    const slaMap = Object.fromEntries(slaConfigs.map((s) => [s.milestoneCode, s]));

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
      const duration = sla?.durationHours || def.defaultDurationHours;
      const expectedAt = nowPlusHours(duration);
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
      await emitMilestoneEvent("MILESTONE_STARTED", inst, context);
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
      await emitMilestoneEvent("MILESTONE_COMPLETED", inst, context);
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
      await emitMilestoneEvent("MILESTONE_SKIPPED", inst, context);
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
      await emitMilestoneEvent("MILESTONE_DUE_UPDATED", inst, context);
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
    const r = await WorkflowMilestoneInstance.findOneAndUpdate(
      { tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode: code },
      { status: "IN_PROGRESS", startedAt: new Date() },
      { new: true }
    );
    if (r) {
      await NotificationOrchestratorService.emitEvent(
        "MILESTONE_STARTED",
        {
          entityType,
          entityId,
          title: `Milestone ${code} started`,
          message: r.status,
          recipientStrategy: "tenant_admins",
        },
        { tenantId: context.tenantId }
      );
      results.push(r);
    }
  }

  const completeList = steps.complete || [];
  for (const code of completeList) {
    const r = await WorkflowMilestoneService.markMilestoneCompleted(entityId, code, context);
    results.push(r);
  }

  const skipList = steps.skip || [];
  for (const s of skipList) {
    const before = await WorkflowMilestoneInstance.findOne({ tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode: s.code });
    const r = await WorkflowMilestoneInstance.findOneAndUpdate(
      { tenantId: context.tenantId, workflowEntityId: entityId, milestoneCode: s.code },
      { status: "SKIPPED", metadata: { ...(before?.metadata || {}), skipReason: s.reason } },
      { new: true }
    );
    if (r) {
      await NotificationOrchestratorService.emitEvent(
        "MILESTONE_SKIPPED",
        {
          entityType,
          entityId,
          title: `Milestone ${s.code} skipped`,
          message: s.reason,
          recipientStrategy: "tenant_admins",
        },
        { tenantId: context.tenantId }
      );
      results.push(r);
    }
  }

  return results;
};
