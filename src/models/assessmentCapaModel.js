import mongoose from "mongoose";

const capaActionSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    actorRole: { type: String },
    visibility: { type: String, enum: ["internal", "external"], default: "internal" },
    message: { type: String },
    createdAt: { type: Date, default: Date.now },
    attachments: [
      {
        url: String,
        name: String,
        mimeType: String,
        size: Number,
      },
    ],
  },
  { _id: false }
);

const assessmentCapaSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: "assessments", index: true, required: true },
    engagementId: { type: mongoose.Schema.Types.ObjectId, ref: "engagements", default: null, index: true },
    qualificationCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "qualification_cases",
      default: null,
      index: true,
    },
    findingId: { type: mongoose.Schema.Types.ObjectId, ref: "assessment-findings", index: true },
    title: { type: String, required: true },
    description: { type: String },
    severity: { type: String, enum: ["critical", "major", "minor", "info"], default: "major" },
    status: {
      type: String,
      enum: ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", "REWORK_REQUESTED", "APPROVED", "CLOSED", "OVERDUE"],
      default: "DRAFT",
      index: true,
    },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    targetDate: { type: Date },
    closedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    actions: { type: [capaActionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    metadata: { type: Map, of: String },
  },
  { timestamps: true }
);

assessmentCapaSchema.index({ tenantId: 1, status: 1, lastActivityAt: -1 });
assessmentCapaSchema.index({ tenantId: 1, supplierId: 1, status: 1 });
assessmentCapaSchema.index({ tenantId: 1, auditorId: 1, status: 1 });
assessmentCapaSchema.index({ engagementId: 1, status: 1 });

export const AssessmentCapa = mongoose.model("assessment-capas", assessmentCapaSchema);
