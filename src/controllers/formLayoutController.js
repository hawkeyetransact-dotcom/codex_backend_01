import { FormLayout } from "../models/formLayoutModel.js";

export const getFormLayouts = async (req, res) => {
  try {
    const { categoryName, templateId } = req.query;
    if (!categoryName) {
      return res.status(400).json({ status: false, error: "categoryName is required" });
    }
    const query = { categoryName };
    if (templateId) {
      query.$or = [{ templateId: Number(templateId) }, { templateId: { $exists: false } }];
    }
    const layouts = await FormLayout.find(query).sort({ templateId: -1 }).lean();
    return res.status(200).json({ status: true, data: layouts });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};

export const upsertFormLayout = async (req, res) => {
  try {
    const { categoryName, templateId, columns, rows, style } = req.body || {};
    if (!categoryName || !Array.isArray(columns) || !Array.isArray(rows)) {
      return res.status(400).json({ status: false, error: "categoryName, columns, and rows are required" });
    }
    const filter = { categoryName };
    if (templateId !== undefined && templateId !== null) {
      filter.templateId = Number(templateId);
    }
    const payload = { categoryName, templateId: templateId !== undefined ? Number(templateId) : undefined, columns, rows, style };
    const layout = await FormLayout.findOneAndUpdate(filter, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.status(200).json({ status: true, data: layout });
  } catch (error) {
    return res.status(500).json({ status: false, error: error.message });
  }
};
