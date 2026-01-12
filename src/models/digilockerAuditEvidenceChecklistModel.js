import mongoose from "mongoose";

const ChecklistItemSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    requiredDocTypes: { type: [String], default: [] },
    requiredTags: { type: [String], default: [] },
    status: {
      type: String,
      enum: [
        "AvailableMapped",
        "AvailableUnmapped",
        "Missing",
        "NeedsReviewExpired",
        "NeedsReviewLowConfidence",
      ],
      default: "Missing",
    },
    recommendedDocs: {
      type: [
        {
          documentId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_documents" },
          versionId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_document_versions" },
          confidence: { type: Number, min: 0, max: 1 },
        },
      ],
      default: [],
    },
    lastComputedAt: { type: Date },
  },
  { _id: false }
);

const AuditEvidenceChecklistSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", required: true, index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-sites" },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "supplier-master-products" },
    items: { type: [ChecklistItemSchema], default: [] },
  },
  { timestamps: true }
);

AuditEvidenceChecklistSchema.index({ tenantId: 1, auditId: 1 });

export const DigiLockerAuditEvidenceChecklist = mongoose.model(
  "digilocker_audit_evidence_checklists",
  AuditEvidenceChecklistSchema
);
