import mongoose from "mongoose";

const fdaInspectionSchema = new mongoose.Schema(
  {
    inspectionId: { type: String, index: true },
    feiNumber: { type: String, index: true },
    legalName: String,
    city: String,
    state: String,
    zip: String,
    country: String,
    fiscalYear: String,
    postedCitations: String,
    inspectionEndDate: String,
    classification: String,
    projectArea: String,
    productType: String,
    additionalInfo: String,
  },
  { timestamps: true }
);

export default mongoose.model("FdaInspection", fdaInspectionSchema);
