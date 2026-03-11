import {
  ORG_DIRECTORY_ENABLED,
  ENGAGEMENTS_ENABLED,
  ORG_MARKETPLACE_ENABLED,
  QUALIFICATION_CASES_ENABLED,
} from "../../config/featureFlags.js";
import { TenantModuleConfig } from "../../models/tenantModuleConfigModel.js";

const STATIC_FLAG_MAP = {
  ORG_DIRECTORY_ENABLED,
  ENGAGEMENTS_ENABLED,
  ORG_MARKETPLACE_ENABLED,
  QUALIFICATION_CASES_ENABLED,
};

const TENANT_SETTING_MAP = {
  ORG_DIRECTORY_ENABLED: "orgDirectory",
  ENGAGEMENTS_ENABLED: "engagements",
  ORG_MARKETPLACE_ENABLED: "orgMarketplace",
  QUALIFICATION_CASES_ENABLED: "qualificationCases",
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

export const isFeatureEnabledForTenant = async (featureKey, tenantId) => {
  const staticValue = Boolean(STATIC_FLAG_MAP[featureKey]);
  if (!tenantId) return staticValue;

  const config = await TenantModuleConfig.findOne({ tenantId }).select("moduleSettings").lean();
  const settingKey = TENANT_SETTING_MAP[featureKey];
  const tenantValue = toBoolean(config?.moduleSettings?.[settingKey]?.enabled);
  return tenantValue === null ? staticValue : tenantValue;
};
