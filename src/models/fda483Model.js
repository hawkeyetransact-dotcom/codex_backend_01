import mongoose from "mongoose";

const fda483Schema = new mongoose.Schema(
  {
    recordId: { type: String, unique: true, index: true },
    recordDate: String,
    feiNumber: { type: String, index: true },
    legalName: String,
    recordType: String,
    publishDate: String,
  },
  { timestamps: true }
);

export default mongoose.model("Fda483", fda483Schema);
