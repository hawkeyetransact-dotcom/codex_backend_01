import { getLatestDashboardSnapshot, updateFdaData, rebuildFdaSnapshot } from "../services/fdaDataService.js";
import FdaInspection from "../models/fdaInspectionModel.js";
import FdaCitation from "../models/fdaCitationModel.js";
import Fda483 from "../models/fda483Model.js";

export const refreshFdaData = async (req, res) => {
  try {
    const { truncate } = req.body || {};
    const result = await updateFdaData({ truncate: truncate !== false });
    return res.json({
      message: "FDA data updated",
      counts: result.counts,
      snapshotId: result.snapshot?._id,
      updatedAt: result.snapshot?.createdAt,
    });
  } catch (error) {
    console.error("refreshFdaData error", error);
    return res.status(500).json({ message: error.message || "Failed to refresh FDA data" });
  }
};

export const getFdaDashboard = async (_req, res) => {
  try {
    const snap = await getLatestDashboardSnapshot();
    if (!snap) {
      return res.status(404).json({ message: "No FDA dashboard data found. Run update first." });
    }
    return res.json({
      updatedAt: snap.createdAt,
      stats: snap.stats,
    });
  } catch (error) {
    console.error("getFdaDashboard error", error);
    return res.status(500).json({ message: error.message || "Failed to fetch FDA dashboard data" });
  }
};

export const rebuildSnapshotOnly = async (_req, res) => {
  try {
    const snap = await rebuildFdaSnapshot();
    return res.json({ message: "FDA snapshot rebuilt", snapshotId: snap?._id, updatedAt: snap?.createdAt });
  } catch (error) {
    console.error("rebuildSnapshotOnly error", error);
    return res.status(500).json({ message: error.message || "Failed to rebuild FDA snapshot" });
  }
};

const buildQuery = (search, fields) => {
  if (!search) return {};
  const regex = new RegExp(search, "i");
  return { $or: fields.map((f) => ({ [f]: regex })) };
};

const paginate = (page = 1, limit = 25) => {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  return { skip: (p - 1) * l, limit: l, page: p };
};

export const listFdaInspections = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 25 } = req.query;
    const query = buildQuery(search, ["inspectionId", "feiNumber", "legalName", "classification", "productType", "country", "city", "state"]);
    const { skip, limit: take, page: current } = paginate(page, limit);
    const [data, total] = await Promise.all([
      FdaInspection.find(query).sort({ inspectionEndDate: -1 }).skip(skip).limit(take).lean(),
      FdaInspection.countDocuments(query),
    ]);
    return res.json({ data, meta: { total, page: current, limit: take } });
  } catch (error) {
    console.error("listFdaInspections error", error);
    return res.status(500).json({ message: error.message || "Failed to fetch inspections" });
  }
};

export const listFdaCitations = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 25 } = req.query;
    const query = buildQuery(search, ["inspectionId", "feiNumber", "legalName", "programArea", "actCfrNumber", "shortDescription"]);
    const { skip, limit: take, page: current } = paginate(page, limit);
    const [data, total] = await Promise.all([
      FdaCitation.find(query).sort({ inspectionEndDate: -1 }).skip(skip).limit(take).lean(),
      FdaCitation.countDocuments(query),
    ]);
    return res.json({ data, meta: { total, page: current, limit: take } });
  } catch (error) {
    console.error("listFdaCitations error", error);
    return res.status(500).json({ message: error.message || "Failed to fetch citations" });
  }
};

export const listFdaForms483 = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 25 } = req.query;
    const query = buildQuery(search, ["recordId", "feiNumber", "legalName", "recordType"]);
    const { skip, limit: take, page: current } = paginate(page, limit);
    const [data, total] = await Promise.all([
      Fda483.find(query).sort({ publishDate: -1 }).skip(skip).limit(take).lean(),
      Fda483.countDocuments(query),
    ]);
    return res.json({ data, meta: { total, page: current, limit: take } });
  } catch (error) {
    console.error("listFdaForms483 error", error);
    return res.status(500).json({ message: error.message || "Failed to fetch published 483s" });
  }
};
