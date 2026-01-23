import { Template } from "../models/templateModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";

const computeNextTemplateId = async () => {
  const [maxFromTemplates, maxFromQuestions] = await Promise.all([
    Template.findOne().sort({ templateId: -1 }).select("templateId").lean(),
    TemplateQuestions.findOne().sort({ templateId: -1 }).select("templateId").lean(),
  ]);
  const maxVal = Math.max(maxFromTemplates?.templateId || 0, maxFromQuestions?.templateId || 0);
  return maxVal + 1;
};

export const listTemplates = async (req, res) => {
  try {
    const {
      phaseKey,
      artifactType,
      productType,
      riskLevel,
      includeLegacy = "true",
    } = req.query || {};
    const matchStage = {};
    if (phaseKey) {
      if (phaseKey === "EXECUTION" && includeLegacy !== "false") {
        matchStage.$or = [{ phaseKey }, { phaseKey: { $in: [null, ""] } }, { phaseKey: { $exists: false } }];
      } else {
        matchStage.phaseKey = phaseKey;
      }
    }
    if (artifactType) matchStage.artifactType = artifactType;
    if (productType) matchStage.productType = productType;
    if (riskLevel) matchStage.riskLevel = riskLevel;

    const templates = await Template.aggregate([
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $lookup: {
          from: "templateQuestions",
          localField: "templateId",
          foreignField: "templateId",
          as: "qs",
        },
      },
      {
        $addFields: {
          questionCount: { $size: "$qs" },
        },
      },
      { $project: { qs: 0 } },
      { $sort: { templateId: 1 } },
    ]);
    const filtered = templates.filter((t) => (t.questionCount || 0) > 0);
    return res.status(200).json({ status: true, data: filtered });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const {
      name,
      riskcategory = "",
      Audittype = "",
      industry = "",
      categories = [],
      phaseKey = null,
      artifactType = null,
      regulatoryMapping = {},
      productType = "",
      riskLevel = "",
      visibility = {},
    } = req.body || {};
    if (!name) return res.status(400).json({ status: false, error: "Template name is required" });
    const nextId = await computeNextTemplateId();

    const record = await Template.create({
      templateId: nextId,
      name,
      riskcategory,
      Audittype,
      industry,
      categories: Array.isArray(categories) ? categories : [],
      phaseKey,
      artifactType,
      regulatoryMapping,
      productType,
      riskLevel,
      visibility,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ status: true, data: record });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const numericTemplateId = Number(templateId);
    if (!templateId || Number.isNaN(numericTemplateId)) {
      return res.status(400).json({ status: false, error: "templateId is required and must be numeric" });
    }

    const template = await Template.findOne({ templateId: numericTemplateId }).lean();
    if (!template) {
      return res.status(404).json({ status: false, error: "Template not found" });
    }

    // Only creator or admin can delete
    const isOwner = template.createdBy && String(template.createdBy) === String(req.user?._id);
    const isAdmin = req.user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ status: false, error: "Not authorized to delete this template" });
    }

    await Promise.all([
      TemplateQuestions.deleteMany({ templateId: numericTemplateId }),
      Template.deleteOne({ templateId: numericTemplateId }),
    ]);

    return res.status(200).json({ status: true, message: "Template and its questions deleted" });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};
