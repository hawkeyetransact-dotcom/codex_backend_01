import mongoose from "mongoose";

const SupplierMasterProductSchema = new mongoose.Schema(
  {
    name: { type: String },
    casNumber: { type: String, required: true, unique: true, index: true },
    description: { type: String },
    apiTechnology: { type: String, required: true },
    dosageForm: { type: String },
    image: { type: String },
    plant_id: { type: String, required: true },
  },
  { timestamps: true }
);

export const SupplierMasterProducts = mongoose.model(
  "supplier-master-products",
  SupplierMasterProductSchema
);
