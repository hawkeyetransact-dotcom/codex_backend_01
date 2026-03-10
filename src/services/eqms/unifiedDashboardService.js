import mongoose from "mongoose";
import { InternalCAPAReference } from "../../models/InternalCAPAReference.js";
import { ExternalCAPA } from "../../models/ExternalCAPA.js";
import { CAPARiskIndicator } from "../../models/CAPARiskIndicator.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const computeDaysDiff = (start, end) => {
  if (!start || !end) return null;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.max(0, Math.ceil((e.getTime() - s.getTime()) / 86400000));
};

export const getUnifiedCapaDashboard = async ({
  tenantId,
  supplierId,
  siteId,
  status,
  page = 1,
  limit = 100,
} = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  const tenantObjectId = toObjectIdOrNull(tenantId);

  const internalQuery = { tenantId: tenantObjectId };
  const externalQuery = { tenantId: tenantObjectId };
  if (supplierId) {
    internalQuery.supplierId = toObjectIdOrNull(supplierId);
    externalQuery.supplierId = toObjectIdOrNull(supplierId);
  }
  if (siteId) {
    internalQuery.siteId = toObjectIdOrNull(siteId);
    externalQuery.siteId = toObjectIdOrNull(siteId);
  }
  if (status) {
    internalQuery.status = status;
    externalQuery.status = status;
  }

  const [internalRows, externalRows] = await Promise.all([
    InternalCAPAReference.find(internalQuery).lean(),
    ExternalCAPA.find(externalQuery).lean(),
  ]);

  const merged = [
    ...internalRows.map((item) => ({
      id: `INT-${item.internalCapaId}`,
      source: "eQMS",
      capaId: item.externalCAPAId,
      externalSystem: item.externalSystem,
      supplierId: item.supplierId,
      siteId: item.siteId,
      severity: item.severity,
      status: item.status,
      openedDate: item.openedDate,
      dueDate: item.dueDate,
      closedDate: item.closedDate,
      riskCategory: item.riskCategory,
    })),
    ...externalRows.map((item) => ({
      id: `EXT-${item.externalCapaId}`,
      source: "Hawkeye",
      capaId: item.externalCapaId,
      externalSystem: "HAWKEYE",
      supplierId: item.supplierId,
      siteId: item.siteId,
      severity: item.severity,
      status: item.status,
      openedDate: item.createdDate,
      dueDate: item.dueDate,
      closedDate: item.closedDate,
      riskCategory: item.metadata?.riskCategory || "GENERAL",
    })),
  ].sort((a, b) => new Date(b.openedDate || 0).getTime() - new Date(a.openedDate || 0).getTime());

  const safeLimit = Math.min(500, Math.max(1, Number(limit || 100)));
  const safePage = Math.max(1, Number(page || 1));
  const start = (safePage - 1) * safeLimit;
  const items = merged.slice(start, start + safeLimit);

  return {
    items,
    total: merged.length,
    page: safePage,
    limit: safeLimit,
    counts: {
      internalCAPAs: internalRows.length,
      externalCAPAs: externalRows.length,
    },
  };
};

export const getAuditIntelligenceAnalytics = async ({ tenantId, top = 10 } = {}) => {
  if (!tenantId) throw new Error("tenantId is required");
  const tenantObjectId = toObjectIdOrNull(tenantId);
  const safeTop = Math.max(3, Math.min(50, Number(top || 10)));

  const [indicators, internalRows, externalRows] = await Promise.all([
    CAPARiskIndicator.find({ tenantId: tenantObjectId }).sort({ riskScore: -1 }).lean(),
    InternalCAPAReference.find({ tenantId: tenantObjectId }).lean(),
    ExternalCAPA.find({ tenantId: tenantObjectId }).lean(),
  ]);

  const supplierRate = new Map();
  const siteRate = new Map();

  [...internalRows, ...externalRows].forEach((row) => {
    const supplierKey = row.supplierId ? String(row.supplierId) : "UNKNOWN_SUPPLIER";
    supplierRate.set(supplierKey, (supplierRate.get(supplierKey) || 0) + 1);

    const siteKey = row.siteId ? String(row.siteId) : "UNKNOWN_SITE";
    siteRate.set(siteKey, (siteRate.get(siteKey) || 0) + 1);
  });

  const avgClosureInternal = internalRows
    .map((row) => computeDaysDiff(row.openedDate, row.closedDate))
    .filter((value) => value !== null);
  const avgClosureExternal = externalRows
    .map((row) => computeDaysDiff(row.createdDate, row.closedDate))
    .filter((value) => value !== null);

  const average = (items = []) => {
    if (!items.length) return 0;
    return Number((items.reduce((sum, value) => sum + value, 0) / items.length).toFixed(2));
  };

  return {
    topRiskySuppliers: indicators.slice(0, safeTop).map((item) => ({
      supplierId: item.supplierId,
      siteId: item.siteId,
      riskLevel: item.riskLevel,
      riskScore: item.riskScore,
    })),
    sitesWithHighestCapaRate: Array.from(siteRate.entries())
      .map(([siteId, count]) => ({ siteId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, safeTop),
    suppliersWithRecurringFindings: indicators
      .filter((item) => item.recurringCAPAFlag)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, safeTop)
      .map((item) => ({
        supplierId: item.supplierId,
        siteId: item.siteId,
        riskScore: item.riskScore,
      })),
    capaClosurePerformance: {
      internalAverageDays: average(avgClosureInternal),
      externalAverageDays: average(avgClosureExternal),
    },
    riskTrendBySupplier: indicators.slice(0, safeTop).map((item) => ({
      supplierId: item.supplierId,
      siteId: item.siteId,
      riskScore: item.riskScore,
      riskLevel: item.riskLevel,
      computedAt: item.computedAt,
    })),
    supplierComplianceScore: Array.from(supplierRate.entries())
      .map(([supplierId, eventCount]) => {
        const indicator = indicators.find((item) => String(item.supplierId) === String(supplierId));
        const riskScore = Number(indicator?.riskScore || 0);
        return {
          supplierId,
          eventCount,
          riskScore,
          complianceScore: Math.max(0, 100 - riskScore),
        };
      })
      .sort((a, b) => a.complianceScore - b.complianceScore)
      .slice(0, safeTop),
  };
};
