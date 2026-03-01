import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { Capa } from "../models/capaModel.js";
import FdaCitation from "../models/fdaCitationModel.js";
import { User } from "../models/userModel.js";
import { getTenantAiMetricsSummary } from "../services/aiActionMetricService.js";
import { buildSupplierFdaFilter } from "../utils/fdaScope.js";

const normalizeAuditStatus = (audit) => {
  const raw = (audit?.high_status || audit?.trackStatus || "").toLowerCase();
  if (raw.includes("schedule")) return "SCHEDULED";
  if (raw.includes("draft")) return "REPORT_DRAFT";
  if (raw.includes("complete") || raw.includes("closed")) return "COMPLETED";
  if (raw.includes("archive")) return "ARCHIVED";
  if (raw.includes("pending")) return "PENDING";
  return "IN_PROGRESS";
};

const isOverdue = (audit) => {
  if (!audit?.complianceDate) return false;
  const due = new Date(audit.complianceDate).getTime();
  return Number.isFinite(due) && due < Date.now();
};

const buildAuditQueueItems = (audits, label) =>
  audits
    .map((a) => {
      const dueDate = a.complianceDate ? new Date(a.complianceDate) : null;
      const overdue = isOverdue(a);
      const status = normalizeAuditStatus(a);
      return {
        type: "audit",
        auditId: a._id,
        label,
        status,
        dueDate,
        priority: overdue ? 1 : 0,
        updatedAt: a.updatedAt,
      };
    })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 10);

const aggregateAuditKPIs = (audits) => {
  const counts = {
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    reportDraft: 0,
  };
  audits.forEach((a) => {
    const status = normalizeAuditStatus(a);
    if (status === "SCHEDULED") counts.scheduled += 1;
    else if (status === "COMPLETED") counts.completed += 1;
    else if (status === "REPORT_DRAFT") counts.reportDraft += 1;
    else counts.inProgress += 1;
    if (isOverdue(a)) counts.overdue += 1;
  });
  return counts;
};

const summarizeAuditDurations = (audits = []) => {
  const durationsMs = (Array.isArray(audits) ? audits : [])
    .map((audit) => {
      const created = new Date(audit?.createdAt || 0).getTime();
      const updated = new Date(audit?.updatedAt || 0).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(updated) || created <= 0 || updated <= 0) {
        return null;
      }
      if (updated < created) return null;
      return updated - created;
    })
    .filter((value) => Number.isFinite(value));
  if (!durationsMs.length) {
    return { avgHours: 0, maxHours: 0 };
  }
  const total = durationsMs.reduce((sum, value) => sum + value, 0);
  return {
    avgHours: Math.round((total / durationsMs.length / (1000 * 60 * 60)) * 10) / 10,
    maxHours: Math.round((Math.max(...durationsMs) / (1000 * 60 * 60)) * 10) / 10,
  };
};

const tenantScopeFilter = (req) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  if (!tenantId) return null;
  return {
    $or: [
      { tenantOrgId: tenantId },
      { tenantOrgId: null },
      { tenantOrgId: { $exists: false } },
    ],
  };
};

const applyTenantScope = (req, baseFilter = {}) => {
  const scope = tenantScopeFilter(req);
  if (!scope) return baseFilter;
  return { $and: [baseFilter, scope] };
};

const summarizeCapas = (capas) => {
  const counts = {
    open: 0,
    overdue: 0,
    awaitingReview: 0,
    closed: 0,
  };
  const queue = [];
  capas.forEach((c) => {
    const overdue = c.targetDate ? new Date(c.targetDate).getTime() < Date.now() : false;
    if (["CLOSED", "APPROVED"].includes(c.status)) counts.closed += 1;
    else counts.open += 1;
    if (overdue || c.status === "OVERDUE") counts.overdue += 1;
    if (["IN_REVIEW", "REWORK_REQUESTED", "APPROVED"].includes(c.status)) counts.awaitingReview += 1;
    queue.push({
      type: "capa",
      capaId: c._id,
      status: c.status,
      targetDate: c.targetDate,
      updatedAt: c.lastActivityAt || c.updatedAt,
      priority: overdue ? 1 : 0,
    });
  });
  queue.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return { counts, queue: queue.slice(0, 10) };
};

