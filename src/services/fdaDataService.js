const FDA_API_BASE = process.env.FDA_API_BASE || "https://api-datadashboard.fda.gov/v1";
const FDA_AUTH_USER = process.env.FDA_AUTH_USER;
const FDA_AUTH_KEY = process.env.FDA_AUTH_KEY;

import FdaInspection from "../models/fdaInspectionModel.js";
import FdaCitation from "../models/fdaCitationModel.js";
import Fda483 from "../models/fda483Model.js";
import FdaDashboardSnapshot from "../models/fdaDashboardSnapshotModel.js";

const normalize = (val) => (val === undefined || val === null ? "" : String(val).trim());

const apiHeaders = () => {
  if (!FDA_AUTH_USER || !FDA_AUTH_KEY) {
    throw new Error("FDA_AUTH_USER and FDA_AUTH_KEY must be set");
  }
  return {
    "Content-Type": "application/json",
    "Authorization-User": FDA_AUTH_USER,
    "Authorization-Key": FDA_AUTH_KEY,
  };
};

const fetchAll = async (endpoint) => {
  const rows = [];
  let start = 1;
  const pageSize = 5000;
  while (true) {
    const body = {
      returntotalcount: false,
      sort: "",
      sortorder: "",
      filters: {},
      columns: [],
      start,
      rows: pageSize,
    };
    const res = await fetch(`${FDA_API_BASE}/${endpoint}`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FDA API ${endpoint} failed (${res.status}): ${text}`);
    }
    const json = await res.json();
    const batch = json.result || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }
  return rows;
};

const mapInspection = (row) => ({
  inspectionId: normalize(row.InspectionID),
  feiNumber: normalize(row.FEINumber),
  legalName: normalize(row.LegalName),
  city: normalize(row.City),
  state: normalize(row.State || row.StateCode),
  zip: normalize(row.ZipCode),
  country: normalize(row.CountryName),
  fiscalYear: normalize(row.FiscalYear),
  postedCitations: normalize(row.PostedCitations),
  inspectionEndDate: normalize(row.InspectionEndDate),
  classification: normalize(row.Classification),
  projectArea: normalize(row.ProjectArea),
  productType: normalize(row.ProductType),
  additionalInfo: normalize(row.AdditionalDetails),
});

const mapCitation = (row) => ({
  inspectionId: normalize(row.InspectionID),
  feiNumber: normalize(row.FEINumber),
  legalName: normalize(row.LegalName),
  inspectionEndDate: normalize(row.InspectionEndDate),
  programArea: normalize(row.ProgramArea),
  actCfrNumber: normalize(row.ActCFRNumber),
  shortDescription: normalize(row.ShortDescription || row.LongDescription),
});

const chunkInsert = async (Model, docs, chunkSize = 5000) => {
  for (let i = 0; i < docs.length; i += chunkSize) {
    const slice = docs.slice(i, i + chunkSize);
    if (slice.length) {
      await Model.insertMany(slice, { ordered: false });
    }
  }
};

const buildDashboardStats = async () => {
  const inspections = await FdaInspection.find({}, { productType: 1, classification: 1, fiscalYear: 1, country: 1 }).lean();
  const citations = await FdaCitation.find({}, { actCfrNumber: 1, shortDescription: 1 }).lean();
  const forms483 = await Fda483.estimatedDocumentCount();

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
      forms483,
    },
    classificationByProductType,
    classificationByYear,
    regionByYear,
    topCitations,
  };
};

export const updateFdaData = async ({ truncate = true } = {}) => {
  if (!FDA_AUTH_USER || !FDA_AUTH_KEY) {
    throw new Error("Missing FDA auth configuration");
  }

  if (truncate) {
    await Promise.all([
      FdaInspection.deleteMany({}),
      FdaCitation.deleteMany({}),
      Fda483.deleteMany({}),
    ]);
  }

  const [inspectionRows, citationRows] = await Promise.all([
    fetchAll("inspections_classifications"),
    fetchAll("inspections_citations"),
  ]);

  const inspections = inspectionRows.map(mapInspection).filter((r) => r.inspectionId);
  const citations = citationRows.map(mapCitation).filter((r) => r.inspectionId || r.feiNumber);

  if (inspections.length) await chunkInsert(FdaInspection, inspections);
  if (citations.length) await chunkInsert(FdaCitation, citations);
  // Published 483s endpoint is not exposed in the DDAPI payload; keep collection empty for now.

  const stats = await buildDashboardStats();
  const snapshot = await FdaDashboardSnapshot.create({ stats });
  return { snapshot, counts: { inspections: inspections.length, citations: citations.length, forms483: 0 } };
};

export const getLatestDashboardSnapshot = async () => {
  const snap = await FdaDashboardSnapshot.findOne().sort({ createdAt: -1 }).lean();
  return snap;
};

export const rebuildFdaSnapshot = async () => {
  const stats = await buildDashboardStats();
  return FdaDashboardSnapshot.create({ stats });
};
