import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    role: { type: String },
    name: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const remoteSessionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    auditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "audit-requests-master",
      index: true,
      required: true,
    },
    provider: { type: String, default: "UNKNOWN" },
    meetingUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
    },
    startedAt: { type: Date },
    endedAt: { type: Date },
    recordingAssetId: { type: mongoose.Schema.Types.ObjectId },
    notes: { type: String, default: "" },
    participants: { type: [participantSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { timestamps: true }
);

remoteSessionSchema.index({ tenantId: 1, auditId: 1, createdAt: -1 });

export const RemoteSession = mongoose.model("remote-sessions", remoteSessionSchema);
