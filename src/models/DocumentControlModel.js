/**
 * DocumentControlModel.js
 *
 * Full Document Control Module (DCM) — covers the complete lifecycle of
 * controlled documents: SOPs, policies, work instructions, forms, specifications.
 *
 * Lifecycle: DRAFT → UNDER_REVIEW → APPROVED → EFFECTIVE → SUPERSEDED | WITHDRAWN
 * Versioning: major.minor (e.g. 1.0, 1.1, 2.0)
 *
 * Phase 1 EQMS — ISO 9001:2015 clause 7.5 (Documented Information)
 */
import mongoose from "mongoose";

const ApprovalStepSchema = new mongoose.Schema(
  {
    stepOrder: { type: Number, required: true },
    role: { type: String, required: true },        // e.g. "QA_MANAGER", "SITE_DIRECTOR"
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    decision: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "DELEGATED"],
      default: "PENDING",
    },
    decisionAt: { type: Date, default: null },
    comments: { type: String, default: null },
  },
  { _id: false }
);

const DocumentControlSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Document identity
    docNumber: { type: String, index: true, sparse: true },   // DOC-YYYY-NNNN
    docSequence: { type: Number, sparse: true },
    title: { type: String, required: true, trim: true },
    documentType: {
      type: String,
      enum: ["SOP", "POLICY", "WORK_INSTRUCTION", "FORM", "SPECIFICATION", "PROTOCOL", "REPORT_TEMPLATE", "GUIDELINE", "REGULATORY_SUBMISSION", "CUSTOM"],
      required: true,
    },

    // Version control
    versionMajor: { type: Number, default: 1 },
    versionMinor: { type: Number, default: 0 },
    versionLabel: { type: String, default: "1.0" },  // computed on save

    // Superseding chain
    supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: "document-controls", default: null },
    supersededById: { type: mongoose.Schema.Types.ObjectId, ref: "document-controls", default: null },

    // Lifecycle
    status: {
      type: String,
      enum: ["DRAFT", "UNDER_REVIEW", "APPROVED", "EFFECTIVE", "SUPERSEDED", "WITHDRAWN"],
      default: "DRAFT",
      index: true,
    },

    // Dates
    effectiveDate: { type: Date, default: null },
    reviewDueDate: { type: Date, default: null },
    retirementDate: { type: Date, default: null },
    reviewPeriodMonths: { type: Number, default: 24 },

    // Content & storage
    description: { type: String, default: null },
    scope: { type: String, default: null },
    keywords: { type: [String], default: [] },
    storageRef: { type: String, default: null },     // DigiLocker / S3 key
    digilockerId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker-files", default: null },

    // Ownership
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    departmentOwner: { type: String, default: null },
    relatedSiteIds: { type: [mongoose.Schema.Types.ObjectId], ref: "supplier-sites", default: [] },

    // Compliance linkage
    complianceStandards: { type: [String], default: [] },     // ["ICH_Q7", "ISO_9001_7.5"]
    relatedCapaIds: { type: [mongoose.Schema.Types.ObjectId], ref: "capa-v2", default: [] },

    // Approval workflow
    approvalSteps: { type: [ApprovalStepSchema], default: [] },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },

    // Withdrawal
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    withdrawalReason: { type: String, default: null },

    // Training trigger
    requiresTrainingOnUpdate: { type: Boolean, default: false },
    trainingDueDays: { type: Number, default: 30 },
  },
  { timestamps: true }
);

// Auto-generate docNumber + versionLabel
DocumentControlSchema.pre("save", async function (next) {
  if (this.isNew && !this.docNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("document-controls");
    const count = await Model.countDocuments({ tenantId: this.tenantId }) + 1;
    this.docSequence = count;
    this.docNumber = `DOC-${year}-${String(count).padStart(4, "0")}`;
  }
  this.versionLabel = `${this.versionMajor}.${this.versionMinor}`;
  next();
});

DocumentControlSchema.index({ tenantId: 1, status: 1 });
DocumentControlSchema.index({ tenantId: 1, documentType: 1 });
DocumentControlSchema.index({ tenantId: 1, ownerId: 1 });
DocumentControlSchema.index({ tenantId: 1, effectiveDate: 1 });
DocumentControlSchema.index({ tenantId: 1, reviewDueDate: 1 });

export const DocumentControl = mongoose.model("document-controls", DocumentControlSchema);
