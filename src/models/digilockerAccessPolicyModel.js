import mongoose from "mongoose";

const AccessPolicySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    scope: { type: String, enum: ["Document", "Audit"], required: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master" },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "digilocker_documents" },
    allowedRoles: { type: [String], default: [] },
    allowedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    canView: { type: Boolean, default: true },
    canDownload: { type: Boolean, default: false },
    expiresAt: { type: Date },
    watermark: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AccessPolicySchema.index({ tenantId: 1, scope: 1, auditId: 1, documentId: 1 });

export const DigiLockerAccessPolicy = mongoose.model(
  "digilocker_access_policies",
  AccessPolicySchema
);
