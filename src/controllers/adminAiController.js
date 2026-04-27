/**
 * Admin Panel · AI Agents — controller.
 *
 * Endpoints:
 *   GET  /api/admin/ai/usage         — recent agent-usage-events for the tenant
 *   GET  /api/admin/ai/roi           — ROI report (uses calculator)
 *   GET  /api/admin/ai/permissions   — current permission policy doc
 *   PUT  /api/admin/ai/permissions   — update permission policy doc (tenant_admin only)
 *   GET  /api/admin/ai/catalog       — list of available agents (read-only)
 *
 * All endpoints scoped to req.tenantId.
 */
import { listRecentUsage, markAccepted } from "../services/ai/governance/agentUsageService.js";
import { computeRoi } from "../services/ai/governance/roiCalculator.js";
import { AGENT_CATALOG } from "../services/ai/governance/agentCatalog.js";
import { AgentPermission } from "../models/agentPermissionModel.js";
import { AgentUsageEvent } from "../models/agentUsageEventModel.js";

function tc(req) {
  return {
    tenantId: req.tenantId || req.user?.tenant_id,
    userId: req.user?._id,
    userRole: req.user?.role,
  };
}

export async function getUsage(req, res) {
  const { tenantId } = tc(req);
  if (!tenantId) return res.status(400).json({ error: "tenant_required" });
  const days = Math.min(Math.max(parseInt(req.query.days || "30", 10), 1), 365);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "200", 10), 1), 2000);
  const agentKey = req.query.agentKey || null;
  const userId = req.query.userId || null;
  const events = await listRecentUsage({ tenantId: String(tenantId), days, limit, agentKey, userId });
  return res.json({ tenantId: String(tenantId), days, count: events.length, events });
}

export async function getRoi(req, res) {
  const { tenantId } = tc(req);
  if (!tenantId) return res.status(400).json({ error: "tenant_required" });
  const days = Math.min(Math.max(parseInt(req.query.days || "30", 10), 1), 365);

  const policy = await AgentPermission.findOne({ tenantId: String(tenantId) }).select("laborRateUsd").lean();
  const laborRateUsd = policy?.laborRateUsd ?? 40;

  const events = await listRecentUsage({ tenantId: String(tenantId), days, limit: 5000 });
  const roi = computeRoi({ events, laborRateUsd, periodDays: days });
  return res.json({ tenantId: String(tenantId), ...roi });
}

export async function getPermissions(req, res) {
  const { tenantId } = tc(req);
  if (!tenantId) return res.status(400).json({ error: "tenant_required" });
  const doc = await AgentPermission.findOne({ tenantId: String(tenantId) }).lean();
  return res.json({
    tenantId: String(tenantId),
    policy: doc || null,
    catalog: Object.entries(AGENT_CATALOG).map(([key, m]) => ({ agentKey: key, ...m })),
  });
}

export async function putPermissions(req, res) {
  const { tenantId, userId, userRole } = tc(req);
  if (!tenantId) return res.status(400).json({ error: "tenant_required" });
  if (userRole !== "tenant_admin" && userRole !== "superadmin") {
    return res.status(403).json({ error: "tenant_admin_required" });
  }
  const allowedFields = ["permissions", "userOverrides", "tenantQuota", "defaultPolicy", "laborRateUsd"];
  const update = {};
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) update[f] = req.body[f];
  }
  update.updatedAt = new Date();
  update.updatedBy = userId;

  const doc = await AgentPermission.findOneAndUpdate(
    { tenantId: String(tenantId) },
    { $set: update, $setOnInsert: { tenantId: String(tenantId) } },
    { upsert: true, new: true }
  );
  return res.json({ ok: true, policy: doc });
}

export async function getCatalog(req, res) {
  return res.json({
    agents: Object.entries(AGENT_CATALOG).map(([key, m]) => ({ agentKey: key, ...m })),
  });
}

/**
 * POST /api/admin/ai/usage/:eventId/accept
 * Frontend calls this when the user accepts/discards the AI suggestion.
 * Backfills userAccepted + userEditedRatio on the matching agent-usage-event.
 */
export async function postAcceptUsage(req, res) {
  const { tenantId, userId } = tc(req);
  const { eventId } = req.params;
  const { userAccepted, userEditedRatio = 0 } = req.body || {};
  if (!eventId) return res.status(400).json({ error: "eventId_required" });
  if (typeof userAccepted !== "boolean") return res.status(400).json({ error: "userAccepted_must_be_boolean" });

  // Verify the event belongs to this tenant + user (anti-tamper)
  const ev = await AgentUsageEvent.findOne({ _id: eventId, tenantId: String(tenantId) }).select("userId").lean();
  if (!ev) return res.status(404).json({ error: "event_not_found" });
  if (String(ev.userId) !== String(userId) && req.user?.role !== "tenant_admin") {
    return res.status(403).json({ error: "not_your_event" });
  }

  await markAccepted({ usageEventId: eventId, userAccepted, userEditedRatio: Math.max(0, Math.min(1, Number(userEditedRatio || 0))) });
  return res.json({ ok: true });
}
