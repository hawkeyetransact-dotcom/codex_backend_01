import { TenantModuleConfig } from "../models/tenantModuleConfigModel.js";
import { AUDIT_MODULES } from "../modules/auditEngine/constants.js";

export const normalizeModules = (modules, config) => {
  const raw = Array.isArray(modules) ? modules : modules ? [modules] : [];
  const unique = Array.from(new Set(raw.filter(Boolean)));
  if (unique.length) return unique;
  if (config?.defaultModule) return [config.defaultModule];
  return ["cGMP"];
};

export const ensureTenantModuleConfig = async (tenantId) => {
  if (!tenantId) return null;
  let config = await TenantModuleConfig.findOne({ tenantId });
  if (!config) {
    config = await TenantModuleConfig.create({
      tenantId,
      enabledModules: ["cGMP"],
      defaultModule: "cGMP",
      moduleSettings: {},
    });
  }
  return config;
};

export const assertModulesEnabled = (config, modules) => {
  if (!config) return { ok: false, missing: modules };
  const enabled = new Set(config.enabledModules || []);
  const missing = modules.filter((m) => !enabled.has(m));
  return { ok: missing.length === 0, missing };
};

export const sanitizeModules = (modules) => {
  const arr = Array.isArray(modules) ? modules : modules ? [modules] : [];
  return arr.filter((m) => AUDIT_MODULES.includes(m));
};
