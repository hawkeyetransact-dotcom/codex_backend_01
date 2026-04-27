/**
 * Write + read for the agent-usage-events collection.
 *
 * recordUsage()  — fire-and-forget write (caller doesn't await; failures logged but don't break the agent call)
 * recordBlocked() — write a "blocked_by_*" event when the call was rejected before LLM dispatch
 * markAccepted() — backfill userAccepted when frontend reports user kept/discarded the AI output
 */
import crypto from "node:crypto";
import { AgentUsageEvent } from "../../../models/agentUsageEventModel.js";
import { getAgentMeta } from "./agentCatalog.js";
import { computeCostUsd } from "./agentCostTable.js";

function hashPrompt({ systemPrompt = "", userPrompt = "" } = {}) {
  return crypto.createHash("sha256").update(systemPrompt + "\n---\n" + userPrompt).digest("hex").slice(0, 32);
}

/**
 * Record a successful or failed agent invocation.
 * Caller should NOT await this — it's fire-and-forget so a usage-write
 * failure can never break a customer-facing agent call.
 */
export async function recordUsage({
  tenantId,
  userId,
  userRole,
  agentKey,
  agentVersion,
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
  durationMs = 0,
  outcome = "success",
  confidence = null,
  groundedCitations = 0,
  linkedEntityType = null,
  linkedEntityId = null,
  systemPrompt = null,
  userPrompt = null,
  auditTrailId = null,
} = {}) {
  try {
    const meta = getAgentMeta(agentKey);
    const totalTokens = Number(inputTokens || 0) + Number(outputTokens || 0);
    const costUsd = computeCostUsd({ provider, model, inputTokens, outputTokens });

    const doc = {
      tenantId: String(tenantId || ""),
      userId,
      userRole: userRole || null,
      agentKey,
      agentVersion: agentVersion || null,
      provider: provider || null,
      model: model || null,
      inputTokens: Number(inputTokens || 0),
      outputTokens: Number(outputTokens || 0),
      totalTokens,
      costUsd,
      durationMs: Number(durationMs || 0),
      outcome,
      confidence,
      groundedCitations: Number(groundedCitations || 0),
      linkedEntityType,
      linkedEntityId,
      estimatedTimeSavedMin: outcome === "success" ? meta.estimatedTimeSavedMin : 0,
      auditTrailId,
      promptHash: systemPrompt || userPrompt ? hashPrompt({ systemPrompt, userPrompt }) : null,
      createdAt: new Date(),
    };

    await AgentUsageEvent.create(doc);
  } catch (err) {
    // never throw — usage tracking is observability, not gating
    console.warn("[agentUsageService.recordUsage] failed:", err?.message);
  }
}

export async function recordBlocked({ tenantId, userId, userRole, agentKey, blockedBy, detail }) {
  return recordUsage({
    tenantId, userId, userRole, agentKey,
    outcome: blockedBy === "permission" ? "blocked_by_permission" : "blocked_by_quota",
    durationMs: 0,
  });
}

/**
 * Backfill the user-accept disposition.
 * Called from frontend after user clicks Accept/Discard on an agent suggestion.
 */
export async function markAccepted({ usageEventId, userAccepted, userEditedRatio = null }) {
  await AgentUsageEvent.updateOne(
    { _id: usageEventId },
    { $set: { userAccepted: !!userAccepted, userEditedRatio, acceptanceRecordedAt: new Date() } }
  );
}

/**
 * Read API: list recent events for a tenant.
 */
export async function listRecentUsage({ tenantId, days = 30, limit = 1000, agentKey = null, userId = null } = {}) {
  const since = new Date(Date.now() - days * 86400_000);
  const q = { tenantId, createdAt: { $gte: since } };
  if (agentKey) q.agentKey = agentKey;
  if (userId) q.userId = userId;
  return AgentUsageEvent.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}
