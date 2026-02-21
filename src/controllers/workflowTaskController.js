import { WorkflowTask } from "../models/workflowTaskModel.js";
import { WorkflowRuntimeService } from "../services/workflowRuntimeService.js";

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(400).json({ error: "Tenant context missing", code: "TENANT_CONTEXT_MISSING" });
    return false;
  }
  return true;
};

const buildTaskFilter = (req) => {
  const filter = { tenantId: req.tenantId };
  const assignee = String(req.query?.assignee || "").trim().toLowerCase();
  const role = String(req.user?.role || "").trim();

  if (!assignee || assignee === "me") {
    filter.$or = [{ assigneeUserId: req.user?._id || null }, { assigneeRole: role }];
    return filter;
  }

  if (assignee.startsWith("user:")) {
    filter.assigneeUserId = assignee.split(":")[1];
    return filter;
  }

  if (assignee.startsWith("role:")) {
    filter.assigneeRole = assignee.split(":")[1];
    return filter;
  }

  return filter;
};

export const listWorkflowTasks = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const filter = buildTaskFilter(req);
    if (req.query?.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query?.instanceId) filter.instanceId = req.query.instanceId;

    const items = await WorkflowTask.find(filter).sort({ dueAt: 1, createdAt: -1 }).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list tasks" });
  }
};

export const completeWorkflowTask = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const instance = await WorkflowRuntimeService.completeTask({
      tenantId: req.tenantId,
      taskId: req.params.id,
      output: req.body?.output || req.body || {},
      actor: req.user,
    });

    return res.json({
      success: true,
      data: {
        taskId: req.params.id,
        instanceId: instance._id,
        status: "COMPLETED",
        currentNodeId: instance.currentNodeId,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to complete task" });
  }
};

