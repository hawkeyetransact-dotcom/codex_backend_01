import mongoose from "mongoose";

const RecallSchema = new mongoose.Schema(
  {
    class: { type: String, enum: ["I", "II", "III"], required: true },
    date: { type: Date, required: true },
    product: { type: String },
    note: { type: String },
  },
  { _id: false }
);

const SourceSchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ["manual", "import"], required: true },
    reference: { type: String },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupplierPublicSignalSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
      unique: true,
    },
    fda483CountRecent24m: { type: Number, default: 0 },
    warningLetterRecent24m: { type: Boolean, default: false },
    importAlertActive: { type: Boolean, default: false },
    inspectionsOpenCount: { type: Number, default: 0 },
    recalls: { type: [RecallSchema], default: [] },
    sources: { type: [SourceSchema], default: [] },
    regionFlags: { type: [String], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

SupplierPublicSignalSchema.index({ supplierId: 1 }, { unique: true });

export const SupplierPublicSignal = mongoose.model(
  "supplier-public-signals",
  SupplierPublicSignalSchema
);
