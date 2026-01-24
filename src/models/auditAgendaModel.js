import mongoose from "mongoose";
import { AUDIT_PHASE_KEYS } from "../constants/auditPhases.js";

const agendaBlockSchema = new mongoose.Schema(
  {
    startAt: { type: Date },
    endAt: { type: Date },
    topic: { type: String },
    ownerRole: { type: String },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    location: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const attendeeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    role: { type: String },
    name: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const auditAgendaSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      required: true,
    },
    phaseKey: { type: String, enum: AUDIT_PHASE_KEYS, default: "PLANNING" },
    status: { type: String, enum: ["DRAFT", "PROPOSED", "CONFIRMED"], default: "DRAFT" },
    blocks: { type: [agendaBlockSchema], default: [] },
    attendees: { type: [attendeeSchema], default: [] },
    version: { type: Number, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

auditAgendaSchema.index({ tenantId: 1, auditId: 1 }, { unique: true, sparse: true });

export const AuditAgenda = mongoose.model("audit-agendas", auditAgendaSchema);
