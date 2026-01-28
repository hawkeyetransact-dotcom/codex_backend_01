import { AvailabilityBlock } from "../models/availabilityBlockModel.js";

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const listAuditorAvailability = async (req, res) => {
  try {
    const blocks = await AvailabilityBlock.find({
      ownerType: "auditor",
      ownerId: req.user?._id,
    })
      .sort({ start: 1 })
      .lean();
    return res.json({ data: blocks });
  } catch (err) {
    console.error("listAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to load availability" });
  }
};

export const createAuditorAvailability = async (req, res) => {
  try {
    const { start, end, blockType = "blackout", timezone = "UTC" } = req.body || {};
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate || endDate <= startDate) {
      return res.status(400).json({ error: "Invalid start/end" });
    }

    const block = await AvailabilityBlock.create({
      tenantOrgId: req.tenantId || req.user?.tenant_id || null,
      ownerType: "auditor",
      ownerId: req.user?._id,
      blockType,
      start: startDate,
      end: endDate,
      timezone,
      createdBy: req.user?._id,
    });

    return res.status(201).json({ data: block });
  } catch (err) {
    console.error("createAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to save availability" });
  }
};

export const deleteAuditorAvailability = async (req, res) => {
  try {
    const block = await AvailabilityBlock.findOneAndDelete({
      _id: req.params.blockId,
      ownerType: "auditor",
      ownerId: req.user?._id,
    });
    if (!block) return res.status(404).json({ error: "Not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("deleteAuditorAvailability", err);
    return res.status(500).json({ error: "Failed to delete availability" });
  }
};
