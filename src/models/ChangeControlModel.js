// src/models/ChangeControlModel.js
// Full change request lifecycle — initiation through impact assessment,
// multi-role approval, implementation, and verification.
// Collection: change_controls

import mongoose from 'mongoose';

const ApprovalStepSchema = new mongoose.Schema({
  stepOrder:    { type: Number, required: true },
  role:         { type: String, required: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  decision: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'ABSTAINED'],
    default: 'PENDING',
  },
  decisionDate: { type: Date },
  comments:     { type: String },
  signature:    { type: String }, // e-signature token/hash
}, { _id: true });

const ChangeControlSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true,
  },
  changeNumber: { type: String, unique: true, sparse: true }, // auto-generated CCR-2026-0001
  changeType: {
    type: String, required: true,
    enum: ['DOCUMENT', 'PROCESS', 'SUPPLIER', 'PRODUCT', 'SYSTEM',
           'EQUIPMENT', 'FORMULA', 'PROCEDURE', 'CUSTOM'],
  },
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  requestedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  requestDate:  { type: Date, default: Date.now },
  // Impact assessment
  impactAssessment:   { type: String },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  },
  affectedAreas:      [{ type: String }],
  regulatoryImpact:   { type: Boolean, default: false },
  validationRequired: { type: Boolean, default: false },
  // Approval workflow
  approvalSteps:       [ApprovalStepSchema],
  currentApprovalStep: { type: Number, default: 0 },
  // Implementation
  plannedImplementationDate: { type: Date },
  actualImplementationDate:  { type: Date },
  implementedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  implementationNotes: { type: String },
  // Verification
  verificationDate:  { type: Date },
  verifiedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  verificationNotes: { type: String },
  effectivenessCheck: { type: String },
  // Linkages
  linkedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId }],
  linkedCAPAIds:     [{ type: mongoose.Schema.Types.ObjectId }],
  linkedEventIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowEvent' }],
  // Status
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'IMPACT_ASSESSMENT', 'UNDER_REVIEW',
           'APPROVED', 'REJECTED', 'IMPLEMENTATION', 'VERIFICATION', 'CLOSED', 'CANCELLED'],
    default: 'DRAFT',
  },
  closureDate:  { type: Date },
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'change_controls',
});

ChangeControlSchema.index({ tenantId: 1, status: 1 });
ChangeControlSchema.index({ tenantId: 1, changeType: 1 });
ChangeControlSchema.index({ tenantId: 1, requestDate: -1 });
ChangeControlSchema.index({ changeNumber: 1 }, { unique: true, sparse: true });

// Auto-generate changeNumber before first save
ChangeControlSchema.pre('save', async function (next) {
  if (this.isNew && !this.changeNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('ChangeControl').countDocuments({ tenantId: this.tenantId });
    this.changeNumber = `CCR-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('ChangeControl', ChangeControlSchema);
