// src/models/WorkflowSubjectModel.js
// Universal subject of any workflow.
// Collection: workflow_subjects

import mongoose from 'mongoose';

const WorkflowSubjectSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true,
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true,
  },
  subjectType: {
    type: String, required: true,
    enum: ['PRODUCT', 'BATCH', 'LOT', 'PROPERTY', 'ITEM', 'ASSET',
           'PROCESS', 'DOCUMENT', 'CUSTOM'],
  },
  name:       { type: String, required: true },
  identifier: { type: String },
  category:   { type: String },
  specifications: { type: Map, of: mongoose.Schema.Types.Mixed },
  certifications: [{
    type: String, certNumber: String, expiryDate: Date,
    documentId: { type: mongoose.Schema.Types.ObjectId },
  }],
  locationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  riskProfile: { type: mongoose.Schema.Types.Mixed },

  // ── Phase 3: Chain of Custody ─────────────────────────────────────────────
  currentCustodian: { type: String, default: null },
  currentCustodianId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  currentLocation: { type: String, default: null },
  cocStatus: {
    type: String,
    enum: ['ACTIVE', 'IN_TRANSIT', 'RECEIVED', 'CLOSED', 'DISPUTED', 'PENDING'],
    default: 'ACTIVE',
  },
  custodyChain: [{
    fromCustodian: { type: String },
    fromCustodianId: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    toCustodian: { type: String },
    toCustodianId: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    fromLocation: { type: String },
    toLocation: { type: String },
    transferredAt: { type: Date },
    receivedAt: { type: Date },
    condition: { type: String, enum: ['GOOD', 'DAMAGED', 'SEALED', 'OPENED', 'TAMPERED'], default: 'GOOD' },
    notes: { type: String },
    signatureId: { type: mongoose.Schema.Types.ObjectId, ref: 'ElectronicSignature' },
  }],
  // ─────────────────────────────────────────────────────────────────────────

  customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
  legacyRefCollection: { type: String },
  legacyRefId:         { type: mongoose.Schema.Types.ObjectId },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'workflow_subjects',
});

WorkflowSubjectSchema.index({ tenantId: 1, partyId: 1 });
WorkflowSubjectSchema.index({ tenantId: 1, subjectType: 1 });
WorkflowSubjectSchema.index({ tenantId: 1, identifier: 1 });

export default mongoose.model('WorkflowSubject', WorkflowSubjectSchema);
