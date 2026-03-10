import mongoose from "mongoose";

const ExternalAuditSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    auditId: { type: String, required: true, index: true },
    auditType: {
      type: String,
      enum: [
        "INTERNAL_REFERENCE",
        "SUPPLIER_AUDIT",
        "REGULATORY_AUDIT",
        "PREQUALIFICATION_AUDIT",
        "SELF_ASSESSMENT",
      ],
      default: "SUPPLIER_AUDIT",
      index: true,
    },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, index: true },
    auditDate: { type: Date, index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    status: { type: String, index: true },
    source: { type: String, enum: ["Hawkeye", "eQMS"], default: "Hawkeye" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ExternalAuditSchema.index({ tenantId: 1, auditId: 1 }, { unique: true });
ExternalAuditSchema.index({ tenantId: 1, supplierId: 1, siteId: 1, auditDate: -1 });

export const ExternalAudit = mongoose.model("external-audits", ExternalAuditSchema);
