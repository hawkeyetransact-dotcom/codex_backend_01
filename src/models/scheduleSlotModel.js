import mongoose from "mongoose";

const ScheduleSlotSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true, default: null },
    auditRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuditRequestMaster",
      required: true,
      index: true,
    },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: {
      type: String,
      enum: ["candidate", "proposed", "held", "accepted", "confirmed", "expired", "rejected", "blocked"],
      default: "candidate",
    },
    visibility: {
      type: String,
      enum: ["full", "free_busy", "private"],
      default: "full",
    },
    title: { type: String, default: "" },
    notes: { type: String, default: "" },
    holdExpiresAt: { type: Date },
    heldByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    proposedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    acceptedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    blockedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    scoreTotal: { type: Number, default: 0 },
    scoreBreakdown: {
      auditorFit: { type: Number, default: 0 },
      supplierFit: { type: Number, default: 0 },
      slaFit: { type: Number, default: 0 },
      travelFit: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

ScheduleSlotSchema.index({ auditRequestId: 1, status: 1, start: 1 });

export const ScheduleSlot = mongoose.model("ScheduleSlot", ScheduleSlotSchema);
