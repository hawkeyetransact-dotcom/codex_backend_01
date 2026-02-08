import { StandardRegistryService } from "../services/compliance/standardRegistryService.js";

const toBool = (value) => String(value || "").toLowerCase() === "true" || String(value || "") === "1";

export const listComplianceStandards = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const includeControls = toBool(req.query?.includeControls);
    const includeArchived = toBool(req.query?.includeArchived);
    const data = await StandardRegistryService.listStandards({
      tenantId: req.tenantId,
      includeControls,
      includeArchived,
      actorUserId: req.user?._id,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load compliance standards",
    });
  }
};

export const getComplianceStandard = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const standard = await StandardRegistryService.getStandard({
      tenantId: req.tenantId,
      standardKey: req.params.standardKey,
      version: req.params.version || req.query?.version,
      actorUserId: req.user?._id,
    });
    if (!standard) return res.status(404).json({ error: "Standard not found" });
    return res.json({ success: true, data: standard });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load standard",
    });
  }
};

export const createComplianceStandard = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const created = await StandardRegistryService.createStandard({
      tenantId: req.tenantId,
      payload: req.body || {},
      actorUserId: req.user?._id,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to create standard",
    });
  }
};

export const updateComplianceStandard = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const updated = await StandardRegistryService.updateStandard({
      tenantId: req.tenantId,
      standardKey: req.params.standardKey,
      version: req.params.version,
      payload: req.body || {},
      actorUserId: req.user?._id,
    });
    if (!updated) return res.status(404).json({ error: "Standard not found" });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to update standard",
    });
  }
};

export const bootstrapComplianceDefaults = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    await StandardRegistryService.ensureDefaults({
      tenantId: req.tenantId,
      actorUserId: req.user?._id,
    });
    return res.json({
      success: true,
      data: { message: "Default compliance standards are ready for this tenant" },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to bootstrap defaults",
    });
  }
};

