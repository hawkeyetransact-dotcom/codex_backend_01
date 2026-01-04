import mongoose from "mongoose";

const EvidenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true, required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    uploaderRole: { type: String },
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
    piiFindings: { type: [String], default: [] },
    originalPath: { type: String },
    redactedPath: { type: String },
  encryption: {
    alg: { type: String },
    key: { type: String },
    iv: { type: String },
  },
  viewSessions: [
    {
      jti: { type: String },
      expiresAt: { type: Date },
      revoked: { type: Boolean, default: false },
      issuedAt: { type: Date, default: Date.now },
    },
  ],
  viewPolicy: {
    ttlMinutes: { type: Number, default: 30 },
    maxViews: { type: Number, default: 3 },
  },
  viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date },
    failedReason: { type: String },
  },
  { timestamps: true }
);

EvidenceSchema.index({ tenantId: 1, auditRequestId: 1, createdAt: -1 });

const Evidence = mongoose.model("evidence", EvidenceSchema);
export default Evidence;
