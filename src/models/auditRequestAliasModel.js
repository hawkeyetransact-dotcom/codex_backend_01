import mongoose from "mongoose";

const auditRequestAliasSchema = new mongoose.Schema(
  {
    requestObjectId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", required: true, index: true },
    hawkeyeRequestId: { type: String },
    scopeType: { type: String, enum: ["BUYER_TENANT", "SUPPLIER_TENANT"], required: true },
    scopeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    year: { type: Number, required: true },
    seq: { type: Number, required: true },
    displayId: { type: String, required: true },
  },
  { timestamps: true }
);

auditRequestAliasSchema.index({ scopeType: 1, scopeId: 1, year: 1, seq: 1 }, { unique: true, sparse: true });
auditRequestAliasSchema.index({ scopeType: 1, scopeId: 1, displayId: 1 }, { unique: true, sparse: true });
auditRequestAliasSchema.index({ requestObjectId: 1, scopeType: 1, scopeId: 1 }, { unique: true, sparse: true });
auditRequestAliasSchema.index({ hawkeyeRequestId: 1 });

export const AuditRequestAlias = mongoose.model("audit_request_aliases", auditRequestAliasSchema);
