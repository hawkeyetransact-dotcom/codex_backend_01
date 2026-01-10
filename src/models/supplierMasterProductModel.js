import mongoose from "mongoose";

const SupplierMasterProductSchema = new mongoose.Schema(
  {
    name: { type: String },
    casNumber: { type: String, required: true, index: true },
    description: { type: String },
    apiTechnology: { type: String, required: true },
    dosageForm: { type: String },
    image: { type: String },
    plant_id: { type: String, required: true },
    apiMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "api-master", index: true },
    origin: {
      type: String,
      enum: ["supplier_created", "api_master_selected"],
      default: "supplier_created",
    },
    normalizedName: { type: String, index: true },
    matchConfidence: { type: Number, min: 0, max: 1, default: 0 },
    needsReview: { type: Boolean, default: false },
    productType: { type: String, default: "API" },
  },
  { timestamps: true }
);

SupplierMasterProductSchema.index({ apiMasterId: 1 });
SupplierMasterProductSchema.index({ normalizedName: 1, plant_id: 1 });

export const SupplierMasterProducts = mongoose.model(
  "supplier-master-products",
  SupplierMasterProductSchema
);
