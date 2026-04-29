/**
 * AuditClosureCertificateModel.js
 *
 * G8: Formal audit closure certification (24-step expert flow Step #021).
 * Append-only record — once signed, the document is locked. EU GMP Chapter 9
 * + Annex 16 compliance.
 *
 * Two-signer flow: Auditor (AUTHORED), then Buyer QA (APPROVED). The buyer
 * approval triggers QP-blocking signal updates on the supplier scorecard.
 */
import mongoose from "mongoose";

const AuditClosureCertificateSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true, required: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      required: true,
      unique: true,    // exactly one closure certificate per audit
      index: true,
    },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },

    // Outcome — drives QP-block signal on supplier scorecard.
    outcome: {
      type: String,
      enum: ["APPROVED", "APPROVED_WITH_CAPA", "CONDITIONALLY_APPROVED", "REJECTED"],
      required: true,
    },
    findingsSummary: {
      criticalCount: { type: Number, default: 0 },
      majorCount: { type: Number, default: 0 },
      minorCount: { type: Number, default: 0 },
      capaCount: { type: Number, default: 0 },
    },
    validUntil: { type: Date, default: null },
    summary: { type: String, default: "" },

    // Two-signature flow.
    auditorSignatureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "electronic-signatures",
      default: null,
    },
    auditorSignedAt: { type: Date, default: null },
    buyerSignatureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "electronic-signatures",
      default: null,
    },
    buyerSignedAt: { type: Date, default: null },

    // Lifecycle: DRAFT → AUDITOR_SIGNED → COMPLETED. Once COMPLETED, locked.
    status: {
      type: String,
      enum: ["DRAFT", "AUDITOR_SIGNED", "COMPLETED"],
      default: "DRAFT",
      index: true,
    },
    completedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  },
  { timestamps: true }
);

AuditClosureCertificateSchema.index({ tenantOrgId: 1, supplierId: 1, status: 1 });
AuditClosureCertificateSchema.index({ tenantOrgId: 1, validUntil: 1 });

export const AuditClosureCertificate = mongoose.model(
  "audit-closure-certificates",
  AuditClosureCertificateSchema
);
