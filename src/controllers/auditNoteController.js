import multer from "multer";
import { AuditNoteService } from "../services/auditNoteService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
export const noteUploadMiddleware = upload.single("file");

export const createNote = async (req, res) => {
  try {
    const auditRequestId = req.params.auditId;
    const tenantId = req.tenantId;
    const authorId = req.user._id;
    const authorRole = req.user.role;
    const { text = "", type = "text", transcript = "" } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    if (!auditRequestId) return res.status(400).json({ error: "auditId missing" });
    if (!text && !req.file) return res.status(400).json({ error: "Nothing to save" });
    const note = await AuditNoteService.createNote({
      auditRequestId,
      tenantId,
      authorId,
      authorRole,
      text,
      type,
      file: req.file,
      transcript,
    });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const listNotes = async (req, res) => {
  try {
    const auditRequestId = req.params.auditId;
    const tenantId = req.tenantId;
    const notes = await AuditNoteService.listNotes({ auditRequestId, tenantId });
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
