import mongoose from "mongoose";

const InvestigationSchema = new mongoose.Schema(
  {
    investigatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    investigatorName: { type: String },
    method: {
      type: String,
      enum: ["FIVE_WHY", "FISHBONE", "FAULT_TREE", "PARETO", "BRAINSTORM", "OTHER"],
    },
    summary: { type: String },
    rootCause: { type: String },
    rootCauseCategory: {
      type: String,
      enum: [
        "HUMAN_ERROR",
        "EQUIPMENT_FAILURE",
        "MATERIAL_DEFECT",
        "PROCESS_GAP",
        "ENVIRONMENTAL",
        "DOCUMENTATION",
        "TRAINING",
        "SUPPLIER",
        "DESIGN",
        "OTHER",
      ],
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    notes: { type: String },
  },
  { _id: false }
);

const ImpactAssessmentSchema = new mongoose.Schema(
  {
    productQualityImpact: { type: String },
    patientSafetyImpact: { type: String },
    batchDisposition: {
      type: String,
      enum: ["RELEASE", "REJECT", "REWORK", "REPROCESS", "QUARANTINE", "PENDING"],
    },
    affectedBatches: [{ type: String }],
    regulatoryImpact: { type: String },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assessedAt: { type: Date },
  },
  { _id: false }
);

const DeviationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    deviationNumber: { type: String, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },

    deviationType: {
      type: String,
      enum: ["PLANNED", "UNPLANNED"],
      default: "UNPLANNED",
    },
    category: {
      type: String,
      enum: [
        "PROCESS",
        "EQUIPMENT",
        "MATERIAL",
        "DOCUMENTATION",
        "ENVIRONMENTAL",
        "LABORATORY",
        "PACKAGING",
        "STORAGE",
        "PERSONNEL",
        "OTHER",
      ],
    },
    classification: {
      type: String,
      enum: ["CRITICAL", "MAJOR", "MINOR"],
      default: "MINOR",
    },

    status: {
      type: String,
      enum: [
        "REPORTED",
        "UNDER_ASSESSMENT",
        "UNDER_INVESTIGATION",
        "PENDING_DISPOSITION",
        "PENDING_CAPA_DECISION",
        "CAPA_REQUIRED",
        "PENDING_CLOSURE",
        "CLOSED",
        "CANCELLED",
      ],
      default: "REPORTED",
    },

    // Who / When / Where
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reportedByName: { type: String },
    dateOfOccurrence: { type: Date },
    dateOfDetection: { type: Date },
    department: { type: String },
    area: { type: String },
    processStep: { type: String },

    // Product / Batch
    productId: { type: mongoose.Schema.Types.ObjectId },
    productName: { type: String },
    batchNumbers: [{ type: String }],
    siteId: { type: mongoose.Schema.Types.ObjectId },

    // Immediate actions
    immediateActions: { type: String },
    immediateActionsTakenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    immediateActionsTakenAt: { type: Date },

    // Investigation
    investigation: { type: InvestigationSchema },

    // Impact assessment
    impactAssessment: { type: ImpactAssessmentSchema },

    // Disposition
    dispositionDecision: {
      type: String,
      enum: ["RELEASE", "REJECT", "REWORK", "REPROCESS", "QUARANTINE", "PENDING", "NOT_APPLICABLE"],
    },
    dispositionJustification: { type: String },
    dispositionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    dispositionAt: { type: Date },

    // CAPA linkage
    capaRequired: { type: Boolean, default: false },
    linkedCAPAIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // Closure
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedAt: { type: Date },
    closureNotes: { type: String },

    // Relationships
    linkedDeviationIds: [{ type: mongoose.Schema.Types.ObjectId }],
    linkedAuditIds: [{ type: mongoose.Schema.Types.ObjectId }],
    linkedComplaintIds: [{ type: mongoose.Schema.Types.ObjectId }],
    linkedChangeControlIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // Ownership
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    customFields: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Auto-generate deviation number: DEV-YYYY-NNNN
DeviationSchema.pre("save", async function (next) {
  if (!this.deviationNumber) {
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}-`;
    const last = await Deviation.findOne({ deviationNumber: { $regex: `^${prefix}` } })
      .sort({ deviationNumber: -1 })
      .select("deviationNumber")
      .lean();
    const seq = last ? parseInt(last.deviationNumber.replace(prefix, ""), 10) + 1 : 1;
    this.deviationNumber = `${prefix}${String(seq).padStart(4, "0")}`;
  }
  next();
});

export const Deviation = mongoose.model("Deviation", DeviationSchema, "deviations");
