/**
 * seed_module_configs.js
 *
 * Seeds a ModuleConfig for each tenant found in the database,
 * using industry profile presets. Skips tenants that already have a config.
 *
 * Run via: npm run seed:universal (called from seed_all_universal.js)
 */

import { fileURLToPath } from "url";

const INDUSTRY_MODULE_PRESETS = {
  PHARMA_GMP: {
    activeWorkflowKeys: ["gmp_pharma_audit"],
    complianceStandardKeys: ["ICH_Q7", "WHO_GMP", "CFR_21_211"],
    modules: {
      AUDIT_MANAGEMENT:    { enabled: true },
      DOCUMENT_CONTROL:    { enabled: true },
      CAPA_MANAGEMENT:     { enabled: true },
      CHANGE_CONTROL:      { enabled: true },
      EVENT_MANAGEMENT:    { enabled: true },
      SUPPLIER_QUALITY:    { enabled: true },
      RISK_MANAGEMENT:     { enabled: true },
      REGULATORY_INTEL:    { enabled: true },
      AI_ASSISTANT:        { enabled: true },
      RFQ_PROCUREMENT:     { enabled: true },
      MANAGEMENT_REVIEW:   { enabled: true },
      TRAINING_MANAGEMENT: { enabled: false },
      CHAIN_OF_CUSTODY:    { enabled: false },
      TRANSACTION_REVIEW:  { enabled: false },
      ASSET_MANAGEMENT:    { enabled: false },
    },
  },
  ORGANIC_FARMING: {
    activeWorkflowKeys: ["organic_farming_coc"],
    complianceStandardKeys: ["USDA_NOP", "EU_ORGANIC_REGULATION"],
    modules: {
      AUDIT_MANAGEMENT:    { enabled: true },
      DOCUMENT_CONTROL:    { enabled: true },
      CAPA_MANAGEMENT:     { enabled: true },
      CHANGE_CONTROL:      { enabled: false },
      EVENT_MANAGEMENT:    { enabled: true },
      SUPPLIER_QUALITY:    { enabled: false },
      RISK_MANAGEMENT:     { enabled: false },
      REGULATORY_INTEL:    { enabled: true },
      AI_ASSISTANT:        { enabled: true },
      RFQ_PROCUREMENT:     { enabled: false },
      CHAIN_OF_CUSTODY:    { enabled: true },
      MANAGEMENT_REVIEW:   { enabled: false },
      TRAINING_MANAGEMENT: { enabled: false },
      TRANSACTION_REVIEW:  { enabled: false },
      ASSET_MANAGEMENT:    { enabled: false },
    },
    vocabularyOverrides: {
      audit: "Inspection",
      supplier: "Farm",
      auditor: "Certifier",
      product: "Crop Lot",
      report: "Certificate",
      finding: "Nonconformance",
      capa: "Corrective Action",
    },
  },
  FOREST_COC: {
    activeWorkflowKeys: ["forest_coc"],
    complianceStandardKeys: ["FSC_STD_40_004", "PEFC_ST_2002"],
    modules: {
      AUDIT_MANAGEMENT:    { enabled: true },
      DOCUMENT_CONTROL:    { enabled: true },
      CAPA_MANAGEMENT:     { enabled: true },
      CHANGE_CONTROL:      { enabled: false },
      EVENT_MANAGEMENT:    { enabled: true },
      SUPPLIER_QUALITY:    { enabled: false },
      RISK_MANAGEMENT:     { enabled: false },
      REGULATORY_INTEL:    { enabled: false },
      AI_ASSISTANT:        { enabled: true },
      RFQ_PROCUREMENT:     { enabled: false },
      CHAIN_OF_CUSTODY:    { enabled: true },
      MANAGEMENT_REVIEW:   { enabled: false },
      TRAINING_MANAGEMENT: { enabled: false },
      TRANSACTION_REVIEW:  { enabled: false },
      ASSET_MANAGEMENT:    { enabled: false },
    },
    vocabularyOverrides: {
      audit: "Audit",
      supplier: "Forest Manager",
      auditor: "Certifier",
      product: "Timber Volume",
      report: "CoC Certificate",
      finding: "Nonconformity",
      capa: "Corrective Action",
    },
  },
};

export const seedModuleConfigs = async () => {
  const ModuleConfigModule = await import("../src/models/ModuleConfigModel.js");
  const ModuleConfig = ModuleConfigModule.default;

  // Try to find the Tenant model — if not available, log warning and skip
  let Tenant;
  try {
    const TenantModule = await import("../src/models/tenantModel.js");
    Tenant = TenantModule.default ?? TenantModule.Tenant;
  } catch {
    console.warn("[SEED:ModuleConfigs] tenantModel.js not found — skipping tenant seeding");
    return;
  }

  const tenants = await Tenant.find({}).lean();
  if (!tenants.length) {
    console.log("[SEED:ModuleConfigs] No tenants found — skipping");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const existing = await ModuleConfig.findOne({ tenantId: tenant._id });
    if (existing) {
      skipped++;
      continue;
    }
    // Default all tenants to PHARMA_GMP profile
    const preset = INDUSTRY_MODULE_PRESETS.PHARMA_GMP;
    await ModuleConfig.create({
      tenantId: tenant._id,
      industryProfile: "PHARMA_GMP",
      activeWorkflowKeys: preset.activeWorkflowKeys,
      complianceStandardKeys: preset.complianceStandardKeys,
      modules: preset.modules,
    });
    created++;
  }

  console.log(
    `[SEED:ModuleConfigs] ✓ ${created} created, ${skipped} already existed.`
  );
};

// ── Standalone execution ────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dotenv = (await import("dotenv")).default;
  const path = (await import("path")).default;
  const url = await import("url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, "../.env.universal") });

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  await seedModuleConfigs();
  await mongoose.disconnect();
}
