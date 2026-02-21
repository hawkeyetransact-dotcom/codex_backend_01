import { PackRegistryService } from "../services/packRegistryService.js";

const requireTenant = (req, res) => {
  if (!req.tenantId) {
    res.status(400).json({ error: "Tenant context missing", code: "TENANT_CONTEXT_MISSING" });
    return false;
  }
  return true;
};

export const listPacks = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const packs = await PackRegistryService.listPacks({ tenantId: req.tenantId });
    return res.json({ success: true, data: packs });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to list packs" });
  }
};

export const installPack = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const result = await PackRegistryService.installPack({
      tenantId: req.tenantId,
      packKey: req.body?.packKey,
      packVersion: req.body?.packVersion,
      actor: req.user,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to install pack" });
  }
};

export const importPackTemplates = async (req, res) => {
  try {
    if (!requireTenant(req, res)) return;
    const result = await PackRegistryService.importTemplates({
      tenantId: req.tenantId,
      packId: req.params.id,
      templateKeys: Array.isArray(req.body?.templateKeys) ? req.body.templateKeys : [],
      publish: req.body?.publish !== false,
      actor: req.user,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to import templates" });
  }
};

