import { TenantModuleConfig } from "../../models/tenantModuleConfigModel.js";
import { ComplianceStandard } from "../../models/complianceStandardModel.js";
import {
  buildTenantModuleAccess,
  ensureTenantModuleConfig,
  resolveEntitlements,
  sanitizeEntitlements,
  sanitizeModules,
  sanitizeProductMode,
} from "../../services/moduleConfigService.js";

const toConfigResponse = (config) => {
  if (!config) return null;
  const payload = typeof config.toObject === "function" ? config.toObject() : config;
  return {
    ...payload,
    ...buildTenantModuleAccess(payload),
  };
};

export const getModuleConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const config = await ensureTenantModuleConfig(tenantId);
    return res.json({ success: true, data: toConfigResponse(config) });
  } catch (error) {
    console.error("getModuleConfig error", error);
    return res.status(500).json({ error: "Failed to load module config" });
  }
};

export const updateModuleConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const currentConfig = await ensureTenantModuleConfig(tenantId);
    const enabledModules = sanitizeModules(req.body?.enabledModules ?? currentConfig?.enabledModules ?? []);
    const defaultModuleCandidate =
      req.body?.defaultModule || currentConfig?.defaultModule || enabledModules[0] || "cGMP";
    const defaultModule = enabledModules.length ? defaultModuleCandidate : currentConfig?.defaultModule || "cGMP";
    if (enabledModules.length && defaultModule && !enabledModules.includes(defaultModule)) {
      return res.status(400).json({ error: "defaultModule must be in enabledModules" });
    }
    const productMode = sanitizeProductMode(req.body?.productMode || currentConfig?.productMode);
    const requestedEntitlements = sanitizeEntitlements(req.body?.entitlements || {});
    const entitlements = resolveEntitlements(productMode, {
      ...(currentConfig?.entitlements || {}),
      ...requestedEntitlements,
    });

    const config = await TenantModuleConfig.findOneAndUpdate(
      { tenantId },
      {
        enabledModules,
        defaultModule,
        productMode,
        entitlements,
        moduleSettings: req.body?.moduleSettings ?? currentConfig?.moduleSettings ?? {},
      },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: toConfigResponse(config) });
  } catch (error) {
    console.error("updateModuleConfig error", error);
    return res.status(500).json({ error: "Failed to update module config" });
  }
};

export const getActiveModuleConfig = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const config = await ensureTenantModuleConfig(tenantId);
    return res.json({ success: true, data: buildTenantModuleAccess(config) });
  } catch (error) {
    console.error("getActiveModuleConfig error", error);
    return res.status(500).json({ error: "Failed to load active module config" });
  }
};

export const listStandards = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    const standards = await ComplianceStandard.find({ tenantId }).sort({ name: 1 }).lean();
    return res.json({ success: true, data: standards });
  } catch (error) {
    console.error("listStandards error", error);
    return res.status(500).json({ error: "Failed to load standards" });
  }
};
