import mongoose from "mongoose";

// Cross-module Part-11 / Annex-11 audit trail.
// A row is created on every state-change / approval / closure across:
// audit, deviation, capa, document_control, change_control, training, mrm, risk.
// auditId is OPTIONAL — only set when the change is tied to an audit lifecycle.
const auditTrailSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      // NOT required — populated only when the change is audit-linked.
    },
    module: { type: String, index: true }, // "audit" | "deviation" | "capa" | "document_control" | "change_control" | "training" | "risk" | "mrm" | "complaint"
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    actorRole: { type: String },
    reasonForChange: { type: String }, // ALCOA+ "why" capture
    signatureId: { type: mongoose.Schema.Types.ObjectId, ref: "electronic-signatures" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditTrailSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });
auditTrailSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditTrailSchema.index({ tenantId: 1, module: 1, createdAt: -1 });
auditTrailSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

export const AuditTrail = mongoose.model("audit-trails", auditTrailSchema);
