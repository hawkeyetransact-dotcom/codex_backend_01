import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String },
    url: { type: String },
    size: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { _id: false }
);

const auditTrailSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    message: { type: String, default: "" },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    actorRole: { type: String },
    createdAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const lineItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const auditRfqQuoteSchema = new mongoose.Schema(
  {
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-rfqs", required: true, index: true },
    auditorOrgId: { type: String, required: true, index: true },
    auditorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lineItems: { type: [lineItemSchema], default: [] },
    currency: { type: String, default: "USD" },
    totals: {
      subtotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    proposedSchedule: {
      auditDays: { type: Number },
      reportDays: { type: Number },
      earliestStartDate: { type: Date },
      latestStartDate: { type: Date },
    },
    assumptionsText: { type: String, default: "" },
    exclusionsText: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "REVISED", "WITHDRAWN", "ACCEPTED", "REJECTED"],
      default: "DRAFT",
      index: true,
    },
    submittedAt: { type: Date },
    revisedAt: { type: Date },
    auditTrail: { type: [auditTrailSchema], default: [] },
  },
  { timestamps: true }
);

auditRfqQuoteSchema.index({ rfqId: 1, auditorUserId: 1 }, { unique: true });

export const AuditRFQQuote = mongoose.model("audit-rfq-quotes", auditRfqQuoteSchema);
