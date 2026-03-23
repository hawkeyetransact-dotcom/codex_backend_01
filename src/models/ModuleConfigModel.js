// src/models/ModuleConfigModel.js
// Per-tenant universal module switch panel.
// Collection: module_configs
// NOTE: This is distinct from tenantModuleConfigModel.js (audit-only module config).
// This model covers the full eQMS module set for the universal workflow platform.

import mongoose from 'mongoose';

const ModuleToggleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  config:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const VocabularyOverrideSchema = new mongoose.Schema({
  audit:    String, supplier: String, buyer: String,
  auditor:  String, product:  String, site:  String,
  finding:  String, capa:     String, report: String,
}, { _id: false });

const ModuleConfigSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',
    required: true, unique: true,
  },
  modules: {
    AUDIT_MANAGEMENT:    { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    DOCUMENT_CONTROL:    { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    CAPA_MANAGEMENT:     { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    CHANGE_CONTROL:      { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    EVENT_MANAGEMENT:    { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    TRAINING_MANAGEMENT: { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    RISK_MANAGEMENT:     { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    SUPPLIER_QUALITY:    { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    MANAGEMENT_REVIEW:   { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    ASSET_MANAGEMENT:    { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    CHAIN_OF_CUSTODY:    { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    TRANSACTION_REVIEW:  { type: ModuleToggleSchema, default: () => ({ enabled: false }) },
    REGULATORY_INTEL:    { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    AI_ASSISTANT:        { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
    RFQ_PROCUREMENT:     { type: ModuleToggleSchema, default: () => ({ enabled: true }) },
  },
  vocabularyOverrides: { type: VocabularyOverrideSchema, default: () => ({}) },
  industryProfile: {
    type: String,
    enum: ['PHARMA_GMP', 'MEDICAL_DEVICE', 'ORGANIC_FARMING', 'FOREST_COC',
           'REAL_ESTATE', 'HIGH_TICKET', 'ISO9001', 'FOOD_SAFETY', 'CUSTOM'],
    default: 'PHARMA_GMP',
  },
  activeWorkflowKeys:    [{ type: String }],  // which workflow definitions are active
  complianceStandardKeys: [{ type: String }], // active compliance standards
}, {
  timestamps: true,
  collection: 'module_configs',
});

ModuleConfigSchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model('ModuleConfig', ModuleConfigSchema);
