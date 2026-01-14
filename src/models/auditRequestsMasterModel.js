
import mongoose from "mongoose";

const AuditRequestMasterSchema = new mongoose.Schema(
  {
    tenantOrgId: {
      type: String,
      index: true,
      default: null,
    },
    // Global Hawkeye-facing request number (HAWK0000000001)
    internalRequestId: { type: String, index: true, unique: true, sparse: true },
    internalSequence: { type: Number, index: true, sparse: true },
    // Tenant-facing sequential number (per tenant)
    supplierRequestId: { type: String, index: true, sparse: true },
    supplierSequence: { type: Number, index: true, sparse: true },
    // Canonical Hawkeye global request ID (feature-flagged)
    hawkeyeRequestId: { type: String, index: true, unique: true, sparse: true },
    supplier_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    auditor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    create_by_buyer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    supplier_product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-master-products",
      required: true,
    },
    complianceDate: {
      type: Date,
      required: true,
    },
    site_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-sites",
      required: true,
    },
    high_status: {
      type: String,
      required: false
    },
    complianceStatus: {
      type: String,
      enum: ["complient", "non-complient"], // adjust as needed
      default: "non-complient",
    },
    nextAuditOn: {
      type: String,
      enum: ["supplier", "buyer", "auditor"], // adjust as needed
      default: "auditor",
    },
    trackStatus: {
      type: String,
      default: "Request Received"
    },
    requestReviewInProgress: {
      type: String,
      default: "Supplier"
    },
    requestReviewComplete: {
      type: String,
      default: "Supplier"
    },
    questionnaireSent: {
      type: String,
      default: "Supplier"
    },
    questionnaireReceived: {
      type: String,
      default: "Supplier"
    },
    responseInProgress: {
      type: String,
      default: "Supplier"
    },
    responseComplete: {
      type: String,
      default: "Supplier"
    },
    responseReceived: {
      type: String,
      default: "Supplier"
    },
    responseReviewInProgress: {
      type: String,
      default: "Supplier"
    },
    responseReviewComplete: {
      type: String,
      default: "Supplier"
    },
    requestReviewInProgressEta: {
      type: String,
      default: "Supplier"
    },
    requestReviewCompleteEta: {
      type: String,
      default: "Supplier"
    },
    questionnaireSentEta: {
      type: String,
      default: "Supplier"
    },
    questionnaireReceivedEta: {
      type: String,
      default: "Supplier"
    },
    responseInProgressEta: {
      type: String,
      default: "Supplier"
    },
    responseCompleteEta: {
      type: String,
      default: "Supplier"
    },
    responseReceivedEta: {
      type: String,
      default: "Supplier"
    },
    responseReviewInProgressEta: {
      type: String,
      default: "Supplier"
    },
    responseReviewCompleteEta: {
      type: String,
      default: "Supplier"
    },
    isTempleteUsed: {
      type: Boolean,
      default: false,
    },
    selectedTemplateId: {
      type: Number,
      default: null,
    },
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-rfqs", index: true },
    awardedQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-rfq-quotes", index: true },
    assignedAuditors: [
      {
        auditorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "auditor-profiles", index: true },
        role: { type: String, enum: ["LEAD", "COAUDITOR", "REVIEWER"], default: "LEAD" },
        permissions: { type: [String], default: [] },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
      },
    ],
    questionnaireStatus: {
      type: String,
      enum: ["request_received", "in_progress", "sent_to_supplier"],
      default: "request_received",
    },
    flagStatus: {
      type: String,
      default: "auditor"
    },
  },
  { timestamps: true }
);

AuditRequestMasterSchema.index({ tenantOrgId: 1, high_status: 1 });
AuditRequestMasterSchema.index({ tenantOrgId: 1, trackStatus: 1 });
AuditRequestMasterSchema.index({ tenantOrgId: 1, updatedAt: -1 });
AuditRequestMasterSchema.index({ create_by_buyer_id: 1 });
AuditRequestMasterSchema.index({ auditor_id: 1 });
AuditRequestMasterSchema.index({ supplier_id: 1 });
AuditRequestMasterSchema.index({ supplier_product_id: 1 });
AuditRequestMasterSchema.index({ site_id: 1 });
AuditRequestMasterSchema.index({ selectedTemplateId: 1 });
AuditRequestMasterSchema.index({ supplier_id: 1, supplierSequence: 1 }, { unique: true, sparse: true });

export const AuditRequestMaster = mongoose.model(
  "audit-requests-master",
  AuditRequestMasterSchema
);
