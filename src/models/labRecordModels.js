// models/User.js
import mongoose from "mongoose";

const labRecordSchema = new mongoose.Schema(
    {
        supplier_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        inspectionId: { type: String, required: false },
        feinumber: { type: String, required: false },
        legal_name: { type: String, required: false },
        inspection_end_date: { type: String, required: false },
        program_area: { type: String, required: false },
        cfr_number: { type: String, required: false },
        short_description: { type: String, required: false },
        long_description: { type: String, required: false },
        type: { type: String, required: false },
        FDA_observation_category: { type: String, required: false },
        processingStatus: {
            type: String,
            enum: ['processing', 'completed', 'failed'],
            default: 'processing'
          }
    },
    { timestamps: true }
);

export const LabRecords = mongoose.model("laboratory-records", labRecordSchema);
