import { Assessment } from "../../models/assessmentModel.js";
import { AssessmentFinding } from "../../models/assessmentFindingModel.js";
import { canAccessAssessment } from "../../utils/assessmentAccess.js";

export const createFinding = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.body?.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    if (!assessmentId) return res.status(400).json({ error: "assessmentId required" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const finding = await AssessmentFinding.create({
      tenantId,
      assessmentId,
      severity: req.body?.severity || "MEDIUM",
      domain: req.body?.domain || "QUALITY",
      category: req.body?.category,
      description: req.body?.description,
      linkedStandards: req.body?.linkedStandards || [],
      linkedControls: req.body?.linkedControls || [],
      linkedEvidenceIds: req.body?.linkedEvidenceIds || [],
      createdBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: finding });
  } catch (error) {
    console.error("createFinding error", error);
    return res.status(500).json({ error: "Failed to create finding" });
  }
};

export const listFindings = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.query?.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const filter = { tenantId };
    if (assessmentId) filter.assessmentId = assessmentId;
    const findings = await AssessmentFinding.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: findings });
  } catch (error) {
    console.error("listFindings error", error);
    return res.status(500).json({ error: "Failed to list findings" });
  }
};
