import { WorkflowDefinitionVersion } from "../models/workflowDefinitionVersionModel.js";
import { WorkflowEvent } from "../models/workflowEventModel.js";
import { WorkflowInstance } from "../models/workflowInstanceModel.js";
import { WorkflowTask } from "../models/workflowTaskModel.js";
import { ComplianceStandardRegistry } from "../models/complianceStandardRegistryModel.js";
import { ComplianceEvaluationService } from "./compliance/complianceEvaluationService.js";

const ADMIN_ROLES = new Set(["admin", "superadmin", "tenant_admin"]);

const normalizeEventType = (value, fallback = "node.completed") =>
  String(value || fallback).trim().toLowerCase();

const now = () => new Date();

const resolveNodeMap = (definition) => {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  return new Map(nodes.map((node) => [String(node.id), node]));
};

const resolveOutgoingEdges = (definition, fromNodeId) => {
  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  return edges
    .filter((edge) => String(edge.from) === String(fromNodeId))
    .map((edge) => ({
      ...edge,
      on: normalizeEventType(edge.on || "node.completed"),
      priority: Number.isFinite(Number(edge.priority)) ? Number(edge.priority) : 100,
    }))
    .sort((a, b) => a.priority - b.priority);
};

const evaluateGuard = ({ edge, instance, payload, eventType }) => {
  const guard = String(edge?.guard || "").trim();
  if (!guard) return true;
  try {
    const fn = new Function(
      "context",
      "payload",
      "instance",
      "eventType",
      `return Boolean(${guard});`
    );
    return Boolean(fn(instance?.context || {}, payload || {}, instance || {}, eventType));
  } catch (_error) {
    return false;
  }
};

const canCompleteTask = ({ task, user }) => {
  if (!task || !user) return false;
  const role = String(user.role || "");
  if (ADMIN_ROLES.has(role)) return true;
  if (task.assigneeUserId && String(task.assigneeUserId) === String(user._id)) return true;
  if (task.assigneeRole && String(task.assigneeRole) === role) return true;
  return false;
};

const appendEvent = async ({ instance, tenantId, eventType, nodeId, payload, actor }) => {
  const nextSeq = Number(instance.lastEventSeq || 0) + 1;
  const event = await WorkflowEvent.create({
    tenantId,
    instanceId: instance._id,
    seq: nextSeq,
    eventType,
    nodeId: nodeId || "",
    payload: payload || {},
    actorId: actor?._id || null,
    actorRole: actor?.role || "",
    occurredAt: now(),
  });
  instance.lastEventSeq = nextSeq;
  return event;
};

const runAiSkillNode = async ({ node, instance, tenantId, actor, payload = {} }) => {
  const skillKey = String(node?.config?.skill || node?.skill || "").trim();
  const context = instance?.context || {};

  if (skillKey === "ich_q7_mapping") {
    const auditId = String(context?.auditRequestId || payload?.auditId || "").trim();
    const standardKey = String(node?.config?.standardKey || "ICH_Q7").toUpperCase();
    if (auditId && tenantId) {
      try {
        let standard = await ComplianceStandardRegistry.findOne({
          tenantId,
          standardKey,
          status: "ACTIVE",
        })
          .sort({ updatedAt: -1 })
          .lean();
        if (!standard) {
          standard = await ComplianceStandardRegistry.findOne({
            tenantId,
            standardKey: { $regex: "^ICH_Q7", $options: "i" },
            status: "ACTIVE",
          })
            .sort({ updatedAt: -1 })
            .lean();
        }

        if (standard?.version) {
          const runResult = await ComplianceEvaluationService.createRun({
            tenantId,
            auditId,
            standardKey: standard.standardKey,
            standardVersion: standard.version,
            mode: "ADVISORY",
            actorUserId: actor?._id || null,
          });
          return {
            skill: skillKey,
            standardKey: standard.standardKey,
            standardVersion: standard.version,
            complianceRunId: runResult?.run?._id || null,
            summary: runResult?.summary || {},
            nonCompliantCount: Number(runResult?.summary?.nonCompliant || 0),
            source: "ComplianceEvaluationService",
          };
        }
      } catch (_error) {
        // Fall back to lightweight output when standards or responses are unavailable.
      }
    }

    const answered = Number(context?.summary?.answered || payload?.answered || 0);
    const total = Number(context?.summary?.total || payload?.total || 0);
    const nonCompliantCount = Number(payload?.nonCompliantCount || 0);
    return {
      skill: skillKey,
      total,
      answered,
      coverage: total > 0 ? Math.round((answered / total) * 100) : 0,
      nonCompliantCount,
    };
  }

  if (skillKey === "audit_report_generate") {
    const reportTitle = `Workflow report - ${instance._id}`;
    return {
      skill: skillKey,
      reportTitle,
      generatedAt: now(),
    };
  }

  return {
    skill: skillKey || "generic_skill",
    ok: true,
    payload,
  };
};

