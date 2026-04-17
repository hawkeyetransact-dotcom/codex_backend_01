import mongoose from "mongoose";

/**
 * DesignControl — Phase 3: Medical device design controls.
 *
 * Per 21 CFR Part 820.30 (Design Controls) and ISO 13485:2016 Section 7.3.
 *
 * Covers the full design lifecycle:
 *   PLANNING → INPUT → OUTPUT → REVIEW → VERIFICATION → VALIDATION → TRANSFER → CHANGES
 */

const DesignPhaseSchema = new mongoose.Schema(
  {
    phaseKey: {
      type: String,
      enum: ["PLANNING", "INPUT", "OUTPUT", "REVIEW", "VERIFICATION", "VALIDATION", "TRANSFER", "CHANGES"],
      required: true,
    },
    status: { type: String, enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"], default: "NOT_STARTED" },
    startedAt: { type: Date },
    completedAt: { type: Date },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    notes: { type: String },
    documents: [
      {
        title: { type: String },
        documentRef: { type: String },
        documentType: { type: String },
        uploadedAt: { type: Date },
      },
    ],
  },
  { _id: true }
);

const DesignControlSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    designNumber: { type: String, unique: true },
    title: { type: String, required: true },
    description: { type: String },

    // Product identification
    productName: { type: String, required: true },
    productCode: { type: String },
    deviceClass: { type: String, enum: ["CLASS_I", "CLASS_II", "CLASS_III", "IVD"], default: "CLASS_II" },
    intendedUse: { type: String },

    // Regulatory
    regulatoryPathway: { type: String, enum: ["510K", "PMA", "DE_NOVO", "CE_MARK", "OTHER"], default: "510K" },
    predicateDevice: { type: String },
    applicableStandards: { type: [String], default: [] },

    // Status
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "DESIGN_FREEZE", "TRANSFERRED", "OBSOLETE", "CANCELLED"],
      default: "DRAFT",
    },
    currentPhase: { type: String, default: "PLANNING" },

    // Design phases
    phases: { type: [DesignPhaseSchema], default: [] },

    // Design inputs (requirements)
    designInputs: [
      {
        requirementId: { type: String },
        description: { type: String },
        source: { type: String, enum: ["USER_NEED", "REGULATORY", "STANDARD", "RISK", "BUSINESS"], default: "USER_NEED" },
        priority: { type: String, enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"], default: "MEDIUM" },
        verified: { type: Boolean, default: false },
        traceableToOutput: { type: Boolean, default: false },
      },
    ],

    // Design outputs
    designOutputs: [
      {
        outputId: { type: String },
        description: { type: String },
        outputType: { type: String, enum: ["SPECIFICATION", "DRAWING", "SOFTWARE", "PROCEDURE", "LABELING"], default: "SPECIFICATION" },
        documentRef: { type: String },
        tracedToInput: { type: String },
      },
    ],

    // Risk management (ISO 14971)
    riskFileRef: { type: String },
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH", "UNACCEPTABLE"], default: "MEDIUM" },
    linkedRiskItems: [{ type: mongoose.Schema.Types.ObjectId }],

    // Design reviews
    designReviews: [
      {
        reviewDate: { type: Date },
        reviewPhase: { type: String },
        attendees: [{ type: String }],
        decision: { type: String, enum: ["PROCEED", "REVISE", "HOLD"], default: "PROCEED" },
        actionItems: [{ type: String }],
        minutesRef: { type: String },
      },
    ],

    // Verification & Validation
    verificationProtocolRef: { type: String },
    verificationReportRef: { type: String },
    validationProtocolRef: { type: String },
    validationReportRef: { type: String },

    // Design transfer
    transferDate: { type: Date },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    manufacturingSiteId: { type: mongoose.Schema.Types.ObjectId },

    // Linked records
    linkedChangeControlIds: [{ type: mongoose.Schema.Types.ObjectId }],
    linkedCapaIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // DHF (Design History File) reference
    dhfRef: { type: String },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    customFields: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Auto-number: DC-YYYY-NNNN
DesignControlSchema.pre("save", async function (next) {
  if (!this.designNumber) {
    const year = new Date().getFullYear();
    const prefix = `DC-${year}-`;
    const last = await DesignControl.findOne({ designNumber: { $regex: `^${prefix}` } })
      .sort({ designNumber: -1 }).select("designNumber").lean();
    const seq = last ? parseInt(last.designNumber.replace(prefix, ""), 10) + 1 : 1;
    this.designNumber = `${prefix}${String(seq).padStart(4, "0")}`;
  }
  // Initialize phases if empty
  if (!this.phases || this.phases.length === 0) {
    this.phases = ["PLANNING", "INPUT", "OUTPUT", "REVIEW", "VERIFICATION", "VALIDATION", "TRANSFER", "CHANGES"]
      .map((key) => ({ phaseKey: key, status: key === "PLANNING" ? "IN_PROGRESS" : "NOT_STARTED" }));
  }
  next();
});

export const DesignControl = mongoose.model("DesignControl", DesignControlSchema, "design_controls");
