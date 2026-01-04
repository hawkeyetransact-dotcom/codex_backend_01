import mongoose from "mongoose";

const AuditNoteSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    auditRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "audit-requests-master", index: true, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    authorRole: { type: String },
    type: { type: String, enum: ["text", "photo", "audio"], default: "text" },
    text: { type: String },
    transcript: { type: String },
    attachmentPath: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  { timestamps: true }
);

AuditNoteSchema.index({ tenantId: 1, auditRequestId: 1, createdAt: -1 });

const AuditNote = mongoose.model("audit-notes", AuditNoteSchema);
export default AuditNote;
