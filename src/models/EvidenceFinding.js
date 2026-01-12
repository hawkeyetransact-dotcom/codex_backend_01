import mongoose from "mongoose";

const EvidenceFindingSchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true, required: true },
    documentId: { type: mongoose.Schema.Types.Mixed },
    findingType: {
      type: String,
      enum: ["DUPLICATE_HASH", "METADATA_ANOMALY", "CONTRADICTION", "BOILERPLATE_SUSPECT", "MANUAL_FLAG"],
      required: true,
    },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], required: true },
    note: { type: String },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: false }
);

EvidenceFindingSchema.index({ supplierId: 1, createdAt: -1 });

export const EvidenceFinding = mongoose.model(
  "evidence-findings",
  EvidenceFindingSchema
);
