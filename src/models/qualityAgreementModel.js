/**
 * QualityAgreementModel.js
 *
 * G10: Quality Agreement between Contract Giver (buyer) and Contract Acceptor
 * (supplier). Mandatory per EU GMP Chapter 7. Two-signer flow ending in
 * COMPLETED status. Once both signatures are captured, the document is locked.
 *
 * Required to support QP batch release per Annex 16 — supplier qualification
 * status with audit-rights provenance gets joined into batch-release flow.
 */
import mongoose from "mongoose";

const QualityAgreementSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    qaNumber: { type: String, index: true, sparse: true },

    // Parties
    contractGiverOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true },
    contractGiverUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    contractAcceptorOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", required: true },
    contractAcceptorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    // For convenience (filter buyer-side queries)
    supplierUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },

    // Scope
    productScope: { type: [String], default: [] },
    siteScope: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    regulatoryStandards: { type: [String], default: [] },

    // Required clauses (EU GMP Ch.7)
    auditRightsClause: {
      hasRightToAudit: { type: Boolean, default: true },
      noticePeriodDays: { type: Number, default: 30 },
      maxAuditsPerYear: { type: Number, default: 2 },
      forCauseAuditRightDays: { type: Number, default: 5 }, // notice required for cause audit
      includeSubContractors: { type: Boolean, default: true },
    },
    documentControlClause: {
      controlledDocsOwnedBy: { type: String, enum: ["GIVER", "ACCEPTOR", "SHARED"], default: "ACCEPTOR" },
      changeApprovalRequired: { type: Boolean, default: true },
    },
    deviationClause: {
      reportingWindowDays: { type: Number, default: 5 },
      jointInvestigation: { type: Boolean, default: true },
    },
    capaClause: {
      reportingWindowDays: { type: Number, default: 30 },
      effectivenessVerificationRequired: { type: Boolean, default: true },
    },

    // Body
    body: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },

    // Lifecycle
    status: {
      type: String,
      enum: ["DRAFT", "GIVER_SIGNED", "COMPLETED", "TERMINATED"],
      default: "DRAFT",
      index: true,
    },
    effectiveFrom: { type: Date, default: null },
    effectiveUntil: { type: Date, default: null },
    terminatedAt: { type: Date, default: null },

    // Signatures
    giverSignatureId: { type: mongoose.Schema.Types.ObjectId, ref: "electronic-signatures", default: null },
    giverSignedAt: { type: Date, default: null },
    acceptorSignatureId: { type: mongoose.Schema.Types.ObjectId, ref: "electronic-signatures", default: null },
    acceptorSignedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: true }
);

QualityAgreementSchema.index({ tenantOrgId: 1, supplierUserId: 1, status: 1 });

QualityAgreementSchema.pre("save", async function (next) {
  if (this.isNew && !this.qaNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("quality-agreements");
    const count = await Model.countDocuments({ tenantOrgId: this.tenantOrgId }) + 1;
    this.qaNumber = `QA-${year}-${String(count).padStart(4, "0")}`;
  }
  next();
});

export const QualityAgreement = mongoose.model("quality-agreements", QualityAgreementSchema);
