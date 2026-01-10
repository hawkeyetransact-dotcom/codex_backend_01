import { ReportTemplate } from "../models/reportTemplateModel.js";

const normalizeBlocks = (blocks) => (Array.isArray(blocks) ? blocks : []);

export const listReportTemplates = async (req, res) => {
  try {
    const { active, category } = req.query;
    const filter = {};
    if (active === "true") filter.isActive = true;
    if (category) filter.category = category;
    const templates = await ReportTemplate.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: templates });
  } catch (error) {
    console.error("listReportTemplates error", error);
    return res.status(500).json({ success: false, error: "Failed to load report templates" });
  }
};

export const getReportTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await ReportTemplate.findById(id).lean();
    if (!template) return res.status(404).json({ success: false, error: "Template not found" });
    return res.json({ success: true, data: template });
  } catch (error) {
    console.error("getReportTemplate error", error);
    return res.status(500).json({ success: false, error: "Failed to load report template" });
  }
};

export const createReportTemplate = async (req, res) => {
  try {
    const { name, description, category, isActive, blocks } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, error: "Template name is required" });
    }
    const template = await ReportTemplate.create({
      name: String(name).trim(),
      description: description || "",
      category: category || "",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      blocks: normalizeBlocks(blocks),
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
      version: 1,
    });
    return res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error("createReportTemplate error", error);
    return res.status(500).json({ success: false, error: "Failed to create report template" });
  }
};

export const updateReportTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await ReportTemplate.findById(id);
    if (!existing) return res.status(404).json({ success: false, error: "Template not found" });

    const { name, description, category, isActive, blocks, version } = req.body || {};
    if (name !== undefined) existing.name = String(name).trim();
    if (description !== undefined) existing.description = description || "";
    if (category !== undefined) existing.category = category || "";
    if (isActive !== undefined) existing.isActive = Boolean(isActive);
    if (blocks !== undefined) existing.blocks = normalizeBlocks(blocks);
    if (version !== undefined) {
      existing.version = Number(version) || existing.version || 1;
    } else if (blocks || name || description || category) {
      existing.version = (existing.version || 1) + 1;
    }
    existing.updatedBy = req.user?._id;

    await existing.save();
    return res.json({ success: true, data: existing });
  } catch (error) {
    console.error("updateReportTemplate error", error);
    return res.status(500).json({ success: false, error: "Failed to update report template" });
  }
};
