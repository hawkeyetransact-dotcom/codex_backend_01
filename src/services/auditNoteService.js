import fs from "fs";
import path from "path";
import AuditNote from "../models/auditNoteModel.js";

const uploadDir = path.join(process.cwd(), "uploads", "audit-notes");
try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}

export const AuditNoteService = {
  async createNote({ auditRequestId, tenantId, authorId, authorRole, text, type, file, transcript }) {
    let attachmentPath = null;
    let mimeType = null;
    let size = null;
    if (file) {
      const filename = `${Date.now()}-${file.originalname}`;
      attachmentPath = path.join(uploadDir, filename);
      fs.writeFileSync(attachmentPath, file.buffer);
      mimeType = file.mimetype;
      size = file.size;
    }
    const note = await AuditNote.create({
      auditRequestId,
      tenantId,
      authorId,
      authorRole,
      type: type || (file ? (file.mimetype.startsWith("audio/") ? "audio" : "photo") : "text"),
      text,
      transcript,
      attachmentPath,
      mimeType,
      size,
    });
    return note;
  },

  async listNotes({ auditRequestId, tenantId }) {
    return AuditNote.find({ auditRequestId, tenantId }).sort({ createdAt: -1 }).lean();
  },
};
