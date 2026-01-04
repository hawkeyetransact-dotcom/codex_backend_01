import jwt from "jsonwebtoken";
import multer from "multer";
import { EvidenceService } from "../services/evidenceService.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const evidenceUploadMiddleware = upload.single("file");

export const uploadEvidence = async (req, res) => {
  try {
    const auditRequestId = req.params.auditId;
    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    if (!req.file) return res.status(400).json({ error: "File missing" });
    const evidence = await EvidenceService.createFromUpload({
      file: req.file,
      uploaderId: user._id,
      uploaderRole: user.role,
      auditRequestId,
      tenantId,
    });
    res.json({ success: true, data: evidence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const listEvidence = async (req, res) => {
  try {
    const auditRequestId = req.params.auditId;
    const tenantId = req.tenantId;
    if (req.user?.role === "auditor") {
      const ok = await canAuditorAccessAudit(req.user._id, auditRequestId);
      if (!ok) return res.status(403).json({ error: "Forbidden" });
    }
    const items = await EvidenceService.listByAudit({ auditRequestId, tenantId });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const issueViewToken = async (req, res) => {
  try {
    const { auditId, evidenceId } = req.params;
    const tenantId = req.tenantId;
    if (req.user?.role === "auditor") {
      const ok = await canAuditorAccessAudit(req.user._id, auditId);
      if (!ok) return res.status(403).json({ error: "Forbidden" });
    }
    const viewerId = req.user._id;
    const jwtSign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);
    const token = await EvidenceService.issueViewToken({ evidenceId, viewerId, tenantId, jwtSign });
    res.json({ success: true, data: token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const streamEvidence = async (req, res) => {
  try {
    const evidenceId = req.params.id;
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: "Token required" });
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (decoded.evidenceId !== evidenceId || decoded.tenantId !== String(req.tenantId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const result = await EvidenceService.streamRedacted({ evidenceId, tenantId: req.tenantId, tokenValidated: decoded });
    res.setHeader("Content-Type", result.mimeType || "text/plain");
    res.setHeader("Cache-Control", "no-store");
    res.send(result.buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const revokeEvidenceToken = async (req, res) => {
  try {
    const evidenceId = req.params.id;
    const { jti } = req.body || {};
    if (!jti) return res.status(400).json({ error: "jti required" });
    await EvidenceService.revokeToken({ evidenceId, tenantId: req.tenantId, jti });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
