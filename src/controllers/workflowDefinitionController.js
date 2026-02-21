import { WorkflowDefinition } from "../models/workflowDefinitionModel.js";
import { WorkflowDefinitionVersion } from "../models/workflowDefinitionVersionModel.js";
import {
  computeDefinitionChecksum,
  normalizeDefinitionPayload,
  validateWorkflowDefinition,
} from "../services/workflowDefinitionService.js";

const toStringSafe = (value) => (value === undefined || value === null ? "" : String(value).trim());

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(400).json({ error: "Tenant context missing", code: "TENANT_CONTEXT_MISSING" });
    return false;
  }
  return true;
};

export const createWorkflowDefinition = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const key = toStringSafe(req.body?.key);
    const name = toStringSafe(req.body?.name);
    const packKey = toStringSafe(req.body?.packKey);
    const description = toStringSafe(req.body?.description);
    if (!key || !name || !packKey) {
      return res.status(400).json({ error: "key, name and packKey are required" });
    }

    const existing = await WorkflowDefinition.findOne({ tenantId: req.tenantId, key }).lean();
    if (existing) return res.status(409).json({ error: "Workflow definition key already exists" });

    const created = await WorkflowDefinition.create({
      tenantId: req.tenantId,
      packKey,
      key,
      name,
      description,
      status: "DRAFT",
      latestVersion: 0,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create workflow definition" });
  }
};

export const listWorkflowDefinitions = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const query = { tenantId: req.tenantId };
    if (req.query?.pack) query.packKey = toStringSafe(req.query.pack);
    if (req.query?.status) query.status = toStringSafe(req.query.status).toUpperCase();
    if (req.query?.search) query.name = { $regex: toStringSafe(req.query.search), $options: "i" };

    const items = await WorkflowDefinition.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list workflow definitions" });
  }
};

export const listWorkflowDefinitionVersions = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const definition = await WorkflowDefinition.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    }).lean();
    if (!definition) return res.status(404).json({ error: "Workflow definition not found" });

    const versions = await WorkflowDefinitionVersion.find({
      definitionId: definition._id,
      tenantId: req.tenantId,
    })
      .sort({ version: -1 })
      .lean();

    return res.json({ success: true, data: versions });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to list workflow definition versions" });
  }
};

export const publishWorkflowDefinition = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const definitionRow = await WorkflowDefinition.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!definitionRow) return res.status(404).json({ error: "Workflow definition not found" });

    const normalized = normalizeDefinitionPayload({
      ...(req.body?.definition || {}),
      key: req.body?.definition?.key || definitionRow.key,
      name: req.body?.definition?.name || definitionRow.name,
      packKey: req.body?.definition?.packKey || definitionRow.packKey,
    });
    const validation = validateWorkflowDefinition(normalized);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error || "Invalid workflow definition payload" });
    }

    const nextVersion = Number(definitionRow.latestVersion || 0) + 1;
    const version = await WorkflowDefinitionVersion.create({
      tenantId: req.tenantId,
      definitionId: definitionRow._id,
      packKey: definitionRow.packKey,
      version: nextVersion,
      status: "PUBLISHED",
      schemaVersion: 1,
      definition: {
        ...normalized,
        version: nextVersion,
      },
      checksum: computeDefinitionChecksum(normalized),
      publishedAt: new Date(),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    definitionRow.name = normalized.name;
    definitionRow.packKey = normalized.packKey;
    definitionRow.description = normalized.description || definitionRow.description;
    definitionRow.status = "PUBLISHED";
    definitionRow.latestVersion = nextVersion;
    definitionRow.latestVersionId = version._id;
    definitionRow.updatedBy = req.user?._id || null;
    await definitionRow.save();

    return res.status(201).json({
      success: true,
      data: {
        definitionId: definitionRow._id,
        versionId: version._id,
        version: version.version,
        status: version.status,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to publish workflow definition" });
  }
};

