import { TenantModuleConfig } from "../models/tenantModuleConfigModel.js";
import { AUDIT_MODULES } from "../modules/auditEngine/constants.js";
import {
  ENGAGEMENTS_ENABLED,
  ORG_DIRECTORY_ENABLED,
  ORG_MARKETPLACE_ENABLED,
  QUALIFICATION_CASES_ENABLED,
} from "../config/featureFlags.js";

export const PRODUCT_MODES = ["AUDIT_ONLY", "QMS_WITH_AUDIT", "QMS_ONLY"];
export const DEFAULT_PRODUCT_MODE = "AUDIT_ONLY";

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const DEFAULT_ENTITLEMENTS_BY_MODE = {
  AUDIT_ONLY: {
    audit: true,
    qms: false,
    vaultLite: true,
    vaultFull: false,
  },
  QMS_WITH_AUDIT: {
    audit: true,
    qms: true,
    vaultLite: true,
    vaultFull: true,
  },
  QMS_ONLY: {
    audit: false,
    qms: true,
    vaultLite: false,
    vaultFull: true,
  },
};

const toBoolean = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

const resolveTenantSettingFlag = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

export const sanitizeProductMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return PRODUCT_MODES.includes(normalized)
    ? normalized
    : DEFAULT_PRODUCT_MODE;
};

export const sanitizeEntitlements = (entitlements) => {
  const input = isPlainObject(entitlements) ? entitlements : {};
  const safe = {};
  ["audit", "qms", "vaultLite", "vaultFull"].forEach((key) => {
    if (typeof input[key] === "boolean") safe[key] = input[key];
  });
  return safe;
};

export const resolveEntitlements = (productMode, overrides = {}) => {
  const mode = sanitizeProductMode(productMode);
  const base = DEFAULT_ENTITLEMENTS_BY_MODE[mode] || DEFAULT_ENTITLEMENTS_BY_MODE[DEFAULT_PRODUCT_MODE];
  const safeOverrides = sanitizeEntitlements(overrides);
  const resolved = {
    audit: toBoolean(safeOverrides.audit, base.audit),
    qms: toBoolean(safeOverrides.qms, base.qms),
    vaultLite: toBoolean(safeOverrides.vaultLite, base.vaultLite),
    vaultFull: toBoolean(safeOverrides.vaultFull, base.vaultFull),
  };

  // Full vault always implies lite access for operational compatibility.
  if (resolved.vaultFull) resolved.vaultLite = true;
  return resolved;
};

export const buildTenantModuleAccess = (config) => {
  const mode = sanitizeProductMode(config?.productMode || DEFAULT_PRODUCT_MODE);
  const entitlements = resolveEntitlements(mode, config?.entitlements || {});
  const enabledModules = Array.isArray(config?.enabledModules)
    ? config.enabledModules
    : [];
  const defaultModule = config?.defaultModule || enabledModules[0] || "cGMP";
  const moduleSettings =
    config && typeof config.moduleSettings === "object" && !Array.isArray(config.moduleSettings)
      ? config.moduleSettings
      : {};
  return {
    productMode: mode,
    enabledModules,
    defaultModule,
    entitlements,
    moduleSettings,
    flags: {
      auditEnabled: Boolean(entitlements.audit),
      qmsEnabled: Boolean(entitlements.qms),
      vaultLiteEnabled: Boolean(entitlements.vaultLite),
      vaultFullEnabled: Boolean(entitlements.vaultFull),
      orgDirectoryEnabled: resolveTenantSettingFlag(
        moduleSettings?.orgDirectory?.enabled,
        Boolean(ORG_DIRECTORY_ENABLED)
      ),
      engagementsEnabled: resolveTenantSettingFlag(
        moduleSettings?.engagements?.enabled,
        Boolean(ENGAGEMENTS_ENABLED)
      ),
      orgMarketplaceEnabled: resolveTenantSettingFlag(
        moduleSettings?.orgMarketplace?.enabled,
        Boolean(ORG_MARKETPLACE_ENABLED)
      ),
      qualificationCasesEnabled: resolveTenantSettingFlag(
        moduleSettings?.qualificationCases?.enabled,
        Boolean(QUALIFICATION_CASES_ENABLED)
      ),
    },
  };
};

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
    const productMode = DEFAULT_PRODUCT_MODE;
    config = await TenantModuleConfig.create({
      tenantId,
      enabledModules: ["cGMP"],
      defaultModule: "cGMP",
      moduleSettings: {},
      productMode,
      entitlements: resolveEntitlements(productMode, {}),
    });
    return config;
  }

  const patch = {};
  const mode = sanitizeProductMode(config.productMode || DEFAULT_PRODUCT_MODE);
  if (mode !== config.productMode) patch.productMode = mode;

  const entitlements = resolveEntitlements(mode, config.entitlements || {});
  const existing = config.entitlements || {};
  const entitlementChanged =
    existing.audit !== entitlements.audit ||
    existing.qms !== entitlements.qms ||
    existing.vaultLite !== entitlements.vaultLite ||
    existing.vaultFull !== entitlements.vaultFull;

  if (entitlementChanged) patch.entitlements = entitlements;

  if (Object.keys(patch).length) {
    config = await TenantModuleConfig.findOneAndUpdate(
      { tenantId },
      { $set: patch },
      { new: true }
    );
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