export const buyerDashboardSummary = async (req, res) => {
  try {
    const userFilter = { create_by_buyer_id: req.user?._id };
    let audits = await AuditRequestMaster.find(applyTenantScope(req, userFilter)).select(
      "high_status trackStatus complianceDate updatedAt supplier_id auditor_id site_id"
    );
    if (!audits.length && tenantScopeFilter(req)) {
      audits = await AuditRequestMaster.find(userFilter).select(
        "high_status trackStatus complianceDate updatedAt supplier_id auditor_id site_id"
      );
    }
    const capas = await Capa.find(applyTenantScope(req)).select("status targetDate updatedAt lastActivityAt");

    const auditKPIs = aggregateAuditKPIs(audits);
    const capaSummary = summarizeCapas(capas);
    const workQueue = buildAuditQueueItems(audits, "Audit");
    const supplierIds = new Set(audits.map((a) => String(a.supplier_id || ""))).size;

    return res.json({
      success: true,
      data: {
        kpiCounts: {
          audits: auditKPIs,
          issues: { open: 0, overdue: 0, pendingReview: 0, critical: 0 },
          capas: capaSummary.counts,
          suppliers: { active: supplierIds, highRisk: 0, repeatIssues: 0 },
        },
        workQueue: [...capaSummary.queue, ...workQueue].slice(0, 10),
        recentActivity: audits
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((a) => ({
            auditId: a._id,
            status: normalizeAuditStatus(a),
            updatedAt: a.updatedAt,
            dueDate: a.complianceDate,
          })),
      },
    });
  } catch (error) {
    console.error("buyerDashboardSummary error", error);
    return res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

export const auditorDashboardSummary = async (req, res) => {
  try {
    const userFilter = { auditor_id: req.user?._id };
    let audits = await AuditRequestMaster.find(applyTenantScope(req, userFilter)).select(
      "high_status trackStatus complianceDate updatedAt supplier_id create_by_buyer_id site_id"
    );
    if (!audits.length && tenantScopeFilter(req)) {
      audits = await AuditRequestMaster.find(userFilter).select(
        "high_status trackStatus complianceDate updatedAt supplier_id create_by_buyer_id site_id"
      );
    }
    const capas = await Capa.find(applyTenantScope(req, { auditorId: req.user?._id })).select(
      "status targetDate updatedAt lastActivityAt"
    );

    const auditKPIs = aggregateAuditKPIs(audits);
    const capaSummary = summarizeCapas(capas);
    const workQueue = buildAuditQueueItems(audits, "Assigned Audit");

    return res.json({
      success: true,
      data: {
        kpiCounts: {
          audits: auditKPIs,
          issues: { open: 0, overdue: 0, pendingReview: 0, needsSupplier: 0 },
          capas: capaSummary.counts,
        },
        workQueue: [...capaSummary.queue, ...workQueue].slice(0, 10),
        recentActivity: audits
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((a) => ({
            auditId: a._id,
            status: normalizeAuditStatus(a),
            updatedAt: a.updatedAt,
            dueDate: a.complianceDate,
          })),
      },
    });
  } catch (error) {
    console.error("auditorDashboardSummary error", error);
    return res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

export const supplierDashboardSummary = async (req, res) => {
  try {
    const userFilter = { supplier_id: req.user?._id };
    let audits = await AuditRequestMaster.find(applyTenantScope(req, userFilter)).select(
      "high_status trackStatus complianceDate updatedAt supplier_id create_by_buyer_id site_id"
    );
    if (!audits.length && tenantScopeFilter(req)) {
      audits = await AuditRequestMaster.find(userFilter).select(
        "high_status trackStatus complianceDate updatedAt supplier_id create_by_buyer_id site_id"
      );
    }

    const auditKPIs = aggregateAuditKPIs(audits);
    const workQueue = buildAuditQueueItems(audits, "Assigned Audit");

    return res.json({
      success: true,
      data: {
        kpiCounts: {
          audits: auditKPIs,
          issues: { open: 0, overdue: 0, pendingSupplier: 0 },
          questionnaires: { open: 0, inProgress: 0, overdue: 0 },
        },
        workQueue: workQueue.slice(0, 10),
        recentActivity: audits
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((a) => ({
            auditId: a._id,
            status: normalizeAuditStatus(a),
            updatedAt: a.updatedAt,
            dueDate: a.complianceDate,
          })),
      },
    });
  } catch (error) {
    console.error("supplierDashboardSummary error", error);
    return res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

export const adminDashboardSummary = async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || null;
    const userFilter = req.user?.role === "superadmin" ? {} : { tenant_id: tenantId };
    const tenantFilter = req.user?.role === "superadmin" ? {} : applyTenantScope(req);
    const [users, audits, capas, aiMetrics] = await Promise.all([
      User.find(userFilter).select("status role"),
      AuditRequestMaster.find(tenantFilter).select("high_status trackStatus createdAt updatedAt complianceDate"),
      Capa.find(tenantFilter).select("status targetDate updatedAt lastActivityAt"),
      getTenantAiMetricsSummary({ tenantId, days: 30 }),
    ]);

    const userCounts = {
      active: users.filter((u) => u.status === "ACTIVE").length,
      pendingInvites: users.filter((u) => u.status !== "ACTIVE").length,
      locked: users.filter((u) => u.status === "DISABLED").length,
    };
    const auditKPIs = aggregateAuditKPIs(audits);
    const auditDuration = summarizeAuditDurations(audits);
    const capaSummary = summarizeCapas(capas);
    const workQueue = buildAuditQueueItems(audits, "Audit");

    return res.json({
      success: true,
      data: {
        kpiCounts: {
          users: userCounts,
          audits: auditKPIs,
          auditDuration,
          capas: capaSummary.counts,
          aiUsage: {
            actions: aiMetrics?.totals?.actions || 0,
            success: aiMetrics?.totals?.successes || 0,
            failures: aiMetrics?.totals?.errors || 0,
            avgDurationMs: Math.round(aiMetrics?.totals?.avgDurationMs || 0),
          },
          notifications: { sent7d: 0, failures: 0 },
          storage: { evidenceCount: 0, sizeMb: 0 },
        },
        aiMetrics,
        workQueue: [...capaSummary.queue, ...workQueue].slice(0, 10),
        recentActivity: audits
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 10)
          .map((a) => ({
            auditId: a._id,
            status: normalizeAuditStatus(a),
            updatedAt: a.updatedAt,
            dueDate: a.complianceDate,
          })),
      },
    });
  } catch (error) {
    console.error("adminDashboardSummary error", error);
    return res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

export const dashboardDrilldown = async (req, res) => {
  try {
    const { kpiKey, dimension, value, limit } = req.body || {};
    if (!kpiKey) {
      return res.status(400).json({ success: false, message: "kpiKey is required" });
    }

    if (kpiKey === "fda.citations") {
      if (dimension && dimension !== "actCfrNumber") {
        return res.status(400).json({ success: false, message: "Unsupported dimension" });
      }
      const baseFilter = value ? { actCfrNumber: value } : {};
      const supplierFilter = await buildSupplierFdaFilter(req);
      const filter = supplierFilter
        ? { $and: [supplierFilter, Object.keys(baseFilter).length ? baseFilter : null].filter(Boolean) }
        : baseFilter;
      const cappedLimit = Number.isFinite(Number(limit)) ? Math.min(Number(limit), 1000) : 500;
      const rows = await FdaCitation.find(filter)
        .limit(cappedLimit)
        .select("inspectionId feiNumber legalName inspectionEndDate programArea actCfrNumber shortDescription")
        .lean();
      return res.json({
        success: true,
        data: {
          rows,
          totals: {
            count: rows.length,
          },
        },
      });
    }

    return res.status(400).json({ success: false, message: "Unsupported drilldown request" });
  } catch (error) {
    console.error("dashboardDrilldown error", error);
    return res.status(500).json({ success: false, message: "Failed to load drilldown data" });
  }
};
