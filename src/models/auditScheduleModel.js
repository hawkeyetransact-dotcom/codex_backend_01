import mongoose from "mongoose";

const AuditScheduleSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true, default: null },
    auditRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuditRequestMaster",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PROPOSED", "HELD", "ACCEPTED", "CONFIRMED", "RESCHEDULED"],
      default: "DRAFT",
    },
    mode: { type: String, enum: ["REMOTE", "ONSITE", "HYBRID"], default: "REMOTE" },
    timezone: { type: String, default: "UTC" },
    durationDays: { type: Number, default: 1 },
    dailyStart: { type: String, default: "09:00" },
    dailyEnd: { type: String, default: "17:00" },
    auditWindowStart: { type: Date },
    auditWindowEnd: { type: Date },
    supplierConstraints: { type: mongoose.Schema.Types.Mixed },
    auditorConstraints: { type: mongoose.Schema.Types.Mixed },
    buyerConstraints: { type: mongoose.Schema.Types.Mixed },
    confirmedSlotId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleSlot" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

AuditScheduleSchema.index({ auditRequestId: 1 }, { unique: true });

export const AuditSchedule = mongoose.model("AuditSchedule", AuditScheduleSchema);
