import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { WorkflowSlaConfig } from "../models/workflowSlaConfigModel.js";
import { WorkflowMilestoneService } from "../services/workflowMilestoneService.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import mongoose from "mongoose";

const ok = (res, data, meta) => res.json({ success: true, data, meta });
const bad = (res, status, message) => res.status(status).json({ success: false, message });

export const listDefinitions = async (req, res) => {
  const { workflowType = "AUDIT" } = req.query;
  const defs = await WorkflowMilestoneDefinition.find({ tenantId: req.tenantId, workflowType }).sort({ order: 1, createdAt: 1 });
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
  const { workflowType = "AUDIT" } = req.query;
  const cfg = await WorkflowSlaConfig.find({ tenantId: req.tenantId, workflowType });
  return ok(res, cfg);
};

export const upsertSla = async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const results = [];
  for (const item of items) {
    const filter = { tenantId: req.tenantId, workflowType: item.workflowType || "AUDIT", milestoneCode: item.milestoneCode };
    const doc = await WorkflowSlaConfig.findOneAndUpdate(filter, { ...item, tenantId: req.tenantId }, { new: true, upsert: true });
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
  const entityObjectId = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;

  // Unconditional access for Track Progress: return milestones for this entity regardless of role/tenant.
  const baseFilter = {
    workflowEntityType: entityType,
    workflowEntityId: entityObjectId
  };

  let docs = await WorkflowMilestoneInstance.find(baseFilter).sort({ expectedAt: 1, createdAt: 1 });

  // If no instances exist, attempt to initialize for AUDIT workflow
  if (!docs.length && entityType === "AuditRequest") {
    await WorkflowMilestoneService.initializeWorkflow("AUDIT", "AuditRequest", entityId, {
      tenantId: req.tenantId || null,
      role: req.user?.role,
      req,
    });
    docs = await WorkflowMilestoneInstance.find(baseFilter).sort({ expectedAt: 1, createdAt: 1 });
  }

  // If still empty, try without tenant filter explicitly (string vs ObjectId fallback)
  if (!docs.length) {
    docs = await WorkflowMilestoneInstance.find({
      workflowEntityType: entityType,
      workflowEntityId: entityObjectId,
    }).sort({ expectedAt: 1, createdAt: 1 });
  }

  let defs = await WorkflowMilestoneDefinition.find({ workflowType: "AUDIT", isActive: true })
    .sort({ order: 1, createdAt: 1 })
    .lean();

  // If still no instances but definitions exist, materialize default NOT_STARTED instances
  if (!docs.length && defs.length) {
    const seed = defs.map((d) => ({
      tenantId: req.tenantId || null,
      workflowType: "AUDIT",
      workflowEntityType: entityType,
      workflowEntityId: entityObjectId,
      milestoneCode: d.code,
      status: "NOT_STARTED",
      isOverdue: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await WorkflowMilestoneInstance.insertMany(seed);
    docs = await WorkflowMilestoneInstance.find(baseFilter).sort({ expectedAt: 1, createdAt: 1 });
  }

  return ok(res, docs, { definitions: defs });
};

export const updateExpectedAt = async (req, res) => {
  const { entityType, entityId, milestoneCode } = req.params;
  const { expectedAt } = req.body;
  const def = await ensureDefinitionActive(req.tenantId, "AUDIT", milestoneCode);
  if (!def) return bad(res, 400, "Invalid milestone");
  const allowed = await checkOverrideAllowed(req.tenantId, "AUDIT", milestoneCode);
  if (!allowed) return bad(res, 403, "Overrides not allowed");
  const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
    { tenantId: req.tenantId, workflowEntityType: entityType, workflowEntityId: entityId, milestoneCode },
    { expectedAt },
    { new: true }
  );
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const assignResponsible = async (req, res) => {
  const { entityType, entityId, milestoneCode } = req.params;
  const { responsibleUserId, responsibleRole } = req.body;
  const def = await ensureDefinitionActive(req.tenantId, "AUDIT", milestoneCode);
  if (!def) return bad(res, 400, "Invalid milestone");
  const allowed = await checkOverrideAllowed(req.tenantId, "AUDIT", milestoneCode);
  if (!allowed) return bad(res, 403, "Overrides not allowed");
  const inst = await WorkflowMilestoneInstance.findOneAndUpdate(
    { tenantId: req.tenantId, workflowEntityType: entityType, workflowEntityId: entityId, milestoneCode },
    { responsibleUserId, responsibleRole },
    { new: true }
  );
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const markStarted = async (req, res) => {
  const { entityId, milestoneCode } = req.params;
  const inst = await WorkflowMilestoneService.markMilestoneStarted(entityId, milestoneCode, { tenantId: req.tenantId, role: req.user?.role, req });
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};

export const markCompleted = async (req, res) => {
  const { entityId, milestoneCode } = req.params;
  const inst = await WorkflowMilestoneService.markMilestoneCompleted(entityId, milestoneCode, { tenantId: req.tenantId, role: req.user?.role, req });
  if (!inst) return bad(res, 404, "Not found");
  return ok(res, inst);
};
