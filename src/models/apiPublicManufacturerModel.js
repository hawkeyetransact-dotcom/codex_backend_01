import mongoose from "mongoose";

const apiPublicManufacturerSchema = new mongoose.Schema(
  {
    apiMasterId: { type: mongoose.Schema.Types.ObjectId, ref: "api-master", index: true, required: true },
    supplierKey: { type: String, index: true, required: true },
    supplierName: { type: String, required: true },
    supplierCountry: { type: String, default: "" },
    evidence: {
      dmfNumbers: { type: [String], default: [] },
      cepNumbers: { type: [String], default: [] },
      whoPq: { type: [String], default: [] },
    },
    signals: {
      lastInspectionDate: { type: Date, default: null },
      warningLetterCount: { type: Number, default: 0 },
      importAlertActive: { type: Boolean, default: false },
    },
    lastVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

apiPublicManufacturerSchema.index({ apiMasterId: 1, supplierKey: 1 }, { unique: true });

export const ApiPublicManufacturers = mongoose.model("api_public_manufacturers", apiPublicManufacturerSchema);
