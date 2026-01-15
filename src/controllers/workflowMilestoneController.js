import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowSlaConfig } from "../models/workflowSlaConfigModel.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { resolveAuditWorkflowTenantId } from "../utils/workflowTenant.js";
import mongoose from "mongoose";

const ok = (res, data, meta) => res.json({ success: true, data, meta });
const bad = (res, status, message) => res.status(status).json({ success: false, message });

const DEFAULT_AUDIT_MILESTONES = [
  { order: 10, code: "AR_CREATED", name: "Audit request created", isActive: true },
  { order: 20, code: "AR_AUDITOR_ASSIGNED", name: "Auditor assigned", isActive: true },
  { order: 30, code: "AR_AUDITOR_ACCEPTANCE_PENDING", name: "Auditor acceptance pending", isActive: true },
  { order: 40, code: "AR_ACCEPTED", name: "Audit accepted", isActive: true },
  { order: 50, code: "TEMPLATE_SELECTION_PENDING", name: "Template selection pending", isActive: true },
  { order: 60, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", name: "Questionnaire prep in progress", isActive: true },
  { order: 70, code: "QUESTIONNAIRE_RELEASED", name: "Questionnaire released", isActive: true },
  { order: 80, code: "SUPPLIER_RESPONSE_PENDING", name: "Supplier response pending", isActive: true },
  { order: 90, code: "SUPPLIER_SUBMITTED", name: "Supplier submitted", isActive: true },
  { order: 100, code: "AUDITOR_REVIEW_PENDING", name: "Auditor review pending", isActive: true },
  { order: 110, code: "FOLLOWUP_REQUESTED", name: "Supplier follow up open", isActive: true },
  { order: 120, code: "FOLLOWUP_RESPONSES_SUBMITTED", name: "Follow-up responses submitted", isActive: true },
  { order: 130, code: "FINAL_REVIEW_AND_SIGNOFF", name: "Final review and signoff", isActive: true },
  { order: 140, code: "REPORT_GENERATION_IN_PROGRESS", name: "Report generation in progress", isActive: true },
  { order: 150, code: "REPORT_PUBLISHED", name: "Report published", isActive: true },
];

export const listDefinitions = async (req, res) => {
  const { workflowType = "AUDIT" } = req.query;
  if (!req.tenantId) {
    if (workflowType === "AUDIT") {
      return ok(res, DEFAULT_AUDIT_MILESTONES, { isFallback: true, reason: "tenant_missing" });
    }
    return ok(res, []);
  }
  const defs = await WorkflowMilestoneDefinition.find({ tenantId: req.tenantId, workflowType }).sort({ order: 1, createdAt: 1 });
  if (!defs.length && workflowType === "AUDIT") {
    return ok(res, DEFAULT_AUDIT_MILESTONES, { isFallback: true });
  }
  return ok(res, defs);
};

export const createDefinition = async (req, res) => {
  const body = req.body;
  try {
    const doc = await WorkflowMilestoneDefinition.create({ ...body, tenantId: req.tenantId });
    return ok(res, doc);
  } catch (err) {
    return bad(res, 400, err.message);
  }
};

export const updateDefinition = async (req, res) => {
  try {
    const updated = await WorkflowMilestoneDefinition.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true }
    );
    if (!updated) return bad(res, 404, "Not found");
    return ok(res, updated);
  } catch (err) {
    return bad(res, 400, err.message);
  }
};

export const activateDefinition = async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await WorkflowMilestoneDefinition.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      { isActive: true },
      { new: true }
    );
    if (!doc) return bad(res, 404, "Not found");
    return ok(res, doc);
  } catch (err) {
    return bad(res, 400, err.message);
  }
};

export const listSla = async (req, res) => {
  const { workflowType = "AUDIT", auditType } = req.query;
  const filter = { tenantId: req.tenantId, workflowType };
  if (auditType) {
    filter.auditType = auditType;
  }
  const cfg = await WorkflowSlaConfig.find(filter);
  return ok(res, cfg);
};

export const upsertSla = async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const auditTypeDefault = req.query.auditType || "DEFAULT";
  const results = [];
  for (const item of items) {
    const auditType = item.auditType || auditTypeDefault;
    const filter = {
      tenantId: req.tenantId,
      workflowType: item.workflowType || "AUDIT",
      auditType,
      milestoneCode: item.milestoneCode,
    };
    const payload = {
      ...item,
      tenantId: req.tenantId,
      auditType,
      durationDays: item.durationDays !== undefined ? Number(item.durationDays) : undefined,
      durationHours: item.durationHours !== undefined ? Number(item.durationHours) : item.durationHours,
    };
    const doc = await WorkflowSlaConfig.findOneAndUpdate(filter, payload, { new: true, upsert: true });
    results.push(doc);
  }
  return ok(res, results);
};

