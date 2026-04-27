// src/services/universalModuleConfigService.js
// Resolves active universal platform modules for a tenant with safe defaults.

import ModuleConfig from '../models/ModuleConfigModel.js';

export const DEFAULT_MODULES = {
  AUDIT_MANAGEMENT: true,
  DOCUMENT_CONTROL: true,
  CAPA_MANAGEMENT: true,
  CHANGE_CONTROL: true,
  EVENT_MANAGEMENT: true,
  TRAINING_MANAGEMENT: true,
  RISK_MANAGEMENT: true,
  SUPPLIER_QUALITY: true,
  MANAGEMENT_REVIEW: true,
  ASSET_MANAGEMENT: true,
  CHAIN_OF_CUSTODY: true,
  TRANSACTION_REVIEW: true,
  REGULATORY_INTEL: true,
  AI_ASSISTANT: true,
  RFQ_PROCUREMENT: true,
};

/**
 * Module dependency bundles. When the LEFT key is enabled, every module on
 * the RIGHT is force-enabled in the resolved view (the saved DB state is
 * left untouched — this is read-time resolution).
 *
 * Rationale: Supplier Quality is incoherent without CAPA + Event + Audit
 * (you can't act on a supplier finding without a CAPA to write it into).
 * Same story for Audit Management.
 */
export const MODULE_BUNDLES = {
  SUPPLIER_QUALITY: ["CAPA_MANAGEMENT", "EVENT_MANAGEMENT", "AUDIT_MANAGEMENT"],
  AUDIT_MANAGEMENT: ["CAPA_MANAGEMENT", "DOCUMENT_CONTROL"],
  RFQ_PROCUREMENT:  ["SUPPLIER_QUALITY"],
};

/**
 * Apply bundle dependencies. Mutates and returns the modules map.
 * Records which modules were promoted-by-bundle so the UI can flag them.
 *
 * @returns {{ resolved: Record<string,boolean>, promotedBy: Record<string,string[]> }}
 */
export function applyModuleBundles(modules) {
  const resolved = { ...modules };
  const promotedBy = {};
  for (const [primary, dependents] of Object.entries(MODULE_BUNDLES)) {
    if (!resolved[primary]) continue;
    for (const dep of dependents) {
      if (!resolved[dep]) {
        resolved[dep] = true;
        promotedBy[dep] = promotedBy[dep] || [];
        if (!promotedBy[dep].includes(primary)) promotedBy[dep].push(primary);
      }
    }
  }
  return { resolved, promotedBy };
}

export const getActiveModules = async (tenantId) => {
  const config = await ModuleConfig.findOne({ tenantId }).lean();
  if (!config) return DEFAULT_MODULES;

  const raw = Object.fromEntries(
    Object.entries(DEFAULT_MODULES).map(([key, defaultVal]) => [
      key,
      config.modules?.[key]?.enabled ?? defaultVal,
    ])
  );
  const { resolved } = applyModuleBundles(raw);
  return resolved;
};

export const getModuleConfig = async (tenantId) => {
  const config = await ModuleConfig.findOne({ tenantId }).lean();
  const raw = Object.fromEntries(
    Object.entries(DEFAULT_MODULES).map(([key, defaultVal]) => [
      key,
      config?.modules?.[key]?.enabled ?? defaultVal,
    ])
  );
  const { resolved, promotedBy } = applyModuleBundles(raw);
  return {
    modules: resolved,
    rawModules: raw,           // pre-bundle saved state — UI shows toggle position
    promotedBy,                // map: moduleKey → [reasons it's force-enabled]
    bundles: MODULE_BUNDLES,
    vocabularyOverrides: config?.vocabularyOverrides ?? {},
    industryProfile: config?.industryProfile ?? 'PHARMA_GMP',
    activeWorkflowKeys: config?.activeWorkflowKeys ?? ['gmp_pharma_audit'],
    complianceStandardKeys: config?.complianceStandardKeys ?? [],
  };
};
