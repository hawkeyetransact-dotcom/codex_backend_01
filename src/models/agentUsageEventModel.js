/**
 * agent-usage-events
 *
 * One row per AI agent invocation. Powers:
 *   - Per-tenant ROI dashboard (Admin Panel · AI Agents)
 *   - Quota enforcement (rolling daily/monthly counts)
 *   - Cost recovery + billing for metered tiers
 *   - Audit trail for compliance review of every agent call
 *
 * Append-only. Retention: 24 months hot, 7 years archived (regulatory minimum).
 */
import mongoose from "mongoose";

const AgentUsageEventSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, index: true },
    userRole: { type: String, default: null },

    // Which agent (canonical feature key, matches agentCatalog.js)
    agentKey: { type: String, required: true, index: true },
    agentVersion: { type: String, default: null },

    // LLM provider details
    provider: { type: String, default: null },          // anthropic | gemini | openai | local
    model: { type: String, default: null },             // e.g. "claude-opus-4-7"
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },

    durationMs: { type: Number, default: 0 },

    // Outcome
    outcome: {
      type: String,
      enum: [
        "success",
        "low_confidence",
        "missing_citations",
        "invalid_json",
        "llm_error",
        "insufficient_evidence",
        "blocked_by_permission",
        "blocked_by_quota",
        "blocked_by_cost_cap",
      ],
      required: true,
      index: true,
    },
    confidence: { type: Number, default: null },
    groundedCitations: { type: Number, default: 0 },

    // What this call acted on (for cross-reference)
    linkedEntityType: { type: String, default: null },
    linkedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // ROI tracking — calibrated from agentCatalog
    estimatedTimeSavedMin: { type: Number, default: 0 },

    // Backfilled by frontend when user accepts/discards the AI output
    userAccepted: { type: Boolean, default: null },
    userEditedRatio: { type: Number, default: null },   // 0..1
    acceptanceRecordedAt: { type: Date, default: null },

    // Compliance trail
    auditTrailId: { type: mongoose.Schema.Types.ObjectId, default: null },
    promptHash: { type: String, default: null },        // SHA256 of system+user prompt (for tamper-evidence)

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "agent-usage-events" }
);

// Hot-path indexes for the Admin Panel queries
AgentUsageEventSchema.index({ tenantId: 1, createdAt: -1 });
AgentUsageEventSchema.index({ tenantId: 1, agentKey: 1, createdAt: -1 });
AgentUsageEventSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export const AgentUsageEvent = mongoose.model("agent-usage-events", AgentUsageEventSchema);
