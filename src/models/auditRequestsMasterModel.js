
import mongoose from "mongoose";

const AuditRequestMasterSchema = new mongoose.Schema(
  {
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

// Indexes for dashboard filters
AuditRequestMasterSchema.index({ supplier_id: 1 });
AuditRequestMasterSchema.index({ auditor_id: 1 });
AuditRequestMasterSchema.index({ create_by_buyer_id: 1 });
AuditRequestMasterSchema.index({ site_id: 1 });

export const AuditRequestMaster = mongoose.model(
  "audit-requests-master",
  AuditRequestMasterSchema
);
