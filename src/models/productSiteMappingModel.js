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
  },
  { timestamps: true }
);

ProductSiteMappingSchema.index(
  { user_id: 1, site_id: 1, product_id: 1 },
  { unique: true }
);

export const ProductSiteMappings = mongoose.model(
  "product-site-mappings",
  ProductSiteMappingSchema
);