const ensureTaskForNode = async ({ tenantId, instance, node, actor }) => {
  const existingOpen = await WorkflowTask.findOne({
    tenantId,
    instanceId: instance._id,
    nodeId: node.id,
    status: { $in: ["OPEN", "IN_PROGRESS"] },
  });
  if (existingOpen) return existingOpen;

  const dueInHours = Number(node?.task?.dueInHours || 0);
  const dueAt = dueInHours > 0 ? new Date(Date.now() + dueInHours * 60 * 60 * 1000) : null;

  return WorkflowTask.create({
    tenantId,
    instanceId: instance._id,
    nodeId: String(node.id),
    title: String(node?.task?.title || node?.name || "Task"),
    description: String(node?.task?.description || node?.description || ""),
    assigneeRole: String(node?.role || node?.task?.assigneeRole || ""),
    formRef: String(node?.formRef || ""),
    dueAt,
    metadata: {
      nodeType: node.type,
      requiredDocuments: Array.isArray(node?.requiredDocuments) ? node.requiredDocuments : [],
    },
    createdBy: actor?._id || null,
    updatedBy: actor?._id || null,
  });
};

const transitionFromNode = async ({
  tenantId,
  instance,
  definition,
  fromNodeId,
  eventType,
  payload,
  actor,
  depth = 0,
}) => {
  if (depth > 50) {
    instance.status = "BLOCKED";
    instance.blockedReason = "Transition depth limit reached";
    await appendEvent({
      instance,
      tenantId,
      eventType: "INSTANCE_BLOCKED",
      nodeId: fromNodeId,
      payload: { reason: instance.blockedReason },
      actor,
    });
    await instance.save();
    return instance;
  }

  const outgoing = resolveOutgoingEdges(definition, fromNodeId);
  const normalizedEventType = normalizeEventType(eventType);
  const edge = outgoing.find(
    (candidate) =>
      normalizeEventType(candidate.on) === normalizedEventType &&
      evaluateGuard({ edge: candidate, instance, payload, eventType: normalizedEventType })
  );

  if (!edge) {
    await instance.save();
    return instance;
  }

  return enterNode({
    tenantId,
    instance,
    definition,
    nodeId: edge.to,
    actor,
    payload,
    depth: depth + 1,
  });
};

