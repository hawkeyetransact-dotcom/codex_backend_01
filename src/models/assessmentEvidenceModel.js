import mongoose from "mongoose";

const assessmentEvidenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "assessments", index: true, required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    uploaderRole: { type: String },
    linkedControlIds: { type: [String], default: [] },
    linkedQuestionIds: { type: [String], default: [] },
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

assessmentEvidenceSchema.index({ tenantId: 1, assessmentId: 1, createdAt: -1 });

export const AssessmentEvidence = mongoose.model("assessment-evidence", assessmentEvidenceSchema);
