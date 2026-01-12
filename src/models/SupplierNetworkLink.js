import mongoose from "mongoose";

const SupplierNetworkLinkSchema = new mongoose.Schema(
  {
    fromSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    toSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    linkType: {
      type: String,
      enum: ["PARENT", "SUBSIDIARY", "CMO_SHARED", "RAW_MATERIAL_SHARED", "SITE_GROUP", "OTHER"],
      required: true,
    },
    strength: { type: Number, min: 0, max: 1, default: 0.5 },
    evidenceRef: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

SupplierNetworkLinkSchema.index({ fromSupplierId: 1, toSupplierId: 1, linkType: 1 }, { unique: true });

export const SupplierNetworkLink = mongoose.model(
  "supplier-network-links",
  SupplierNetworkLinkSchema
);