const ensureDefinitionActive = async (tenantId, workflowType, code) => {
  const def = await WorkflowMilestoneDefinition.findOne({ tenantId, workflowType, code, isActive: true });
  return def;
};

const checkOverrideAllowed = async (tenantId, workflowType, code) => {
  const sla = await WorkflowSlaConfig.findOne({ tenantId, workflowType, milestoneCode: code });
  if (!sla) return true; // default allow
  return sla.allowUserOverride !== false;
};

export const listInstances = async (req, res) => {
  const { entityType, entityId } = req.params;
  const entityIdCandidates = mongoose.Types.ObjectId.isValid(entityId)
    ? [new mongoose.Types.ObjectId(entityId), entityId]
    : [entityId];
  const canonicalTenantId =
    entityType === "AuditRequest"
      ? await resolveAuditWorkflowTenantId({ auditId: entityId, fallbackTenantId: req.tenantId || null })
      : (req.tenantId || null);

  const baseFilter = {
    workflowEntityType: entityType,
    workflowEntityId: { $in: entityIdCandidates },
    ...(canonicalTenantId ? { tenantId: canonicalTenantId } : {}),
  };

  let docs = await WorkflowMilestoneInstance.find(baseFilter).sort({ expectedAt: 1, createdAt: 1 });

  if (!docs.length && entityType === "AuditRequest") {
    await WorkflowMilestoneService.initializeWorkflow("AUDIT", "AuditRequest", entityId, {
      tenantId: canonicalTenantId,
      role: req.user?.role,
      req,
    });
    docs = await WorkflowMilestoneInstance.find(baseFilter).sort({ expectedAt: 1, createdAt: 1 });
  }

  let defs = [];
  if (canonicalTenantId) {
    defs = await WorkflowMilestoneDefinition.find({ tenantId: canonicalTenantId, workflowType: "AUDIT", isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();
  }

  if (!defs.length && entityType === "AuditRequest") {
    return ok(res, docs, { definitions: DEFAULT_AUDIT_MILESTONES, isFallback: true });
  }

  return ok(res, docs, { definitions: defs });
};

export const updateExpectedAt = async (req, res) => {
  const { entityType, entityId, milestoneCode } = req.params;
  const { expectedAt } = req.body;
  const tenantId =
    entityType === "AuditRequest"
      ? await resolveAuditWorkflowTenantId({ auditId: entityId, fallbackTenantId: req.tenantId || null })
      : req.tenantId;
  const def = await ensureDefinitionActive(tenantId, "AUDIT", milestoneCode);
  if (!def) return bad(res, 400, "Invalid milestone");
  const allowed = await checkOverrideAllowed(tenantId, "AUDIT", milestoneCode);
  if (!allowed) return bad(res, 403, "Overrides not allowed");
  const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
    { tenantId, workflowEntityType: entityType, workflowEntityId: entityId, milestoneCode },
    { expectedAt },
    { new: true }
  );
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const assignResponsible = async (req, res) => {
  const { entityType, entityId, milestoneCode } = req.params;
  const { responsibleUserId, responsibleRole } = req.body;
  const tenantId =
    entityType === "AuditRequest"
      ? await resolveAuditWorkflowTenantId({ auditId: entityId, fallbackTenantId: req.tenantId || null })
      : req.tenantId;
  const def = await ensureDefinitionActive(tenantId, "AUDIT", milestoneCode);
  if (!def) return bad(res, 400, "Invalid milestone");
  const allowed = await checkOverrideAllowed(tenantId, "AUDIT", milestoneCode);
  if (!allowed) return bad(res, 403, "Overrides not allowed");
  const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
    { tenantId, workflowEntityType: entityType, workflowEntityId: entityId, milestoneCode },
    { responsibleUserId, responsibleRole },
    { new: true }
  );
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const markStarted = async (req, res) => {
  const { entityId, milestoneCode } = req.params;
  const tenantId = await resolveAuditWorkflowTenantId({ auditId: entityId, fallbackTenantId: req.tenantId || null });
  const inst = await WorkflowMilestoneService.markMilestoneStarted(entityId, milestoneCode, { tenantId, role: req.user?.role, req });
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const markCompleted = async (req, res) => {
  const { entityId, milestoneCode } = req.params;
  const tenantId = await resolveAuditWorkflowTenantId({ auditId: entityId, fallbackTenantId: req.tenantId || null });
  const inst = await WorkflowMilestoneService.markMilestoneCompleted(entityId, milestoneCode, { tenantId, role: req.user?.role, req });
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};
