// src/models/PartyModel.js
// Universal generalization of supplier/buyer/auditor profile entities.
// Collection: parties
// NOTE: Does NOT replace existing supplier/buyer/auditor profile collections.
// Provides the universal abstraction layer; new workflow instances reference partyId.
// Existing audit instances continue using their existing supplier/buyer/auditor refs.

import mongoose from 'mongoose';

const CertificationSchema = new mongoose.Schema({
  type:       { type: String },
  certNumber: { type: String },
  issuedBy:   { type: String },
  issuedDate: { type: Date },
  expiryDate: { type: Date },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DigiLockerDocument' },
  status:     {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING'],
    default: 'ACTIVE',
  },
}, { _id: true });

const PartySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true,
  },
  partyType: {
    type: String, required: true,
    enum: ['SUPPLIER', 'BUYER', 'AUDITOR', 'FARM', 'FOREST_MANAGER', 'SELLER',
           'LAB', 'DEALER', 'CONSIGNOR', 'CERTIFYING_BODY', 'CUSTOM'],
  },
  displayName:    { type: String, required: true },
  legalName:      { type: String },
  registrationId: { type: String },
  contactEmail:   { type: String },
  contactPhone:   { type: String },
  address: {
    line1: String, line2: String, city: String,
    state: String, country: String, zip: String,
  },
  certifications: [CertificationSchema],
  riskScore:    { type: Number, min: 0, max: 100, default: null },
  riskFactors:  [{ type: String }],
  locationIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Site' }],
  legacyRefCollection: { type: String },
  legacyRefId:         { type: mongoose.Schema.Types.ObjectId },
  customFields:        { type: Map, of: mongoose.Schema.Types.Mixed },
  isActive:            { type: Boolean, default: true },
}, {
  timestamps: true,
  collection: 'parties',
});

PartySchema.index({ tenantId: 1, partyType: 1 });
PartySchema.index({ tenantId: 1, displayName: 'text' });
PartySchema.index({ tenantId: 1, isActive: 1 });

export default mongoose.model('Party', PartySchema);
