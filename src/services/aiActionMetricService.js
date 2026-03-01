import mongoose from "mongoose";
import { AiActionMetric } from "../models/aiActionMetricModel.js";

const toTenantId = (value) => (value === undefined || value === null ? "" : String(value));

const toObjectIdIfValid = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const recordAiActionMetric = async ({
  tenantId,
  auditId = null,
  actionKey,
  userId = null,
  userRole = "",
  status = "success",
  inputCount = 0,
  outputCount = 0,
  durationMs = 0,
  metadata = {},
}) => {
  const normalizedTenantId = toTenantId(tenantId);
  if (!normalizedTenantId || !actionKey) return null;
  try {
    return await AiActionMetric.create({
      tenantId: normalizedTenantId,
      auditId: toObjectIdIfValid(auditId),
      actionKey: String(actionKey),
      userId: toObjectIdIfValid(userId),
      userRole: String(userRole || ""),
      status: status === "error" ? "error" : "success",
      inputCount: toNumber(inputCount, 0),
      outputCount: toNumber(outputCount, 0),
      durationMs: Math.max(0, toNumber(durationMs, 0)),
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    });
  } catch (error) {
    console.warn("recordAiActionMetric failed", error?.message || error);
    return null;
  }
};

const buildTenantFilter = ({ tenantId, fromDate = null }) => {
  const filter = { tenantId: toTenantId(tenantId) };
  if (fromDate) {
    filter.createdAt = { $gte: fromDate };
  }
  return filter;
};

export const getTenantAiMetricsSummary = async ({ tenantId, days = 30 }) => {
  const normalizedTenantId = toTenantId(tenantId);
  if (!normalizedTenantId) {
    return {
      totals: {
        actions: 0,
        successes: 0,
        errors: 0,
        avgDurationMs: 0,
        totalDurationMs: 0,
        inputCount: 0,
        outputCount: 0,
      },
      byAction: [],
      topSlowActions: [],
    };
  }
  const windowDays = Math.max(1, Math.min(Number(days) || 30, 180));
  const fromDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const filter = buildTenantFilter({ tenantId: normalizedTenantId, fromDate });

  const [totalsAgg, byActionAgg] = await Promise.all([
    AiActionMetric.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          actions: { $sum: 1 },
          successes: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, 1, 0],
            },
          },
          errors: {
            $sum: {
              $cond: [{ $eq: ["$status", "error"] }, 1, 0],
            },
          },
          totalDurationMs: { $sum: "$durationMs" },
          avgDurationMs: { $avg: "$durationMs" },
          inputCount: { $sum: "$inputCount" },
          outputCount: { $sum: "$outputCount" },
        },
      },
    ]),
    AiActionMetric.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$actionKey",
          count: { $sum: 1 },
          successes: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, 1, 0],
            },
          },
          errors: {
            $sum: {
              $cond: [{ $eq: ["$status", "error"] }, 1, 0],
            },
          },
          avgDurationMs: { $avg: "$durationMs" },
          totalDurationMs: { $sum: "$durationMs" },
          inputCount: { $sum: "$inputCount" },
          outputCount: { $sum: "$outputCount" },
          lastRunAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]),
  ]);

  const totals = totalsAgg?.[0] || {};
  const byAction = (byActionAgg || []).map((item) => ({
    actionKey: item._id,
    count: Number(item.count || 0),
    successes: Number(item.successes || 0),
    errors: Number(item.errors || 0),
    avgDurationMs: Number(item.avgDurationMs || 0),
    totalDurationMs: Number(item.totalDurationMs || 0),
    inputCount: Number(item.inputCount || 0),
    outputCount: Number(item.outputCount || 0),
    lastRunAt: item.lastRunAt || null,
  }));
  const topSlowActions = [...byAction]
    .sort((left, right) => right.avgDurationMs - left.avgDurationMs)
    .slice(0, 5);

  return {
    totals: {
      actions: Number(totals.actions || 0),
      successes: Number(totals.successes || 0),
      errors: Number(totals.errors || 0),
      avgDurationMs: Number(totals.avgDurationMs || 0),
      totalDurationMs: Number(totals.totalDurationMs || 0),
      inputCount: Number(totals.inputCount || 0),
      outputCount: Number(totals.outputCount || 0),
    },
    byAction,
    topSlowActions,
    windowDays,
  };
};
