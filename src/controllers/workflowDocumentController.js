import { WorkflowDocument } from "../models/workflowDocumentModel.js";
import { WorkflowInstance } from "../models/workflowInstanceModel.js";
import { WorkflowEvent } from "../models/workflowEventModel.js";

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(400).json({ error: "Tenant context missing", code: "TENANT_CONTEXT_MISSING" });
    return false;
  }
  return true;
};

const appendDocumentEvent = async ({ tenantId, instanceId, nodeId, payload, actor }) => {
  const latest = await WorkflowEvent.findOne({ tenantId, instanceId }).sort({ seq: -1 }).lean();
  const nextSeq = Number(latest?.seq || 0) + 1;
  await WorkflowEvent.create({
    tenantId,
    instanceId,
    seq: nextSeq,
    eventType: "DOCUMENT_ATTACHED",
    nodeId: nodeId || "",
    payload: payload || {},
    actorId: actor?._id || null,
    actorRole: actor?.role || "",
    occurredAt: new Date(),
  });
  await WorkflowInstance.updateOne({ _id: instanceId, tenantId }, { $set: { lastEventSeq: nextSeq } });
};

export const createWorkflowDocument = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const instanceId = req.body?.instanceId;
    if (!instanceId) return res.status(400).json({ error: "instanceId is required" });

    const instance = await WorkflowInstance.findOne({ _id: instanceId, tenantId: req.tenantId }).lean();
    if (!instance) return res.status(404).json({ error: "Workflow instance not found" });

    const doc = await WorkflowDocument.create({
      tenantId: req.tenantId,
      instanceId,
      sourceType: req.body?.sourceType || "UPLOAD",
      sourceRef: req.body?.sourceRef || "",
      title: req.body?.title || req.body?.fileName || "Workflow document",
      fileName: req.body?.fileName || "",
      mimeType: req.body?.mimeType || "",
      sizeBytes: Number(req.body?.sizeBytes || 0),
      fileRef: req.body?.fileRef || "",
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      linkedNodeId: req.body?.linkedNodeId || instance.currentNodeId || "",
      metadata: req.body?.metadata || {},
      uploadedBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    await appendDocumentEvent({
      tenantId: req.tenantId,
      instanceId,
      nodeId: doc.linkedNodeId,
      payload: { documentId: doc._id, title: doc.title, sourceType: doc.sourceType },
      actor: req.user,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create workflow document" });
  }
};

export const tagWorkflowDocument = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : null;
    if (!tags) return res.status(400).json({ error: "tags array is required" });

    const doc = await WorkflowDocument.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: "Workflow document not found" });

    doc.tags = Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)));
    doc.updatedBy = req.user?._id || null;
    await doc.save();

    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to tag workflow document" });
  }
};

