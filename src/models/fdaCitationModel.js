import mongoose from "mongoose";

const fdaCitationSchema = new mongoose.Schema(
  {
    inspectionId: { type: String, index: true },
    feiNumber: { type: String, index: true },
    legalName: String,
    inspectionEndDate: String,
    programArea: String,
    actCfrNumber: String,
    shortDescription: String,
  },
  { timestamps: true }
);

export default mongoose.model("FdaCitation", fdaCitationSchema);
