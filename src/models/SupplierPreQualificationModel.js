/**
 * SupplierPreQualificationModel.js
 *
 * Pre-qualification stage executed before a full GMP audit is initiated.
 * Captures desk review, document checks, and initial risk screening.
 * Outcome gate: only APPROVED pre-quals may proceed to full audit.
 *
 * Phase 0 GxP gap fix — step #001-#004 of 24-step pharma audit workflow.
 */
import mongoose from "mongoose";

const ChecklistItemSchema = new mongoose.Schema(
  {
    criterion: { type: String, required: true },
    result: {
      type: String,
      enum: ["PASS", "FAIL", "NOT_APPLICABLE", "PENDING"],
      default: "PENDING",
    },
    notes: { type: String, default: null },
    evidenceRef: { type: String, default: null },
  },
  { _id: false }
);

const SupplierPreQualificationSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },

    // Linked entities
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites", default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products", default: null },
    qualificationCaseId: { type: mongoose.Schema.Types.ObjectId, ref: "qualification_cases", default: null, index: true },

    // Identity
    pqNumber: { type: String, index: true, sparse: true }, // PQ-YYYY-NNNN — auto-generated
    pqSequence: { type: Number, sparse: true },

    // Lifecycle
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CONDITIONALLY_APPROVED", "REJECTED", "EXPIRED"],
      default: "DRAFT",
      index: true,
    },

    // Risk screening
    initialRiskBand: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },

    // Scope
    scope: { type: String, default: null },
    productCategories: { type: [String], default: [] },
    regulatoryStandards: { type: [String], default: [] },

    // Checklist (desk review criteria)
    checklist: { type: [ChecklistItemSchema], default: [] },

    // Questionnaire response ref
    questionnaireResponseId: { type: mongoose.Schema.Types.ObjectId, ref: "pre-audit-questionnaires", default: null },

    // Decision
    decision: {
      type: String,
      enum: ["PENDING", "APPROVED", "CONDITIONALLY_APPROVED", "REJECTED"],
      default: "PENDING",
    },
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    decisionAt: { type: Date, default: null },
    decisionNotes: { type: String, default: null },
    conditions: { type: [String], default: [] },   // conditions for conditional approval
    validUntil: { type: Date, default: null },

    // Escalation to full audit
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", default: null },
    requiresFullAudit: { type: Boolean, default: false },

    // Metadata
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Auto-generate pqNumber before save
SupplierPreQualificationSchema.pre("save", async function (next) {
  if (this.isNew && !this.pqNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("supplier-prequalifications");
    const count = await Model.countDocuments({ tenantId: this.tenantId }) + 1;
    this.pqSequence = count;
    this.pqNumber = `PQ-${year}-${String(count).padStart(4, "0")}`;
  }
  next();
});

SupplierPreQualificationSchema.index({ tenantId: 1, status: 1 });
SupplierPreQualificationSchema.index({ tenantId: 1, supplierId: 1 });
SupplierPreQualificationSchema.index({ tenantId: 1, decision: 1 });

export const SupplierPreQualification = mongoose.model(
  "supplier-prequalifications",
  SupplierPreQualificationSchema
);