const enterNode = async ({
  tenantId,
  instance,
  definition,
  nodeId,
  actor,
  payload = {},
  depth = 0,
}) => {
  const nodeMap = resolveNodeMap(definition);
  const node = nodeMap.get(String(nodeId));
  if (!node) {
    instance.status = "BLOCKED";
    instance.blockedReason = `Node '${nodeId}' not found`;
    await appendEvent({
      instance,
      tenantId,
      eventType: "INSTANCE_BLOCKED",
      nodeId,
      payload: { reason: instance.blockedReason },
      actor,
    });
    await instance.save();
    return instance;
  }

  instance.currentNodeId = String(node.id);
  await appendEvent({
    instance,
    tenantId,
    eventType: "NODE_ENTERED",
    nodeId: node.id,
    payload: { nodeType: node.type, nodeName: node.name },
    actor,
  });

  const nodeType = String(node.type || "").toLowerCase();

  if (nodeType === "end") {
    instance.status = "COMPLETED";
    instance.completedAt = now();
    await appendEvent({
      instance,
      tenantId,
      eventType: "NODE_COMPLETED",
      nodeId: node.id,
      payload: {},
      actor,
    });
    await appendEvent({
      instance,
      tenantId,
      eventType: "INSTANCE_COMPLETED",
      nodeId: node.id,
      payload: {},
      actor,
    });
    await instance.save();
    return instance;
  }

  if (nodeType === "start") {
    await appendEvent({
      instance,
      tenantId,
      eventType: "NODE_COMPLETED",
      nodeId: node.id,
      payload: { auto: true },
      actor,
    });
    return transitionFromNode({
      tenantId,
      instance,
      definition,
      fromNodeId: node.id,
      eventType: "node.completed",
      payload: { auto: true },
      actor,
      depth: depth + 1,
    });
  }

  if (nodeType === "ai_skill") {
    const output = await runAiSkillNode({ node, instance, tenantId, actor, payload });
    instance.context = {
      ...(instance.context || {}),
      nodeOutputs: {
        ...((instance.context && instance.context.nodeOutputs) || {}),
        [node.id]: output,
      },
    };
    await appendEvent({
      instance,
      tenantId,
      eventType: "NODE_COMPLETED",
      nodeId: node.id,
      payload: output,
      actor,
    });
    return transitionFromNode({
      tenantId,
      instance,
      definition,
      fromNodeId: node.id,
      eventType: "node.completed",
      payload: output,
      actor,
      depth: depth + 1,
    });
  }

  if (["human_task", "approval", "form", "document_request", "webhook"].includes(nodeType)) {
    const task = await ensureTaskForNode({ tenantId, instance, node, actor });
    await appendEvent({
      instance,
      tenantId,
      eventType: "TASK_CREATED",
      nodeId: node.id,
      payload: {
        taskId: task._id,
        title: task.title,
        assigneeRole: task.assigneeRole,
      },
      actor,
    });
    await instance.save();
    return instance;
  }

  await instance.save();
  return instance;
};

const resolveDefinitionVersion = async ({ tenantId, definitionId, versionId }) => {
  if (versionId) {
    return WorkflowDefinitionVersion.findOne({
      _id: versionId,
      tenantId,
      status: "PUBLISHED",
    });
  }
  return WorkflowDefinitionVersion.findOne({
    definitionId,
    tenantId,
    status: "PUBLISHED",
  })
    .sort({ version: -1 })
    .lean();
};

