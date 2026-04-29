/**
 * AuditProgramModel.js
 *
 * G9: Annual audit program calendar with GMP scope coverage tracking.
 * Required by ICH Q7 §2.4 + EU GMP Chapter 9 (regular internal audits
 * against an approved schedule covering ALL GMP scope areas).
 *
 * One AuditProgram per (tenant, year). plannedAudits[] records the schedule;
 * scopeCoverage[] tracks which GMP areas have been audited so management
 * review can see uncovered scope.
 */
import mongoose from "mongoose";

const GMP_SCOPE_AREAS = [
  "PREMISES",
  "EQUIPMENT",
  "PERSONNEL",
  "DOCUMENTATION",
  "PRODUCTION",
  "QUALITY_CONTROL",
  "DISTRIBUTION",
  "COMPLAINTS",
  "RECALLS",
  "SELF_INSPECTION",
];

const PlannedAuditSchema = new mongoose.Schema(
  {
    auditId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", default: null },
    plannedDate: { type: Date, required: true },
    auditType: {
      type: String,
      enum: ["INTERNAL", "EXTERNAL_SUPPLIER", "RECERTIFICATION", "FOR_CAUSE"],
      required: true,
    },
    targetScopeAreas: {
      type: [String],
      enum: GMP_SCOPE_AREAS,
      default: [],
    },
    targetSupplierId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    targetSiteId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: ["PLANNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"],
      default: "PLANNED",
    },
    completedAt: { type: Date, default: null },
    notes: { type: String, default: "" },
  },
  { _id: true }
);

const AuditProgramSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, required: true, index: true },
    year: { type: Number, required: true, index: true },
    title: { type: String, default: "" },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
    approvedAt: { type: Date, default: null },

    plannedAudits: { type: [PlannedAuditSchema], default: [] },

    // Scope coverage = derived field updated when planned audits complete.
    // Each entry: { area, lastCoveredAt, lastAuditId, plannedCount, completedCount }
    scopeCoverage: {
      type: [
        new mongoose.Schema(
          {
            area: { type: String, enum: GMP_SCOPE_AREAS, required: true },
            lastCoveredAt: { type: Date, default: null },
            lastAuditId: { type: mongoose.Schema.Types.ObjectId, default: null },
            plannedCount: { type: Number, default: 0 },
            completedCount: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ["DRAFT", "APPROVED", "IN_EXECUTION", "CLOSED"],
      default: "DRAFT",
    },
  },
  { timestamps: true }
);

AuditProgramSchema.index({ tenantOrgId: 1, year: 1 }, { unique: true });

export const AuditProgram = mongoose.model("audit-programs", AuditProgramSchema);
export const AUDIT_PROGRAM_GMP_SCOPE_AREAS = GMP_SCOPE_AREAS;
