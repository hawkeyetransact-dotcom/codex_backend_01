import mongoose from "mongoose";

/**
 * BatchRecordReview — Phase 3: Batch record review and product release.
 *
 * Per 21 CFR 211.192 (production record review) and EU GMP Annex 16
 * (Qualified Person and batch release).
 *
 * Lifecycle: MANUFACTURING → UNDER_REVIEW → PENDING_LAB → PENDING_QA →
 *            PENDING_DEVIATION_CLOSURE → DISPOSITION → RELEASED / REJECTED
 */

const InProcessTestSchema = new mongoose.Schema(
  {
    testName: { type: String, required: true },
    specification: { type: String },
    result: { type: String },
    resultValue: { type: Number },
    unit: { type: String },
    passed: { type: Boolean, default: null },
    testedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    testedAt: { type: Date },
  },
  { _id: true }
);

const YieldRecordSchema = new mongoose.Schema(
  {
    stage: { type: String },
    theoreticalQuantity: { type: Number },
    actualQuantity: { type: Number },
    unit: { type: String, default: "kg" },
    yieldPercent: { type: Number },
    withinSpec: { type: Boolean, default: null },
  },
  { _id: false }
);

const BatchRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    batchNumber: { type: String, required: true, index: true },
    batchRecordNumber: { type: String, unique: true },

    // Product info
    productName: { type: String, required: true },
    productCode: { type: String },
    batchSize: { type: Number },
    batchSizeUnit: { type: String, default: "kg" },

    // Dates
    manufacturingDate: { type: Date },
    expiryDate: { type: Date },
    releaseDate: { type: Date },

    // Status
    status: {
      type: String,
      enum: [
        "MANUFACTURING",
        "UNDER_REVIEW",
        "PENDING_LAB_RESULTS",
        "PENDING_QA_REVIEW",
        "PENDING_DEVIATION_CLOSURE",
        "PENDING_DISPOSITION",
        "RELEASED",
        "REJECTED",
        "QUARANTINED",
      ],
      default: "MANUFACTURING",
    },

    // BOM (Bill of Materials) actual vs theoretical
    billOfMaterials: [
      {
        materialName: { type: String },
        materialCode: { type: String },
        theoreticalQuantity: { type: Number },
        actualQuantity: { type: Number },
        unit: { type: String },
        lotNumber: { type: String },
        supplierId: { type: mongoose.Schema.Types.ObjectId },
      },
    ],

    // In-process tests
    inProcessTests: { type: [InProcessTestSchema], default: [] },

    // Yield
    yieldRecords: { type: [YieldRecordSchema], default: [] },
    finalYieldPercent: { type: Number },

    // Equipment used
    equipmentUsed: [
      {
        equipmentId: { type: mongoose.Schema.Types.ObjectId },
        equipmentName: { type: String },
        equipmentNumber: { type: String },
      },
    ],

    // Environmental monitoring
    environmentalData: { type: mongoose.Schema.Types.Mixed, default: null },

    // Linked deviations
    linkedDeviationIds: [{ type: mongoose.Schema.Types.ObjectId }],
    deviationsResolved: { type: Boolean, default: true },

    // Lab results
    labResultsSummary: { type: String },
    labResultsComplete: { type: Boolean, default: false },
    certificateOfAnalysis: { type: String }, // S3 ref

    // QA Review
    qaReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    qaReviewedAt: { type: Date },
    qaReviewNotes: { type: String },

    // Disposition
    disposition: {
      type: String,
      enum: ["RELEASED", "REJECTED", "REWORK", "REPROCESS", "QUARANTINED"],
    },
    dispositionBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    dispositionAt: { type: Date },
    dispositionJustification: { type: String },

    // Stability
    stabilityAssignment: { type: String },
    retainedSampleRef: { type: String },

    // Ownership
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },

    customFields: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Auto-generate batch record number: BR-YYYY-NNNN
BatchRecordSchema.pre("save", async function (next) {
  if (!this.batchRecordNumber) {
    const year = new Date().getFullYear();
    const prefix = `BR-${year}-`;
    const last = await BatchRecord.findOne({ batchRecordNumber: { $regex: `^${prefix}` } })
      .sort({ batchRecordNumber: -1 })
      .select("batchRecordNumber")
      .lean();
    const seq = last ? parseInt(last.batchRecordNumber.replace(prefix, ""), 10) + 1 : 1;
    this.batchRecordNumber = `${prefix}${String(seq).padStart(4, "0")}`;
  }
  next();
});

export const BatchRecord = mongoose.model("BatchRecord", BatchRecordSchema, "batch_records");
