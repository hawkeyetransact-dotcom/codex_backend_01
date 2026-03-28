/**
 * TransactionReviewModel.js — P2P Transaction Due-Diligence Workflow
 * Phase 2 Workflow OS — multi-party transaction review with approval chain.
 */
import mongoose from "mongoose";

const ApprovalStepSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  approverName: { type: String, default: null },
  decision: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "ABSTAINED"], default: "PENDING" },
  decidedAt: { type: Date, default: null },
  comments: { type: String, default: null },
}, { _id: true });

const TransactionReviewSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },

  // Identity
  transactionNumber: { type: String, index: true, sparse: true },
  transactionSequence: { type: Number, sparse: true },
  title: { type: String, required: true },

  // Classification
  transactionType: {
    type: String,
    enum: ["PROCUREMENT", "SALE", "SERVICE", "TRANSFER", "INVESTMENT", "OTHER"],
    default: "PROCUREMENT",
    index: true,
  },
  riskLevel: {
    type: String,
    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    default: "MEDIUM",
    index: true,
  },

  // Parties
  initiatorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  initiatorName: { type: String, default: null },
  counterpartyId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  counterpartyName: { type: String, default: null },

  // Financials
  amount: { type: Number, default: null },
  currency: { type: String, enum: ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "OTHER"], default: "USD" },

  // Workflow
  status: {
    type: String,
    enum: ["PENDING_REVIEW", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "CLOSED"],
    default: "PENDING_REVIEW",
    index: true,
  },
  requiresApproval: { type: Boolean, default: true },
  approvalSteps: { type: [ApprovalStepSchema], default: [] },

  // Compliance
  regulatoryFlags: { type: [String], default: [] },
  dueDiligenceScore: { type: Number, default: null }, // 0-100

  notes: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

// Auto-generate transactionNumber
TransactionReviewSchema.pre("save", async function (next) {
  if (this.isNew && !this.transactionNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("transaction-reviews");
    const count = await Model.countDocuments({ tenantId: this.tenantId }) + 1;
    this.transactionSequence = count;
    this.transactionNumber = `TXN-${year}-${String(count).padStart(4, "0")}`;
  }
  next();
});

TransactionReviewSchema.index({ tenantId: 1, status: 1 });
TransactionReviewSchema.index({ tenantId: 1, transactionType: 1 });
TransactionReviewSchema.index({ tenantId: 1, riskLevel: 1 });

export const TransactionReview = mongoose.model("transaction-reviews", TransactionReviewSchema);
