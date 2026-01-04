import mongoose from "mongoose";

const auditorAffiliationSchema = new mongoose.Schema(
  {
    auditorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "auditor-profiles", required: true, index: true },
    orgTenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    affiliationType: { type: String, enum: ["INTERNAL", "EXTERNAL"], required: true },
    status: { type: String, enum: ["PENDING", "ACTIVE", "REVOKED"], default: "PENDING", index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    scope: { type: [String], default: [] },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

auditorAffiliationSchema.index({ auditorProfileId: 1, orgTenantId: 1 }, { unique: true });

export const AuditorAffiliation = mongoose.model("auditor_affiliations", auditorAffiliationSchema);
