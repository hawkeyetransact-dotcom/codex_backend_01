/**
 * Org Admin (Hawkeye internal) — controller.
 *
 * Cross-tenant admin tooling. ONLY accessible to users with adminScope=PLATFORM.
 *
 * In production, also IP-restricted at the route level (see orgAdminRoutes.js).
 */
import Tenant from "../models/tenantModel.js";
import { User } from "../models/userModel.js";
import { AgentUsageEvent } from "../models/agentUsageEventModel.js";
import { computeRoi } from "../services/ai/governance/roiCalculator.js";

function requirePlatformAdmin(req, res) {
  if (req.user?.adminScope !== "PLATFORM" && req.user?.role !== "superadmin") {
    res.status(403).json({ error: "platform_admin_required" });
    return false;
  }
  return true;
}

/**
 * GET /api/internal-admin/tenants
 * Cross-tenant tenant list with seat counts and last-activity.
 */
export async function listTenants(req, res) {
  if (!requirePlatformAdmin(req, res)) return;

  const tenants = await Tenant.find({}).select("name displayName type status createdAt").lean();
  const ids = tenants.map((t) => t._id);

  const userCounts = await User.aggregate([
    { $match: { tenant_id: { $in: ids } } },
    { $group: { _id: "$tenant_id", total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } } } },
  ]);
  const userMap = Object.fromEntries(userCounts.map((u) => [String(u._id), u]));

  const lastActivity = await AgentUsageEvent.aggregate([
    { $group: { _id: "$tenantId", lastAt: { $max: "$createdAt" }, callsThisPeriod: { $sum: 1 } } },
  ]);
  const activityMap = Object.fromEntries(lastActivity.map((a) => [a._id, a]));

  return res.json({
    tenants: tenants.map((t) => ({
      _id: t._id,
      name: t.name,
      displayName: t.displayName,
      type: t.type,
      status: t.status,
      createdAt: t.createdAt,
      users: userMap[String(t._id)] ?? { total: 0, active: 0 },
      ai: activityMap[t.name] ?? { lastAt: null, callsThisPeriod: 0 },
    })),
  });
}

/**
 * GET /api/internal-admin/ai-ops
 * Cross-tenant AI usage rollup. Fleet-wide cost, cohort ROI, agent-level success rates.
 */
export async function getAiOps(req, res) {
  if (!requirePlatformAdmin(req, res)) return;
  const days = Math.min(Math.max(parseInt(req.query.days || "30", 10), 1), 365);
  const since = new Date(Date.now() - days * 86400_000);

  // Fleet-wide totals
  const allEvents = await AgentUsageEvent.find({ createdAt: { $gte: since } }).lean();

  // Per-tenant rollup
  const byTenant = {};
  for (const e of allEvents) {
    if (!byTenant[e.tenantId]) byTenant[e.tenantId] = { calls: 0, cost: 0, tokens: 0, blocked: 0, byAgent: {} };
    const t = byTenant[e.tenantId];
    t.calls++;
    t.cost += e.costUsd ?? 0;
    t.tokens += e.totalTokens ?? 0;
    if (String(e.outcome).startsWith("blocked")) t.blocked++;
    if (!t.byAgent[e.agentKey]) t.byAgent[e.agentKey] = 0;
    t.byAgent[e.agentKey]++;
  }

  // Per-agent rollup (across all tenants) — for cost-recovery margin tracking
  const byAgent = {};
  for (const e of allEvents) {
    if (!byAgent[e.agentKey]) byAgent[e.agentKey] = { calls: 0, cost: 0, tokens: 0, success: 0, blocked: 0, error: 0 };
    const a = byAgent[e.agentKey];
    a.calls++;
    a.cost += e.costUsd ?? 0;
    a.tokens += e.totalTokens ?? 0;
    if (e.outcome === "success") a.success++;
    else if (String(e.outcome).startsWith("blocked")) a.blocked++;
    else a.error++;
  }

  const fleetRoi = computeRoi({ events: allEvents, laborRateUsd: 40, periodDays: days });

  return res.json({
    days,
    fleet: {
      totalTenants: Object.keys(byTenant).length,
      totalCalls: allEvents.length,
      totalCostUsd: Math.round(fleetRoi.headline.totalCostUsd * 100) / 100,
      totalLaborSavedUsd: fleetRoi.headline.totalLaborSavedUsd,
      headlineRoiMultiple: fleetRoi.headline.roiMultiple,
    },
    byTenant: Object.entries(byTenant)
      .map(([tenantId, v]) => ({ tenantId, calls: v.calls, costUsd: Math.round(v.cost * 100) / 100, tokens: v.tokens, blocked: v.blocked }))
      .sort((a, b) => b.calls - a.calls),
    byAgent: Object.entries(byAgent)
      .map(([agentKey, v]) => ({
        agentKey, calls: v.calls, costUsd: Math.round(v.cost * 100) / 100, tokens: v.tokens,
        successRate: v.calls > 0 ? Math.round((v.success / v.calls) * 100) : 0,
        blockedRate: v.calls > 0 ? Math.round((v.blocked / v.calls) * 100) : 0,
        errorRate: v.calls > 0 ? Math.round((v.error / v.calls) * 100) : 0,
      }))
      .sort((a, b) => b.calls - a.calls),
  });
}
