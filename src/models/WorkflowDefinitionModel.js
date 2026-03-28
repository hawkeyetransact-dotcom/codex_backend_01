// src/models/WorkflowDefinitionModel.js
// Universal workflow definition template.
// Collection: workflow_definitions

import mongoose from 'mongoose';

const PhaseSchema = new mongoose.Schema({
  key:             { type: String, required: true },
  displayName:     { type: String, required: true },
  order:           { type: Number, required: true },
  allowedRoles:    [{ type: String }],
  entryConditions: [{ type: String }],
  exitConditions:  [{ type: String }],
  requiredArtifacts: [{ type: String }],
  isMandatory:     { type: Boolean, default: true },
}, { _id: false });

const VocabularyDefaultsSchema = new mongoose.Schema({
  audit:    { type: String, default: 'Audit' },
  supplier: { type: String, default: 'Supplier' },
  buyer:    { type: String, default: 'Buyer' },
  auditor:  { type: String, default: 'Auditor' },
  product:  { type: String, default: 'Product' },
  site:     { type: String, default: 'Site' },
  finding:  { type: String, default: 'Finding' },
  capa:     { type: String, default: 'CAPA' },
  report:   { type: String, default: 'Report' },
}, { _id: false });

const WorkflowDefinitionSchema = new mongoose.Schema({
  workflowKey: {
    type: String, required: true, unique: true, trim: true,
  },
  displayName:   { type: String, required: true },
  description:   { type: String },
  domainModule: {
    type: String, required: true,
    enum: ['AUDIT', 'INSPECTION', 'VERIFICATION', 'REVIEW',
           'CHAIN_OF_CUSTODY', 'TRANSACTION_REVIEW', 'CUSTOM'],
  },
  partyLabel:   { type: String, required: true },
  subjectLabel: { type: String, required: true },
  phases:       { type: [PhaseSchema], required: true },
  standardsLibrary: [{ type: String }],
  reportTemplateKey: { type: String },
  vocabularyDefaults: { type: VocabularyDefaultsSchema, default: () => ({}) },
  industryTags:  [{ type: String }],
  isBuiltIn:     { type: Boolean, default: false },
  isActive:      { type: Boolean, default: true },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant',
    default: null,
  },
}, {
  timestamps: true,
  collection: 'workflow_definitions',
});

WorkflowDefinitionSchema.index({ workflowKey: 1 }, { unique: true });
WorkflowDefinitionSchema.index({ tenantId: 1, isActive: 1 });
WorkflowDefinitionSchema.index({ industryTags: 1 });

export default mongoose.model('WorkflowDefinition', WorkflowDefinitionSchema);
