/**
 * Permission + quota gate for AI agent invocations.
 *
 * Resolution:
 *   1. user-specific override
 *   2. role policy
 *   3. tenant defaultPolicy
 *   4. tenant-level cap (always enforced)
 *
 * Quota:
 *   - daily quota: rolling 24h count of `agent-usage-events` for this (tenant, user, agent)
 *   - monthly quota: rolling 30d count
 *   - tenant cap: total tokens or $ this calendar month
 */
import { AgentPermission } from "../../../models/agentPermissionModel.js";
import { AgentUsageEvent } from "../../../models/agentUsageEventModel.js";

function normalizeRole(role) {
  if (!role) return "anonymous";
  const r = String(role).toLowerCase();
  if (r === "supplier_admin") return "supplier";
  if (r === "tenant_admin") return "tenant_admin";
  if (r === "superadmin" || r === "super_admin") return "superadmin";
  return r;
}

/**
 * Resolve the policy that applies for a given (tenant, user, role, agent).
 * @returns {Promise<{ allow: boolean, reason: string | null, dailyQuota: number | null, monthlyQuota: number | null, source: string }>}
 */
export async function resolvePolicy({ tenantId, userId, userRole, agentKey }) {
  if (!tenantId || !agentKey) {
    return { allow: false, reason: "missing_tenant_or_agent", dailyQuota: null, monthlyQuota: null, source: "input" };
  }
  const policyDoc = await AgentPermission.findOne({ tenantId }).lean();

  // No policy doc — fail open in dev, fail closed in production
  if (!policyDoc) {
    const failOpen = process.env.AI_PERMISSIONS_DEFAULT_OPEN !== "false";
    return { allow: failOpen, reason: failOpen ? "no_policy_doc_fail_open" : "no_policy_doc_fail_closed", dailyQuota: null, monthlyQuota: null, source: "default" };
  }

  // 1. user-specific override
  if (userId && policyDoc.userOverrides && policyDoc.userOverrides[String(userId)]) {
    const ov = policyDoc.userOverrides[String(userId)][agentKey];
    if (ov) return { allow: !!ov.allow, reason: ov.allow ? null : "user_override_deny", dailyQuota: ov.dailyQuota ?? null, monthlyQuota: ov.monthlyQuota ?? null, source: "user_override" };
  }

  // 2. role policy
  const role = normalizeRole(userRole);
  if (policyDoc.permissions && policyDoc.permissions[role]) {
    const rp = policyDoc.permissions[role][agentKey];
    if (rp) return { allow: !!rp.allow, reason: rp.allow ? null : "role_policy_deny", dailyQuota: rp.dailyQuota ?? null, monthlyQuota: rp.monthlyQuota ?? null, source: "role" };
  }

  // 3. default policy
  const defaultAllow = (policyDoc.defaultPolicy ?? "deny") === "allow";
  return { allow: defaultAllow, reason: defaultAllow ? "default_allow" : "default_deny", dailyQuota: null, monthlyQuota: null, source: "default" };
}

/**
 * Check whether the (user, agent) is below their daily/monthly quota AND the tenant is below its cap.
 */
export async function checkQuota({ tenantId, userId, agentKey, dailyQuota, monthlyQuota }) {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const monthAgo = new Date(now - 30 * 86400 * 1000);

  // user/agent quota
  if (dailyQuota != null) {
    const dayCount = await AgentUsageEvent.countDocuments({
      tenantId, userId, agentKey, outcome: "success", createdAt: { $gte: dayAgo },
    });
    if (dayCount >= dailyQuota) return { exhausted: true, scope: "user_daily", count: dayCount, limit: dailyQuota };
  }
  if (monthlyQuota != null) {
    const monthCount = await AgentUsageEvent.countDocuments({
      tenantId, userId, agentKey, outcome: "success", createdAt: { $gte: monthAgo },
    });
    if (monthCount >= monthlyQuota) return { exhausted: true, scope: "user_monthly", count: monthCount, limit: monthlyQuota };
  }

  // tenant-wide caps
  const policyDoc = await AgentPermission.findOne({ tenantId }).select("tenantQuota").lean();
  const cap = policyDoc?.tenantQuota;
  if (cap?.enforcement && cap.enforcement !== "unlimited") {
    if (cap.monthlyTokenLimit != null) {
      const tokenAgg = await AgentUsageEvent.aggregate([
        { $match: { tenantId, outcome: "success", createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: "$totalTokens" } } },
      ]);
      const usedTokens = tokenAgg[0]?.total ?? 0;
      if (usedTokens >= cap.monthlyTokenLimit) {
        return { exhausted: true, scope: "tenant_token_cap", used: usedTokens, limit: cap.monthlyTokenLimit, enforcement: cap.enforcement };
      }
    }
    if (cap.monthlyCostLimitUsd != null) {
      const costAgg = await AgentUsageEvent.aggregate([
        { $match: { tenantId, outcome: "success", createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: "$costUsd" } } },
      ]);
      const usedCost = costAgg[0]?.total ?? 0;
      if (usedCost >= cap.monthlyCostLimitUsd) {
        return { exhausted: true, scope: "tenant_cost_cap", used: usedCost, limit: cap.monthlyCostLimitUsd, enforcement: cap.enforcement };
      }
    }
  }

  return { exhausted: false };
}

/**
 * Compose policy + quota into a single allow/deny decision.
 * @returns {Promise<{ allowed: boolean, blockedBy: 'permission' | 'quota' | null, detail: object }>}
 */
export async function authorizeAgentCall({ tenantId, userId, userRole, agentKey }) {
  const policy = await resolvePolicy({ tenantId, userId, userRole, agentKey });
  if (!policy.allow) {
    return { allowed: false, blockedBy: "permission", detail: { policy } };
  }
  const quota = await checkQuota({ tenantId, userId, agentKey, dailyQuota: policy.dailyQuota, monthlyQuota: policy.monthlyQuota });
  if (quota.exhausted && quota.enforcement !== "soft") {
    return { allowed: false, blockedBy: "quota", detail: { policy, quota } };
  }
  return { allowed: true, blockedBy: null, detail: { policy, quota } };
}
