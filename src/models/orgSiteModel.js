import mongoose from "mongoose";

const orgSiteSchema = new mongoose.Schema(
  {
    siteKey: { type: String, required: true, unique: true, index: true },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organizations",
      required: true,
      index: true,
    },
    siteName: { type: String, required: true, trim: true },
    normalizedSiteName: { type: String, required: true, index: true },
    siteType: {
      type: String,
      enum: ["HEADQUARTERS", "MANUFACTURING", "WAREHOUSE", "LAB", "OFFICE", "DISTRIBUTION", "OTHER"],
      default: "OTHER",
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "PENDING_REVIEW", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },
    address: {
      address1: { type: String, default: "" },
      address2: { type: String, default: "" },
      address3: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      country: { type: String, default: "", index: true },
    },
    regulatoryIds: {
      duns: { type: String, default: "" },
      fei: { type: String, default: "" },
      euGmpId: { type: String, default: "" },
      fssai: { type: String, default: "" },
      localLicense: { type: String, default: "" },
    },
    gxpScopes: { type: [String], default: [] },
    contactName: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    sourceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    legacyRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  },
  { timestamps: true }
);

orgSiteSchema.index({ orgId: 1, status: 1 });
orgSiteSchema.index({ orgId: 1, normalizedSiteName: 1 });
orgSiteSchema.index({ "address.country": 1, status: 1 });
orgSiteSchema.index({ "regulatoryIds.fei": 1 });
orgSiteSchema.index({ "regulatoryIds.duns": 1 });

export const OrgSite = mongoose.model("org_sites", orgSiteSchema);
