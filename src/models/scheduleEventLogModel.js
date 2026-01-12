import mongoose from "mongoose";

const ScheduleEventLogSchema = new mongoose.Schema(
  {
    tenantOrgId: { type: String, index: true, default: null },
    auditRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuditRequestMaster",
      required: true,
      index: true,
    },
    eventType: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    actorRole: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    notes: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ScheduleEventLogSchema.index({ auditRequestId: 1, createdAt: -1 });

export const ScheduleEventLog = mongoose.model("ScheduleEventLog", ScheduleEventLogSchema);
