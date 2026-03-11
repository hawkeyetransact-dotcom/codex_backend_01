import mongoose from "mongoose";

const AuditReportSchema = new mongoose.Schema(
  {
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true, required: true },
    tenantOrgId: { type: String, index: true },
    buyerOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    supplierOrgId: { type: mongoose.Schema.Types.ObjectId, ref: "organizations", default: null, index: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      default: null,
      index: true,
    },
    summary: { type: String, default: "" },
    reportTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "report-templates", default: null },
    reportTemplateName: { type: String, default: "" },
    reportTemplateSource: { type: String, default: "" },
    renderedBlocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    templateHighlights: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reportContextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ["DRAFT", "PENDING_SIGNATURES", "COMPLETED"], default: "DRAFT" },
    observations: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-questions" },
        title: String,
        severity: { type: String, enum: ["Minor", "Major", "Critical", "Info"], default: "Info" },
        classification: { type: String, enum: ["NAI", "VAI", "OAI", "None"], default: "None" },
        followUp: { type: Boolean, default: false },
        cfr: { type: String, default: "ICH Q7" },
        notes: String,
        linkedEvidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        linkedCapaIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        linkedFindingId: { type: mongoose.Schema.Types.ObjectId, default: null },
      },
    ],
    signatures: [
      {
        role: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
        signedAt: Date,
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

AuditReportSchema.index({ tenantOrgId: 1, auditRequestId: 1 }, { unique: true, sparse: true });
AuditReportSchema.index({ engagementId: 1, qualificationCaseId: 1 });

export const AuditReport = mongoose.model("audit-reports", AuditReportSchema);
