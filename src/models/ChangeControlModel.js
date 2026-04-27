// src/models/ChangeControlModel.js
// Full change request lifecycle.
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
  signature:    { type: String },
}, { _id: true });

const ChangeControlSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true,
  },
  changeNumber: { type: String, unique: true, sparse: true },
  changeType: {
    type: String, required: true,
    enum: ['DOCUMENT', 'PROCESS', 'SUPPLIER', 'PRODUCT', 'SYSTEM',
           'EQUIPMENT', 'FORMULA', 'PROCEDURE', 'CUSTOM'],
  },
  title:        { type: String, required: true },
  description:  { type: String, required: true },
  requestedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  requestDate:  { type: Date, default: Date.now },
  impactAssessment:   { type: String },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  },
  affectedAreas:      [{ type: String }],
  regulatoryImpact:   { type: Boolean, default: false },
  validationRequired: { type: Boolean, default: false },

  // Supplier linkage — set when the change traces to a supplier (their material spec change,
  // facility change, sourcing switch). Auto-required when changeType === 'SUPPLIER'.
  supplierId:           { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null, index: true },
  supplierSiteId:       { type: mongoose.Schema.Types.ObjectId, default: null },
  // True when the change should trigger supplier re-qualification once approved.
  // Default null so the pre-save hook can auto-set true for SUPPLIER-type changes
  // when the caller hasn't explicitly opted out.
  triggersRequalification: { type: Boolean, default: null },
  approvalSteps:       [ApprovalStepSchema],
  currentApprovalStep: { type: Number, default: 0 },
  plannedImplementationDate: { type: Date },
  actualImplementationDate:  { type: Date },
  implementedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  implementationNotes: { type: String },
  verificationDate:  { type: Date },
  verifiedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  verificationNotes: { type: String },
  effectivenessCheck: { type: String },
  linkedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId }],
  linkedCAPAIds:     [{ type: mongoose.Schema.Types.ObjectId }],
  linkedEventIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowEvent' }],
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
// Compound unique index so two tenants can both have CCR-2026-0001.
ChangeControlSchema.index({ tenantId: 1, changeNumber: 1 }, { unique: true, sparse: true });

ChangeControlSchema.index({ tenantId: 1, supplierId: 1, status: 1 });

ChangeControlSchema.pre('save', async function (next) {
  if (this.isNew && !this.changeNumber) {
    const year = new Date().getFullYear();
    // Per-tenant + per-year sequence. Derive the next number from the max
    // existing changeNumber for this tenant+year, so we never collide even
    // when the collection has records from other tenants on the global
    // (pre-compound) index.
    const Model = mongoose.model('ChangeControl');
    const prefix = `CCR-${year}-`;
    const last = await Model.find({ tenantId: this.tenantId, changeNumber: { $regex: `^${prefix}` } })
      .sort({ changeNumber: -1 }).limit(1).select('changeNumber').lean();
    const lastNum = last[0]?.changeNumber ? parseInt(last[0].changeNumber.slice(prefix.length), 10) : 0;
    this.changeNumber = `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
  }
  // SUPPLIER-type changes default to requiring requalification on close.
  // Caller can override by setting triggersRequalification explicitly before save.
  if (this.changeType === 'SUPPLIER' && this.triggersRequalification == null) {
    this.triggersRequalification = true;
  }
  next();
});

export default mongoose.model('ChangeControl', ChangeControlSchema);
