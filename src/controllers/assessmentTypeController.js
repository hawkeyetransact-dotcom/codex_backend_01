import { AssessmentType } from "../models/assessmentTypeModel.js";
import { StatusDefinition } from "../models/statusDefinitionModel.js";
import { TEMPLATE_TYPES } from "../constants/assessmentTracking.js";

export const listAssessmentTypes = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const types = await AssessmentType.find({
      $or: [{ tenantId }, { tenantId: null }],
    })
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ success: true, data: types });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load assessment types" });
  }
};

export const createAssessmentType = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const { key, name, phases = [], workflowType = "AUDIT", defaultGranularity = "STANDARD" } = req.body || {};
    if (!key || !name) {
      return res.status(400).json({ error: "key and name are required" });
    }
    const created = await AssessmentType.create({
      tenantId,
      key,
      name,
      workflowType,
      phases,
      defaultGranularity,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create assessment type" });
  }
};

export const getAssessmentType = async (req, res) => {
  try {
    const tenantId = req.tenantId || null;
    const type = await AssessmentType.findOne({
      _id: req.params.id,
      $or: [{ tenantId }, { tenantId: null }],
    }).lean();
    if (!type) return res.status(404).json({ error: "Assessment type not found" });

    const statuses = await StatusDefinition.find({
      tenantId,
      assessmentTypeId: type._id,
      isActive: true,
    })
      .sort({ phaseKey: 1, order: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        ...type,
        statusDefinitions: statuses,
        templateTypes: TEMPLATE_TYPES,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load assessment type" });
  }
};
