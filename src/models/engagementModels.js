import mongoose from "mongoose";

const engagementSchema = new mongoose.Schema(
  {
    engagementCode: { type: String, required: true, unique: true, index: true },
    ownerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    buyerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },
    scope: {
      description: { type: String, default: "" },
      siteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "org_sites" }],
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products" }],
      catalogItemIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "org_catalog_items" }],
      qualificationRequired: { type: Boolean, default: false },
    },
    visibilityPolicy: {
      defaultClassification: {
        type: String,
        enum: ["internal", "shared", "audit_only", "public"],
        default: "shared",
      },
      externalAuditorAllowed: { type: Boolean, default: false },
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

engagementSchema.index({ ownerTenantId: 1, status: 1 });
engagementSchema.index({ buyerOrgId: 1, supplierOrgId: 1, status: 1 });

const engagementParticipantSchema = new mongoose.Schema(
  {
    engagementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "engagements",
      required: true,
      index: true,
    },
    participantType: {
      type: String,
      enum: ["TENANT", "ORG", "USER"],
      default: "USER",
      index: true,
    },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null, index: true },
    role: {
      type: String,
      enum: ["BUYER_OWNER", "BUYER_MEMBER", "SUPPLIER_OWNER", "SUPPLIER_MEMBER", "AUDITOR", "VIEWER", "ADMIN"],
      default: "VIEWER",
      index: true,
    },
    permissions: { type: [String], default: [] },
    accessStartsAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["INVITED", "ACTIVE", "REVOKED", "EXPIRED"],
      default: "ACTIVE",
      index: true,
    },
    assignmentScope: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

engagementParticipantSchema.index(
  { engagementId: 1, participantType: 1, tenantId: 1, orgId: 1, userId: 1, role: 1 },
  { unique: true, sparse: true }
);
engagementParticipantSchema.index({ engagementId: 1, status: 1 });
engagementParticipantSchema.index({ userId: 1, status: 1 });

export const Engagement = mongoose.model("engagements", engagementSchema);
export const EngagementParticipant = mongoose.model("engagement_participants", engagementParticipantSchema);
