import mongoose from "mongoose";
import { SupplierPublicSignal } from "../models/SupplierPublicSignal.js";
import { SupplierRiskMetrics } from "../models/SupplierRiskMetrics.js";
import { SupplierRiskEvent } from "../models/SupplierRiskEvent.js";
import { SupplierNetworkLink } from "../models/SupplierNetworkLink.js";
import { EvidenceFinding } from "../models/EvidenceFinding.js";
import { enqueueRiskRecalc, enqueueRiskRecalcBatch } from "../jobs/riskQueue.js";

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

export const getPublicSignals = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const doc = await SupplierPublicSignal.findOne({ supplierId }).lean();
    return res.json({ success: true, data: doc || null });
  } catch (error) {
    console.error("[risk] get public signals", error);
    return res.status(500).json({ error: "Failed to load public signals" });
  }
};

export const updatePublicSignals = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });

    const update = { ...req.body, supplierId, updatedBy: req.user?._id };
    const doc = await SupplierPublicSignal.findOneAndUpdate({ supplierId }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    await SupplierRiskEvent.create({
      supplierId,
      eventType: "PUBLIC_SIGNAL_UPDATED",
      eventAt: new Date(),
      payload: { fields: Object.keys(req.body || {}) },
      createdBy: req.user?._id,
    });

    const snapshot = await enqueueRiskRecalc({
      supplierId,
      actorUserId: req.user?._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId: `public-signals-${Date.now()}`,
    });

    return res.json({ success: true, data: doc, snapshot });
  } catch (error) {
    console.error("[risk] update public signals", error);
    return res.status(500).json({ error: "Failed to update public signals" });
  }
};

export const getRiskMetrics = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const doc = await SupplierRiskMetrics.findOne({ supplierId }).lean();
    return res.json({ success: true, data: doc || null });
  } catch (error) {
    console.error("[risk] get risk metrics", error);
    return res.status(500).json({ error: "Failed to load risk metrics" });
  }
};

export const updateRiskMetrics = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const update = { ...req.body, supplierId, updatedBy: req.user?._id };
    const doc = await SupplierRiskMetrics.findOneAndUpdate({ supplierId }, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    await SupplierRiskEvent.create({
      supplierId,
      eventType: "MANUAL_OVERRIDE",
      eventAt: new Date(),
      payload: { fields: Object.keys(req.body || {}) },
      createdBy: req.user?._id,
    });

    const snapshot = await enqueueRiskRecalc({
      supplierId,
      actorUserId: req.user?._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId: `risk-metrics-${Date.now()}`,
    });

    return res.json({ success: true, data: doc, snapshot });
  } catch (error) {
    console.error("[risk] update metrics", error);
    return res.status(500).json({ error: "Failed to update risk metrics" });
  }
};

export const recalcSupplier = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const snapshot = await enqueueRiskRecalc({
      supplierId,
      actorUserId: req.user?._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId: `recalc-${Date.now()}`,
    });
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error("[risk] recalc supplier", error);
    return res.status(500).json({ error: "Failed to recalculate risk" });
  }
};

export const recalcBulk = async (req, res) => {
  try {
    const { supplierIds = [], updatedSinceDays = 7 } = req.body || {};
    let targetIds = Array.isArray(supplierIds) ? supplierIds.filter(Boolean) : [];
    if (!targetIds.length) {
      const sinceDate = new Date(Date.now() - Number(updatedSinceDays || 7) * 24 * 60 * 60 * 1000);
      const [metrics, signals] = await Promise.all([
        SupplierRiskMetrics.find({ updatedAt: { $gte: sinceDate } }).select("supplierId").lean(),
        SupplierPublicSignal.find({ updatedAt: { $gte: sinceDate } }).select("supplierId").lean(),
      ]);
      const unique = new Set();
      metrics.forEach((item) => unique.add(String(item.supplierId)));
      signals.forEach((item) => unique.add(String(item.supplierId)));
      targetIds = Array.from(unique);
    }
    const correlationId = `recalc-bulk-${Date.now()}`;
    const payloads = targetIds.map((supplierId) => ({
      supplierId,
      actorUserId: req.user?._id,
      eventType: "MANUAL_OVERRIDE",
      correlationId,
    }));
    const enqueued = enqueueRiskRecalcBatch(payloads);
    return res.json({ success: true, data: { enqueued, updatedSinceDays } });
  } catch (error) {
    console.error("[risk] recalc bulk", error);
    return res.status(500).json({ error: "Failed to enqueue recalculation" });
  }
};

export const getRiskEvents = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const limit = Math.min(Number(req.query?.limit || 100), 200);
    const events = await SupplierRiskEvent.find({ supplierId })
      .sort({ eventAt: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data: events });
  } catch (error) {
    console.error("[risk] events", error);
    return res.status(500).json({ error: "Failed to load risk events" });
  }
};

export const bulkNetworkLinks = async (req, res) => {
  try {
    const links = Array.isArray(req.body?.links) ? req.body.links : [];
    const results = [];
    for (const link of links) {
      const fromSupplierId = toObjectId(link.fromSupplierId);
      const toSupplierId = toObjectId(link.toSupplierId);
      if (!fromSupplierId || !toSupplierId) continue;
      const updated = await SupplierNetworkLink.findOneAndUpdate(
        { fromSupplierId, toSupplierId, linkType: link.linkType },
        {
          fromSupplierId,
          toSupplierId,
          linkType: link.linkType,
          strength: link.strength,
          evidenceRef: link.evidenceRef,
          updatedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(updated);
    }
    return res.json({ success: true, data: results });
  } catch (error) {
    console.error("[risk] network links", error);
    return res.status(500).json({ error: "Failed to update network links" });
  }
};

export const getNetworkLinks = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const links = await SupplierNetworkLink.find({ fromSupplierId: supplierId }).lean();
    return res.json({ success: true, data: links });
  } catch (error) {
    console.error("[risk] get network links", error);
    return res.status(500).json({ error: "Failed to load network links" });
  }
};

export const createEvidenceFinding = async (req, res) => {
  try {
    const supplierId = toObjectId(req.body?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const finding = await EvidenceFinding.create({
      supplierId,
      documentId: req.body?.documentId,
      findingType: req.body?.findingType,
      severity: req.body?.severity,
      note: req.body?.note,
      createdBy: req.user?._id,
    });
    return res.status(201).json({ success: true, data: finding });
  } catch (error) {
    console.error("[risk] create evidence finding", error);
    return res.status(500).json({ error: "Failed to create evidence finding" });
  }
};

export const getEvidenceFindings = async (req, res) => {
  try {
    const supplierId = toObjectId(req.params?.supplierId);
    if (!supplierId) return res.status(400).json({ error: "Invalid supplier id" });
    const findings = await EvidenceFinding.find({ supplierId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: findings });
  } catch (error) {
    console.error("[risk] evidence findings", error);
    return res.status(500).json({ error: "Failed to load evidence findings" });
  }
};
