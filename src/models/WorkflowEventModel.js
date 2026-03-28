// src/models/WorkflowEventModel.js
// Universal nonconformance, deviation, complaint, incident, observation record.
// Collection: workflow_events

import mongoose from 'mongoose';

const WorkflowEventSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true,
  },
  workflowInstanceId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'audit-requests-master',
    default: null,
  },
  workflowKey: { type: String },
  eventType: {
    type: String, required: true,
    enum: ['NONCONFORMANCE', 'DEVIATION', 'COMPLAINT', 'INCIDENT',
           'OBSERVATION', 'ADVERSE_EVENT', 'FLAG', 'CUSTOM'],
  },
  severity: {
    type: String, required: true,
    enum: ['CRITICAL', 'MAJOR', 'MINOR', 'INFORMATIONAL'],
    default: 'MINOR',
  },
  title:       { type: String, required: true },
  description: { type: String },
  reportedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  reportedAt:  { type: Date, default: Date.now },
  detectedAt:  { type: Date },
  rootCauseAnalysis:   { type: String },
  rootCauseCategory:   { type: String },
  investigationNotes:  { type: String },
  investigationStatus: {
    type: String,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'],
    default: 'NOT_STARTED',
  },
  linkedCAPAIds:     [{ type: mongoose.Schema.Types.ObjectId }],
  linkedQuestionIds: [{ type: mongoose.Schema.Types.ObjectId }],
  linkedFindingIds:  [{ type: mongoose.Schema.Types.ObjectId }],
  evidenceIds:       [{ type: mongoose.Schema.Types.ObjectId }],
  status: {
    type: String,
    enum: ['OPEN', 'UNDER_INVESTIGATION', 'PENDING_CAPA', 'CAPA_IN_PROGRESS',
           'PENDING_CLOSURE', 'CLOSED', 'CANCELLED'],
    default: 'OPEN',
  },
  closureDate:  { type: Date },
  closedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  closureNotes: { type: String },
  requiresRegulatoryReport: { type: Boolean, default: false },
  regulatoryReportDate:     { type: Date },
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'workflow_events',
});

WorkflowEventSchema.index({ tenantId: 1, status: 1 });
WorkflowEventSchema.index({ tenantId: 1, eventType: 1, severity: 1 });
WorkflowEventSchema.index({ workflowInstanceId: 1 });
WorkflowEventSchema.index({ tenantId: 1, reportedAt: -1 });

export default mongoose.model('WorkflowEvent', WorkflowEventSchema);
