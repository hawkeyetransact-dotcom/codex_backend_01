import { WorkflowRuntimeService } from "../services/workflowRuntimeService.js";

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(400).json({ error: "Tenant context missing", code: "TENANT_CONTEXT_MISSING" });
    return false;
  }
  return true;
};

export const createWorkflowInstance = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const definitionId = req.body?.definitionId || null;
    const versionId = req.body?.versionId || null;
    if (!definitionId && !versionId) {
      return res.status(400).json({ error: "definitionId or versionId is required" });
    }

    const instance = await WorkflowRuntimeService.startInstance({
      tenantId: req.tenantId,
      definitionId,
      versionId,
      context: req.body?.context || {},
      legacyRefs: req.body?.legacyRefs || {},
      roleAssignments: req.body?.roleAssignments || {},
      actor: req.user,
    });

    return res.status(201).json({ success: true, data: instance });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to start workflow instance" });
  }
};

export const getWorkflowInstance = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const payload = await WorkflowRuntimeService.getInstanceDetails({
      tenantId: req.tenantId,
      instanceId: req.params.id,
    });
    if (!payload) return res.status(404).json({ error: "Workflow instance not found" });
    return res.json({ success: true, data: payload });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to load workflow instance" });
  }
};

export const submitWorkflowInstanceEvent = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const eventType = req.body?.eventType || "instance.event";
    const result = await WorkflowRuntimeService.submitEvent({
      tenantId: req.tenantId,
      instanceId: req.params.id,
      eventType,
      payload: req.body?.payload || {},
      taskId: req.body?.taskId || null,
      actor: req.user,
    });
    return res.json({
      success: true,
      data: {
        instanceId: result._id,
        status: result.status,
        currentNodeId: result.currentNodeId,
        appliedEventSeq: result.lastEventSeq,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to submit workflow instance event",
    });
  }
};

