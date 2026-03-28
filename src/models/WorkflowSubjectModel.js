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
