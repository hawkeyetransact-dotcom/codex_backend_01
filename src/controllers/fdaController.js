import { getLatestDashboardSnapshot, updateFdaData, rebuildFdaSnapshot } from "../services/fdaDataService.js";
import FdaInspection from "../models/fdaInspectionModel.js";
import FdaCitation from "../models/fdaCitationModel.js";
import Fda483 from "../models/fda483Model.js";
import { buildSupplierFdaFilter } from "../utils/fdaScope.js";

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

const buildStatsFromData = (inspections, citations, forms483Count) => {
  const classificationByProductType = {};
  const classificationByYear = {};
  const regionByYear = {};

  inspections.forEach((ins) => {
    const product = ins.productType || "Unspecified";
    const cls = ins.classification || "Unknown";
    classificationByProductType[product] = classificationByProductType[product] || {};
    classificationByProductType[product][cls] = (classificationByProductType[product][cls] || 0) + 1;

    const year = ins.fiscalYear || "Unknown";
    classificationByYear[year] = classificationByYear[year] || {};
    classificationByYear[year][cls] = (classificationByYear[year][cls] || 0) + 1;

    const region = ins.country && ins.country.toLowerCase().includes("united states") ? "Domestic" : "Foreign";
    regionByYear[year] = regionByYear[year] || { Domestic: 0, Foreign: 0 };
    regionByYear[year][region] = (regionByYear[year][region] || 0) + 1;
  });

  const citationCounts = {};
  citations.forEach((c) => {
    const key = c.actCfrNumber || c.shortDescription || "Unspecified";
    citationCounts[key] = (citationCounts[key] || 0) + 1;
  });
  const topCitations = Object.entries(citationCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totals: {
      inspections: inspections.length,
      citations: citations.length,
      forms483: forms483Count,
    },
    classificationByProductType,
    classificationByYear,
    regionByYear,
    topCitations,
  };
};

export const getFdaDashboard = async (req, res) => {
  try {
    const supplierFilter = await buildSupplierFdaFilter(req);
    if (supplierFilter) {
      const [inspections, citations, forms483] = await Promise.all([
        FdaInspection.find(supplierFilter, { productType: 1, classification: 1, fiscalYear: 1, country: 1 }).lean(),
        FdaCitation.find(supplierFilter, { actCfrNumber: 1, shortDescription: 1 }).lean(),
        Fda483.countDocuments(supplierFilter),
      ]);
      const stats = buildStatsFromData(inspections, citations, forms483);
      return res.json({
        updatedAt: new Date(),
        stats,
      });
    }

    const snap = await getLatestDashboardSnapshot();
    if (!snap) {
      return res.status(404).json({ message: "No FDA dashboard data found. Run update first." });
    }
    return res.json({ updatedAt: snap.createdAt, stats: snap.stats });
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

const buildFieldFilters = (params, mapping) => {
  const filter = {};
  Object.entries(mapping).forEach(([paramKey, field]) => {
    const raw = params?.[paramKey];
    if (raw) {
      filter[field] = new RegExp(String(raw), "i");
    }
  });
  return filter;
};

const mergeQueries = (...parts) => {
  const valid = parts.filter((part) => part && Object.keys(part).length);
  if (!valid.length) return {};
  if (valid.length === 1) return valid[0];
  return { $and: valid };
};

const paginate = (page = 1, limit = 25) => {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  return { skip: (p - 1) * l, limit: l, page: p };
};

export const listFdaInspections = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 25 } = req.query;
    const searchQuery = buildQuery(search, ["inspectionId", "feiNumber", "legalName", "classification", "productType", "country", "city", "state"]);
    const filters = buildFieldFilters(req.query, {
      productType: "productType",
      classification: "classification",
      country: "country",
      fiscalYear: "fiscalYear",
      projectArea: "projectArea",
    });
    const supplierFilter = await buildSupplierFdaFilter(req);
    const query = mergeQueries(supplierFilter, searchQuery, filters);
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
    const searchQuery = buildQuery(search, ["inspectionId", "feiNumber", "legalName", "programArea", "actCfrNumber", "shortDescription"]);
    const filters = buildFieldFilters(req.query, {
      programArea: "programArea",
      actCfrNumber: "actCfrNumber",
    });
    const supplierFilter = await buildSupplierFdaFilter(req);
    const query = mergeQueries(supplierFilter, searchQuery, filters);
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
    const searchQuery = buildQuery(search, ["recordId", "feiNumber", "legalName", "recordType"]);
    const filters = buildFieldFilters(req.query, {
      recordType: "recordType",
    });
    const supplierFilter = await buildSupplierFdaFilter(req);
    const query = mergeQueries(supplierFilter, searchQuery, filters);
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
