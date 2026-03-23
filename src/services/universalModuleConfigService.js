// backend/src/services/universalModuleConfigService.js
// Resolves active universal platform modules for a tenant with safe defaults.
// Named universalModuleConfigService to avoid collision with existing moduleConfigService.js

import ModuleConfig from "../models/ModuleConfigModel.js";

export const DEFAULT_MODULES = {
  AUDIT_MANAGEMENT: true,
  DOCUMENT_CONTROL: true,
  CAPA_MANAGEMENT: true,
  CHANGE_CONTROL: false,
  EVENT_MANAGEMENT: false,
  TRAINING_MANAGEMENT: false,
  RISK_MANAGEMENT: false,
  SUPPLIER_QUALITY: true,
  MANAGEMENT_REVIEW: false,
  ASSET_MANAGEMENT: false,
  CHAIN_OF_CUSTODY: false,
  TRANSACTION_REVIEW: false,
  REGULATORY_INTEL: true,
  AI_ASSISTANT: true,
  RFQ_PROCUREMENT: true,
};

export const getActiveModules = async (tenantId) => {
  const config = await ModuleConfig.findOne({ tenantId }).lean();
  if (!config) return DEFAULT_MODULES;

  return Object.fromEntries(
    Object.entries(DEFAULT_MODULES).map(([key, defaultVal]) => [
      key,
      config.modules?.[key]?.enabled ?? defaultVal,
    ])
  );
};

export const getModuleConfig = async (tenantId) => {
  const config = await ModuleConfig.findOne({ tenantId }).lean();
  return {
    modules: await getActiveModules(tenantId),
    vocabularyOverrides: config?.vocabularyOverrides ?? {},
    industryProfile: config?.industryProfile ?? "PHARMA_GMP",
    activeWorkflowKeys: config?.activeWorkflowKeys ?? ["gmp_pharma_audit"],
    complianceStandardKeys: config?.complianceStandardKeys ?? [],
  };
};
