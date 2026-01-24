import { MonitoringSignal } from "../models/monitoringSignalModel.js";

const buildFilter = (req) => {
  const { auditId, siteId, status, severity, source } = req.query || {};
  const filter = {};
  if (req.tenantId) filter.tenantId = req.tenantId;
  if (auditId) filter.auditId = auditId;
  if (siteId) filter.siteId = siteId;
  if (status) filter.status = { $in: String(status).split(",").map((s) => s.trim()).filter(Boolean) };
  if (severity) filter.severity = { $in: String(severity).split(",").map((s) => s.trim()).filter(Boolean) };
  if (source) filter.source = source;
  return filter;
};

export const listMonitoringSignals = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const filter = buildFilter(req);
    const [items, total] = await Promise.all([
      MonitoringSignal.find(filter)
        .sort({ detectedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      MonitoringSignal.countDocuments(filter),
    ]);
    return res.json({ success: true, data: items, meta: { total, page, limit: pageSize } });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load monitoring signals" });
  }
};

export const createMonitoringSignal = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const payload = req.body || {};
    const signal = await MonitoringSignal.create({
      ...payload,
      tenantId: req.tenantId,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    return res.status(201).json({ success: true, data: signal });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to create monitoring signal" });
  }
};