export const WorkflowRuntimeService = {
  async startInstance({
    tenantId,
    definitionId,
    versionId,
    context = {},
    legacyRefs = {},
    roleAssignments = {},
    actor,
  }) {
    const definitionVersion = await resolveDefinitionVersion({ tenantId, definitionId, versionId });
    if (!definitionVersion) {
      const error = new Error("Published definition version not found");
      error.status = 404;
      throw error;
    }

    const definition = definitionVersion.definition || {};
    const instance = await WorkflowInstance.create({
      tenantId,
      packKey: String(definitionVersion.packKey || definition.packKey || "custom"),
      definitionId: definitionVersion.definitionId,
      definitionVersionId: definitionVersion._id,
      definitionVersion: definitionVersion.version,
      status: "RUNNING",
      currentNodeId: "",
      context,
      legacyRefs,
      roleAssignments,
      startedAt: now(),
      createdBy: actor?._id || null,
      updatedBy: actor?._id || null,
    });

    await appendEvent({
      instance,
      tenantId,
      eventType: "INSTANCE_STARTED",
      nodeId: "",
      payload: { definitionVersionId: definitionVersion._id, definitionVersion: definitionVersion.version },
      actor,
    });

    await enterNode({
      tenantId,
      instance,
      definition,
      nodeId: definition.startNodeId,
      actor,
      payload: {},
      depth: 0,
    });

    return instance;
  },

  async getInstanceDetails({ tenantId, instanceId }) {
    const [instance, events, tasks] = await Promise.all([
      WorkflowInstance.findOne({ _id: instanceId, tenantId }).lean(),
      WorkflowEvent.find({ instanceId, tenantId }).sort({ seq: -1 }).limit(200).lean(),
      WorkflowTask.find({ instanceId, tenantId }).sort({ createdAt: -1 }).lean(),
    ]);

    if (!instance) return null;
    return { instance, events: events.reverse(), tasks };
  },

  async submitEvent({ tenantId, instanceId, eventType, payload = {}, taskId = null, actor }) {
    const instance = await WorkflowInstance.findOne({ _id: instanceId, tenantId });
    if (!instance) {
      const error = new Error("Workflow instance not found");
      error.status = 404;
      throw error;
    }
    if (instance.status !== "RUNNING") {
      const error = new Error("Workflow instance is not running");
      error.status = 409;
      throw error;
    }

    const definitionVersion = await WorkflowDefinitionVersion.findOne({
      _id: instance.definitionVersionId,
      tenantId,
    }).lean();
    if (!definitionVersion?.definition) {
      const error = new Error("Pinned definition version not found");
      error.status = 404;
      throw error;
    }

    let normalizedEventType = normalizeEventType(eventType, "instance.event");
    let mergedPayload = payload || {};

    if (taskId) {
      const task = await WorkflowTask.findOne({ _id: taskId, tenantId, instanceId });
      if (!task) {
        const error = new Error("Task not found");
        error.status = 404;
        throw error;
      }
      if (!canCompleteTask({ task, user: actor })) {
        const error = new Error("Forbidden");
        error.status = 403;
        throw error;
      }
      if (!["OPEN", "IN_PROGRESS"].includes(task.status)) {
        const error = new Error("Task is not open");
        error.status = 409;
        throw error;
      }
      task.status = "COMPLETED";
      task.completedAt = now();
      task.completedBy = actor?._id || null;
      task.output = payload || {};
      task.updatedBy = actor?._id || null;
      await task.save();

      await appendEvent({
        instance,
        tenantId,
        eventType: "TASK_COMPLETED",
        nodeId: task.nodeId,
        payload: { taskId: task._id, output: task.output || {} },
        actor,
      });
      await appendEvent({
        instance,
        tenantId,
        eventType: "NODE_COMPLETED",
        nodeId: task.nodeId,
        payload: { taskId: task._id },
        actor,
      });

      normalizedEventType = "task.completed";
      mergedPayload = { ...(payload || {}), taskId: task._id };
    } else {
      await appendEvent({
        instance,
        tenantId,
        eventType: String(eventType || "INSTANCE_EVENT"),
        nodeId: instance.currentNodeId,
        payload: mergedPayload,
        actor,
      });
    }

    const result = await transitionFromNode({
      tenantId,
      instance,
      definition: definitionVersion.definition,
      fromNodeId: instance.currentNodeId,
      eventType: normalizedEventType,
      payload: mergedPayload,
      actor,
      depth: 0,
    });

    return result;
  },

  async completeTask({ tenantId, taskId, output = {}, actor }) {
    const task = await WorkflowTask.findOne({ _id: taskId, tenantId });
    if (!task) {
      const error = new Error("Task not found");
      error.status = 404;
      throw error;
    }

    return this.submitEvent({
      tenantId,
      instanceId: task.instanceId,
      eventType: "task.completed",
      payload: output,
      taskId,
      actor,
    });
  },
};
