import { StatusDefinition } from "../models/statusDefinitionModel.js";

export const listStatusDefinitions = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { assessmentTypeId, phaseKey, includeInactive = "false" } = req.query || {};
    if (!assessmentTypeId) {
      return res.status(400).json({ error: "assessmentTypeId is required" });
    }
    const filter = {
      tenantId,
      assessmentTypeId,
      ...(phaseKey ? { phaseKey } : {}),
    };
    if (includeInactive !== "true") {
      filter.isActive = true;
    }
    const defs = await StatusDefinition.find(filter).sort({ order: 1 }).lean();
    return res.json({ success: true, data: defs });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load status definitions" });
  }
};

export const createStatusDefinition = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const {
      assessmentTypeId,
      phaseKey,
      statusCode,
      name,
      order = 0,
      defaultResponsibleRole = null,
      defaultDurationHours = 0,
      allowUserOverride = true,
      escalation = [],
    } = req.body || {};

    if (!assessmentTypeId || !phaseKey || !statusCode || !name) {
      return res.status(400).json({ error: "assessmentTypeId, phaseKey, statusCode, and name are required" });
    }

    const created = await StatusDefinition.create({
      tenantId,
      assessmentTypeId,
      phaseKey,
      statusCode,
      name,
      order,
      defaultResponsibleRole,
      defaultDurationHours,
      allowUserOverride,
      escalation,
      isActive: true,
      isDefault: false,
      createdByUserId: req.user?._id,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to create status definition" });
  }
};

export const updateStatusDefinition = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const update = req.body || {};
    const updated = await StatusDefinition.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Status definition not found" });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to update status definition" });
  }
};

export const setStatusDefinitionActive = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const isActive = req.params.action === "activate";
    const updated = await StatusDefinition.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { isActive } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Status definition not found" });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to update status definition" });
  }
};
