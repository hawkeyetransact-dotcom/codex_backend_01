import { Assessment } from "../../models/assessmentModel.js";
import { AssessmentCapa } from "../../models/assessmentCapaModel.js";
import { canAccessAssessment } from "../../utils/assessmentAccess.js";

export const createAssessmentCapa = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.body?.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });
    if (!assessmentId) return res.status(400).json({ error: "assessmentId required" });

    const assessment = await Assessment.findOne({ _id: assessmentId, tenantId }).lean();
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });
    if (!canAccessAssessment(req.user, assessment)) return res.status(403).json({ error: "Forbidden" });

    const capa = await AssessmentCapa.create({
      tenantId,
      assessmentId,
      findingId: req.body?.findingId,
      title: req.body?.title,
      description: req.body?.description,
      severity: req.body?.severity || "major",
      status: req.body?.status || "DRAFT",
      supplierId: assessment.scope?.supplierId,
      buyerId: assessment.scope?.buyerId,
      auditorId: assessment.assignedAuditors?.[0]?.userId,
      ownerId: req.body?.ownerId,
      targetDate: req.body?.targetDate,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: capa });
  } catch (error) {
    console.error("createAssessmentCapa error", error);
    return res.status(500).json({ error: "Failed to create CAPA" });
  }
};

export const listAssessmentCapas = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const assessmentId = req.query?.assessmentId;
    if (!tenantId) return res.status(400).json({ error: "Tenant context missing" });

    const filter = { tenantId };
    if (assessmentId) filter.assessmentId = assessmentId;
    const capas = await AssessmentCapa.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: capas });
  } catch (error) {
    console.error("listAssessmentCapas error", error);
    return res.status(500).json({ error: "Failed to list CAPA" });
  }
};
