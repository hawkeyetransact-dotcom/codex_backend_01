import fs from "fs";
import multer from "multer";
import {
  PublicAction,
  PublicApi,
  PublicClaimRequest,
  PublicInspection,
  PublicSource,
  PublicSupplier,
  PublicUnmatched,
} from "../models/publicIntelModels.js";
import { runAll, runConnector } from "../services/publicIntel/index.js";
import { parseCsvBuffer } from "../services/publicIntel/utils/download.js";
import { normalizeName } from "../services/publicIntel/utils/normalize.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const manualUploadMiddleware = upload.single("file");

export const listSuppliers = async (req, res) => {
  const { query = "", country, signals } = req.query;
  const match = {};
  if (query) {
    match.$or = [
      { legal_name: new RegExp(query, "i") },
      { aliases: { $elemMatch: { $regex: query, $options: "i" } } },
    ];
  }
  if (country) match.country = country.toUpperCase();
  if (signals === "warning") match["signals.warning_letter_count"] = { $gt: 0 };
  if (signals === "import_alert") match["signals.import_alert_active"] = true;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PublicSupplier.find(match).sort({ legal_name: 1 }).skip(skip).limit(limit).lean(),
    PublicSupplier.countDocuments(match),
  ]);
  res.json({ data: items, total, page, limit });
};

export const getSupplier = async (req, res) => {
  const supplier = await PublicSupplier.findById(req.params.id).lean();
  if (!supplier) return res.status(404).json({ error: "Not found" });
  const inspections = await PublicInspection.find({ supplier_id: supplier._id }).lean();
  const actions = await PublicAction.find({ supplier_id: supplier._id }).lean();
  res.json({ data: { supplier, inspections, actions } });
};

export const listApis = async (req, res) => {
  const { query = "" } = req.query;
  const match = {};
  if (query) match.api_name = new RegExp(query, "i");
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PublicApi.find(match).sort({ api_name: 1 }).skip(skip).limit(limit).lean(),
    PublicApi.countDocuments(match),
  ]);
  res.json({ data: items, total, page, limit });
};

export const getApi = async (req, res) => {
  const api = await PublicApi.findById(req.params.id).lean();
  if (!api) return res.status(404).json({ error: "Not found" });
  res.json({ data: api });
};

export const listInspections = async (req, res) => {
  const { supplierId, siteId } = req.query;
  const match = {};
  if (supplierId) match.supplier_id = supplierId;
  if (siteId) match.site_id = siteId;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PublicInspection.find(match).sort({ inspection_date: -1 }).skip(skip).limit(limit).lean(),
    PublicInspection.countDocuments(match),
  ]);
  res.json({ data: items, total, page, limit });
};

export const listActions = async (req, res) => {
  const { supplierId, type } = req.query;
  const match = {};
  if (supplierId) match.supplier_id = supplierId;
  if (type) match.type = type;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    PublicAction.find(match).sort({ date: -1 }).skip(skip).limit(limit).lean(),
    PublicAction.countDocuments(match),
  ]);
  res.json({ data: items, total, page, limit });
};

export const createClaimRequest = async (req, res) => {
  const { supplier_id, request_type, requester_email, message } = req.body || {};
  if (!supplier_id || !request_type || !requester_email) {
    return res.status(400).json({ error: "supplier_id, request_type, requester_email are required" });
  }
  const item = await PublicClaimRequest.create({
    supplier_id,
    request_type,
    requester_email,
    message,
  });
  res.json({ data: item });
};

export const adminRunSync = async (req, res) => {
  try {
    const { source } = req.body || {};
    const result = source ? await runConnector(source) : await runAll();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const adminUpload = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });
  // Basic manual upload parses CSV and adds as unmatched stash for review
  const rows = await parseCsvBuffer(req.file.buffer);
  const source = await PublicSource.findOneAndUpdate(
    { name: "manualUpload" },
    { name: "manualUpload", source_url: "manual", last_run_at: new Date(), format: "csv" },
    { upsert: true, new: true }
  );
  for (const row of rows) {
    await PublicUnmatched.create({ source_name: "manualUpload", raw_row: row, reason: "manual_upload" });
  }
  source.last_success_at = new Date();
  source.stats = { rows_ingested: rows.length };
  await source.save();
  res.json({ success: true, rows: rows.length });
};
