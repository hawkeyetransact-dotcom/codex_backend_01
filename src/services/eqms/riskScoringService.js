import mongoose from "mongoose";
import { CAPARiskIndicator } from "../../models/CAPARiskIndicator.js";
import { listOpenCapasForRisk } from "./eqmsSyncService.js";

const SCORE_WEIGHTS = Object.freeze({
  CRITICAL: 20,
  MAJOR: 10,
  MINOR: 5,
  RECURRING: 30,
  OVERDUE: 15,
});

const normalizeSeverity = (value) => String(value || "").trim().toUpperCase();

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const isOverdueOpen = (record, now = new Date()) => {
  if (!record?.isOpen) return false;
  if (!record?.dueDate) return false;
  const dueDate = record.dueDate instanceof Date ? record.dueDate : new Date(record.dueDate);
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate < now;
};

export const resolveRiskLevel = (score) => {
  const safeScore = Number(score || 0);
  if (safeScore >= 100) return "CRITICAL";
  if (safeScore >= 60) return "HIGH";
  if (safeScore >= 30) return "MEDIUM";
  return "LOW";
};

export const computeCapaRiskScore = ({ records = [], now = new Date() } = {}) => {
  let score = 0;
  let openCAPACount = 0;
  let criticalCAPACount = 0;

  const categoryCounter = new Map();
  let overdueCAPAFlag = false;

  records.forEach((record) => {
    if (!record?.isOpen) return;
    openCAPACount += 1;

    const severity = normalizeSeverity(record.severity);
    if (severity === "CRITICAL") {
      criticalCAPACount += 1;
      score += SCORE_WEIGHTS.CRITICAL;
    } else if (severity === "MAJOR") {
      score += SCORE_WEIGHTS.MAJOR;
    } else if (severity === "MINOR") {
      score += SCORE_WEIGHTS.MINOR;
    }

    const categoryKey = String(record.riskCategory || "GENERAL").trim().toUpperCase();
    categoryCounter.set(categoryKey, (categoryCounter.get(categoryKey) || 0) + 1);

    if (isOverdueOpen(record, now)) overdueCAPAFlag = true;
  });

  const recurringCAPAFlag = Array.from(categoryCounter.values()).some((count) => count >= 2);
  if (recurringCAPAFlag) score += SCORE_WEIGHTS.RECURRING;
  if (overdueCAPAFlag) score += SCORE_WEIGHTS.OVERDUE;

  const riskLevel = resolveRiskLevel(score);

  return {
    openCAPACount,
    criticalCAPACount,
    recurringCAPAFlag,
    overdueCAPAFlag,
    riskScore: score,
    riskLevel,
    breakdown: {
      severityWeights: SCORE_WEIGHTS,
      recurringCategoryCount: Array.from(categoryCounter.entries())
        .filter(([, count]) => count >= 2)
        .length,
    },
  };
};

export const recalculateCAPARiskIndicator = async ({ tenantId, supplierId, siteId } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  if (!supplierId) throw new Error("supplierId is required");

  const sources = await listOpenCapasForRisk({ tenantId, supplierId, siteId });
  const computed = computeCapaRiskScore({ records: sources.combined });

  const doc = await CAPARiskIndicator.findOneAndUpdate(
    {
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: toObjectIdOrNull(supplierId),
      siteId: toObjectIdOrNull(siteId),
    },
    {
      $set: {
        tenantId: toObjectIdOrNull(tenantId),
        supplierId: toObjectIdOrNull(supplierId),
        siteId: toObjectIdOrNull(siteId),
        ...computed,
        sourceCounts: {
          internalCAPACount: sources.internal.length,
          externalCAPACount: sources.external.length,
        },
        modelVersion: "eqms-v1",
        computedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return doc.toObject();
};

export const listCAPARiskIndicators = async ({ tenantId, supplierId, siteId, riskLevel, page = 1, limit = 100 } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  const query = { tenantId: toObjectIdOrNull(tenantId) };
  if (supplierId) query.supplierId = toObjectIdOrNull(supplierId);
  if (siteId) query.siteId = toObjectIdOrNull(siteId);
  if (riskLevel) query.riskLevel = String(riskLevel).toUpperCase();

  const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
  const safePage = Math.max(1, Number(page || 1));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    CAPARiskIndicator.find(query).sort({ riskScore: -1, computedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    CAPARiskIndicator.countDocuments(query),
  ]);

  return { items, total, page: safePage, limit: safeLimit };
};
