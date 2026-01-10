import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String },
    url: { type: String },
    size: { type: Number },
    mimeType: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    senderRole: { type: String, required: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    text: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { _id: false }
);

const auditRfqThreadSchema = new mongoose.Schema(
  {
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-rfqs", required: true, index: true },
    visibility: {
      type: String,
      enum: ["PUBLIC_TO_ALL_INVITED", "PRIVATE_TO_AUDITOR"],
      default: "PUBLIC_TO_ALL_INVITED",
    },
    privateAuditorOrgId: { type: String },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
);

auditRfqThreadSchema.index({ rfqId: 1, visibility: 1, privateAuditorOrgId: 1 }, { unique: true });

export const AuditRFQThread = mongoose.model("audit-rfq-threads", auditRfqThreadSchema);
