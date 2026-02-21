import { Pack } from "../models/packModel.js";
import { WorkflowDefinition } from "../models/workflowDefinitionModel.js";
import { WorkflowDefinitionVersion } from "../models/workflowDefinitionVersionModel.js";
import {
  computeDefinitionChecksum,
  normalizeDefinitionPayload,
  validateWorkflowDefinition,
} from "./workflowDefinitionService.js";

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    const error = new Error("Tenant context missing");
    error.status = 400;
    throw error;
  }
};

const resolvePackLatest = async ({ key = "", version = "" } = {}) => {
  if (version) {
    return Pack.findOne({ key, version, status: "ACTIVE" }).lean();
  }
  return Pack.findOne({ key, status: "ACTIVE" }).sort({ updatedAt: -1 }).lean();
};

export const PackRegistryService = {
  async listPacks({ tenantId }) {
    ensureTenant(tenantId);
    const [packs, installedDefinitions] = await Promise.all([
      Pack.find({ status: "ACTIVE" }).sort({ key: 1, updatedAt: -1 }).lean(),
      WorkflowDefinition.find({ tenantId }).select("packKey").lean(),
    ]);
    const installedKeys = new Set(installedDefinitions.map((item) => String(item.packKey || "")));

    return packs.map((pack) => ({
      ...pack,
      installed: installedKeys.has(String(pack.key)),
    }));
  },

  async installPack({ tenantId, packKey, packVersion, actor }) {
    ensureTenant(tenantId);
    if (!packKey) {
      const error = new Error("packKey is required");
      error.status = 400;
      throw error;
    }
    const pack = await resolvePackLatest({ key: packKey, version: packVersion });
    if (!pack) {
      const error = new Error("Pack not found");
      error.status = 404;
      throw error;
    }

    const existing = await WorkflowDefinition.countDocuments({ tenantId, packKey: pack.key });
    return {
      pack,
      alreadyInstalled: existing > 0,
      actorId: actor?._id || null,
    };
  },

  async importTemplates({ tenantId, packId, templateKeys = [], publish = true, actor }) {
    ensureTenant(tenantId);
    const pack = await Pack.findOne({ _id: packId, status: "ACTIVE" }).lean();
    if (!pack) {
      const error = new Error("Pack not found");
      error.status = 404;
      throw error;
    }

    const templates = Array.isArray(pack.templates) ? pack.templates : [];
    const wanted = templateKeys.length
      ? templates.filter((template) => templateKeys.includes(template.key))
      : templates;
    if (!wanted.length) {
      const error = new Error("No templates found to import");
      error.status = 400;
      throw error;
    }

    const imported = [];
    for (const template of wanted) {
      const normalizedDefinition = normalizeDefinitionPayload({
        ...(template.definition || {}),
        key: template.definition?.key || `${pack.key}.${template.key}`,
        name: template.definition?.name || template.name,
        packKey: pack.key,
      });

      const valid = validateWorkflowDefinition(normalizedDefinition);
      if (!valid.ok) {
        const error = new Error(`Template '${template.key}' is invalid: ${valid.error}`);
        error.status = 400;
        throw error;
      }

      let definition = await WorkflowDefinition.findOne({
        tenantId,
        key: normalizedDefinition.key,
      });
      if (!definition) {
        definition = await WorkflowDefinition.create({
          tenantId,
          packKey: pack.key,
          key: normalizedDefinition.key,
          name: normalizedDefinition.name,
          description: normalizedDefinition.description || template.description || "",
          status: "DRAFT",
          latestVersion: 0,
          createdBy: actor?._id || null,
          updatedBy: actor?._id || null,
        });
      }

      const nextVersion = Number(definition.latestVersion || 0) + 1;
      const versionDoc = await WorkflowDefinitionVersion.create({
        tenantId,
        definitionId: definition._id,
        packKey: pack.key,
        version: nextVersion,
        status: publish ? "PUBLISHED" : "DRAFT",
        schemaVersion: 1,
        definition: {
          ...normalizedDefinition,
          version: nextVersion,
        },
        checksum: computeDefinitionChecksum(normalizedDefinition),
        publishedAt: publish ? new Date() : null,
        createdBy: actor?._id || null,
        updatedBy: actor?._id || null,
      });

      definition.latestVersion = nextVersion;
      definition.latestVersionId = versionDoc._id;
      definition.status = publish ? "PUBLISHED" : "DRAFT";
      definition.updatedBy = actor?._id || null;
      await definition.save();

      imported.push({
        templateKey: template.key,
        definitionId: definition._id,
        versionId: versionDoc._id,
        version: nextVersion,
        status: versionDoc.status,
      });
    }

    return {
      pack: { id: pack._id, key: pack.key, version: pack.version, name: pack.name },
      imported,
    };
  },
};

