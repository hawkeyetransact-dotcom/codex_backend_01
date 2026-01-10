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

const invitedAuditorSchema = new mongoose.Schema(
  {
    auditorOrgId: { type: String, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    invitedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["INVITED", "DECLINED", "ACCEPTED_VIEW"],
      default: "INVITED",
    },
  },
  { _id: false }
);

const auditRfqSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    rfqNumber: { type: String, required: true },
    title: { type: String, default: "" },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites" },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products" }],
    auditType: { type: String, default: "" },
    auditMode: { type: String, default: "" },
    standards: [{ type: String }],
    scopeText: { type: String, default: "" },
    deliverables: [{ type: String }],
    preferredWindow: {
      startDate: { type: Date },
      endDate: { type: Date },
    },
    location: {
      country: { type: String },
      state: { type: String },
      city: { type: String },
      addressText: { type: String },
    },
    confidentiality: {
      ndaRequired: { type: Boolean, default: false },
      level: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "STRICT"], default: "LOW" },
    },
    invitedAuditors: { type: [invitedAuditorSchema], default: [] },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "PUBLISHED",
        "IN_QA",
        "QUOTES_RECEIVED",
        "SHORTLISTED",
        "AWARDED",
        "CONVERTED",
        "CANCELLED",
        "EXPIRED",
      ],
      default: "DRAFT",
      index: true,
    },
    closingAt: { type: Date },
    attachments: { type: [attachmentSchema], default: [] },
    auditTrail: { type: [auditTrailSchema], default: [] },
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

auditRfqSchema.index({ tenantId: 1, rfqNumber: 1 }, { unique: true });
auditRfqSchema.index({ tenantId: 1, status: 1, closingAt: 1 });

export const AuditRFQ = mongoose.model("audit-rfqs", auditRfqSchema);
