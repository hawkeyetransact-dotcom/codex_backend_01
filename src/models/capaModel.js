import mongoose from "mongoose";

const CapaActionSchema = new mongoose.Schema(
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

const CapaSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true },
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true },
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: "issues", index: true },
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
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "users" }, // primary responsible
    findingId: { type: mongoose.Schema.Types.ObjectId, ref: "assessment-findings" },
    linkedQuestionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    linkedObservationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    linkedEvidenceIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    targetDate: { type: Date },
    closedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    actions: { type: [CapaActionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    metadata: { type: Map, of: String },
  },
  { timestamps: true }
);

CapaSchema.index({ tenantOrgId: 1, status: 1, lastActivityAt: -1 });
CapaSchema.index({ tenantOrgId: 1, severity: 1, targetDate: 1 });
CapaSchema.index({ tenantOrgId: 1, supplierId: 1, status: 1 });
CapaSchema.index({ tenantOrgId: 1, auditorId: 1, status: 1 });

export const Capa = mongoose.model("capas", CapaSchema);
