import mongoose from "mongoose";

const marketplaceListingSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    ownerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    listingType: {
      type: String,
      enum: ["ORG_PROFILE", "SERVICE", "PRODUCT", "SITE_CAPABILITY"],
      default: "ORG_PROFILE",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["PUBLIC", "RESTRICTED", "PRIVATE"],
      default: "PUBLIC",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    headline: { type: String, default: "" },
    summary: { type: String, default: "" },
    capabilityTags: { type: [String], default: [] },
    countriesServed: { type: [String], default: [] },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

marketplaceListingSchema.index({ orgId: 1, status: 1 });
marketplaceListingSchema.index({ visibility: 1, status: 1 });
marketplaceListingSchema.index({ capabilityTags: 1, status: 1 });

const orgCatalogItemSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    siteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "org_sites" }],
    itemType: {
      type: String,
      enum: ["PRODUCT", "SERVICE", "CAPABILITY"],
      default: "PRODUCT",
      index: true,
    },
    catalogType: {
      type: String,
      enum: ["API", "EXCIPIENT", "PACKAGING", "ANALYTICAL_SERVICE", "LOGISTICS", "CONSULTING", "OTHER"],
      default: "OTHER",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, index: true },
    apiMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "api-master", default: null, index: true },
    casNumber: { type: String, default: "" },
    gxpFlags: { type: [String], default: [] },
    visibility: {
      type: String,
      enum: ["PUBLIC", "RESTRICTED", "PRIVATE"],
      default: "RESTRICTED",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

orgCatalogItemSchema.index({ orgId: 1, catalogType: 1, status: 1 });
orgCatalogItemSchema.index({ apiMasterId: 1, orgId: 1 });
orgCatalogItemSchema.index({ orgId: 1, apiMasterId: 1, catalogType: 1 }, { unique: true, sparse: true });

const trustBadgeSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true, index: true },
    badgeType: { type: String, required: true, index: true },
    sourceType: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
    score: { type: Number, default: null },
    summary: { type: String, default: "" },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    isPublic: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

trustBadgeSchema.index({ orgId: 1, badgeType: 1, status: 1 });
trustBadgeSchema.index({ isPublic: 1, status: 1 });

export const MarketplaceListing = mongoose.model("marketplace_listings", marketplaceListingSchema);
export const OrgCatalogItem = mongoose.model("org_catalog_items", orgCatalogItemSchema);
export const TrustBadge = mongoose.model("trust_badges", trustBadgeSchema);
