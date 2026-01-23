import jwt from "jsonwebtoken";
import multer from "multer";
import { Assessment } from "../../models/assessmentModel.js";
import { AssessmentEvidenceService } from "../../services/assessmentEvidenceService.js";
import { canAccessAssessment } from "../../utils/assessmentAccess.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const assessmentEvidenceUploadMiddleware = upload.single("file");

export const uploadAssessmentEvidence = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.body?.assessmentId || req.params.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    if (!assessmentId) return res.status(400).json({ error: "assessmentId required" });
    if (!req.file) return res.status(400).json({ error: "File missing" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const evidence = await AssessmentEvidenceService.createFromUpload({
      file: req.file,
      uploaderId: req.user._id,
      uploaderRole: req.user.role,
      assessmentId,
      tenantId,
      linkedControlIds: req.body?.linkedControlIds || [],
      linkedQuestionIds: req.body?.linkedQuestionIds || [],
    });
    res.json({ success: true, data: evidence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const listAssessmentEvidence = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.params.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const items = await AssessmentEvidenceService.listByAssessment({ assessmentId, tenantId });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const issueAssessmentEvidenceViewToken = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.params.assessmentId;
    const evidenceId = req.params.evidenceId;
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const jwtSign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, opts);
    const token = await AssessmentEvidenceService.issueViewToken({ evidenceId, viewerId: req.user._id, tenantId, jwtSign });
    res.json({ success: true, data: token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const streamAssessmentEvidence = async (req, res) => {
  try {
    const evidenceId = req.params.evidenceId;
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
    const result = await AssessmentEvidenceService.streamRedacted({ evidenceId, tenantId: req.tenantId, tokenValidated: decoded });
    res.setHeader("Content-Type", result.mimeType || "text/plain");
    res.setHeader("Cache-Control", "no-store");
    res.send(result.buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
