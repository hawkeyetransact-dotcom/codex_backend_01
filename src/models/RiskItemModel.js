/**
 * RiskItemModel.js
 *
 * FMEA-style risk register for the Risk Management module.
 * Risk Priority Number (RPN) = Severity × Occurrence × Detectability
 *
 * Phase 1 EQMS — ISO 9001:2015 clause 6.1 / ICH Q9 Risk Management
 */
import mongoose from "mongoose";

const MitigationSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["OPEN", "IN_PROGRESS", "COMPLETED", "OVERDUE"],
      default: "OPEN",
    },
    completedAt: { type: Date, default: null },
    residualRpn: { type: Number, default: null },
  },
  { _id: true }
);

const RiskItemSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // FMEA core fields
    processStep: { type: String, required: true },     // e.g. "Raw Material Receipt"
    failureMode: { type: String, required: true },     // e.g. "Wrong material received"
    failureEffect: { type: String, required: true },   // e.g. "Contaminated batch"
    failureCause: { type: String, default: null },     // e.g. "Supplier label error"

    // RPN scoring (1-10 each)
    severity: { type: Number, min: 1, max: 10, required: true },
    occurrence: { type: Number, min: 1, max: 10, required: true },
    detectability: { type: Number, min: 1, max: 10, required: true },
    rpn: { type: Number, default: 0 },    // auto-computed: S × O × D

    // Risk classification
    riskCategory: {
      type: String,
      enum: ["QUALITY", "SAFETY", "REGULATORY", "OPERATIONAL", "ENVIRONMENTAL", "FINANCIAL", "CUSTOM"],
      default: "QUALITY",
    },
    riskBand: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },

    // Lifecycle
    status: {
      type: String,
      enum: ["OPEN", "MITIGATED", "ACCEPTED", "CLOSED", "TRANSFERRED"],
      default: "OPEN",
      index: true,
    },

    // Context
    sourceType: {
      type: String,
      enum: ["AUDIT_FINDING", "DEVIATION", "COMPLAINT", "MANUAL", "CAPA", "INSPECTION", "REGULATORY", "CUSTOM"],
      default: "MANUAL",
    },
    sourceRefId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Related entities
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", default: null },
    workflowInstanceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Mitigations
    mitigations: { type: [MitigationSchema], default: [] },
    residualSeverity: { type: Number, min: 1, max: 10, default: null },
    residualOccurrence: { type: Number, min: 1, max: 10, default: null },
    residualDetectability: { type: Number, min: 1, max: 10, default: null },
    residualRpn: { type: Number, default: null },

    // Ownership
    riskOwner: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    identifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    identifiedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    nextReviewDate: { type: Date, default: null },

    // Notes
    notes: { type: String, default: null },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Auto-compute RPN
RiskItemSchema.pre("save", function (next) {
  this.rpn = this.severity * this.occurrence * this.detectability;
  if (this.rpn >= 200) this.riskBand = "CRITICAL";
  else if (this.rpn >= 125) this.riskBand = "HIGH";
  else if (this.rpn >= 60) this.riskBand = "MEDIUM";
  else this.riskBand = "LOW";

  if (this.residualSeverity && this.residualOccurrence && this.residualDetectability) {
    this.residualRpn = this.residualSeverity * this.residualOccurrence * this.residualDetectability;
  }
  next();
});

RiskItemSchema.index({ tenantId: 1, status: 1 });
RiskItemSchema.index({ tenantId: 1, riskBand: 1 });
RiskItemSchema.index({ tenantId: 1, riskCategory: 1 });
RiskItemSchema.index({ tenantId: 1, rpn: -1 });

export const RiskItem = mongoose.model("risk-items", RiskItemSchema);
