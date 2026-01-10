import mongoose from "mongoose";

const ProductSiteMappingSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    site_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-sites",
      required: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "supplier-master-products",
      required: true,
    },
    apiMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "api-master",
      index: true,
    },
    manufacturingRole: {
      type: String,
      enum: ["API", "Intermediate", "Packaging", "Micronization", "Other"],
      default: "API",
    },
    visibility: { type: String, enum: ["private", "public"], default: "private" },
    verificationStatus: {
      type: String,
      enum: ["unverified", "claimed", "hawkeye_verified"],
      default: "unverified",
    },
    regulatoryRefs: {
      dmf: { type: [String], default: [] },
      cep: { type: [String], default: [] },
      whoPq: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

ProductSiteMappingSchema.index(
  { user_id: 1, site_id: 1, product_id: 1 },
  { unique: true }
);
ProductSiteMappingSchema.index(
  { user_id: 1, site_id: 1, apiMasterId: 1 },
  { unique: true, sparse: true }
);

export const ProductSiteMappings = mongoose.model(
  "product-site-mappings",
  ProductSiteMappingSchema
);
