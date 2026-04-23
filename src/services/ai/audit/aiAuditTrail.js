/**
 * AI Audit Trail — Wave 1.
 *
 * Every AI decision is written to the main AuditTrail collection (same one
 * that tracks human actions on audits/CAPAs/deviations) with an entityType
 * of "ai_decision". FDA inspectors can reconstruct any AI recommendation
 * without knowing the AI is separate.
 *
 * Captured per decision:
 *   - tenantId, actorId (who triggered), actorRole
 *   - feature (e.g. "capa.draft_rca")
 *   - entityType + entityId of the linked record (e.g. the CAPA)
 *   - input summary + hashed full prompt (for reproducibility without leakage)
 *   - retrieval set IDs (doc ids + chunk ids used as evidence)
 *   - LLM metadata (provider, model, modelVersion, latency, tokens)
 *   - structured output (the draft the AI produced)
 *   - confidence score + grounded flag
 *   - toolCalls executed (empty if read-only generation)
 *   - outcome (USER_ACCEPTED / USER_EDITED / USER_REJECTED / SUPERSEDED)
 *   - promptHash (sha256 of full prompt) + promptVersion (semver string)
 *
 * The record is append-only — no updates after creation, except the
 * outcome field which gets set after the user reviews the AI draft.
 */
import crypto from "crypto";
import { writeAuditTrail } from "../../auditTrailService.js";

const AI_ENTITY_TYPE = "ai_decision";

/**
 * Hash a string (prompt, retrieval set, etc) for reproducibility.
 */
export function sha256(s) {
  return crypto
    .createHash("sha256")
    .update(typeof s === "string" ? s : JSON.stringify(s))
    .digest("hex");
}

/**
 * Write an AI decision to the main AuditTrail. Returns the trail meta so
 * the caller can attach the decisionId to the user-facing record (e.g. the
 * CAPA.ai_decision_id field).
 */
export async function recordAiDecision({
  tenantId,
  auditId, // the associated audit, if applicable (for FDA reconstructability)
  actorId,
  actorRole,
  feature,
  linkedEntityType, // e.g. "capa" / "deviation" / "change_control"
  linkedEntityId,
  input, // the user's input (will be hashed, not stored raw)
  retrievalSet, // array of { docId, chunkId, score } — what we retrieved
  output, // the structured AI output
  confidence, // 0..1
  grounded, // bool
  provider,
  model,
  modelVersion, // e.g. "claude-opus-4-7/2025-04"
  promptHash, // sha256 of the full prompt (pre-redaction for tenant, post-redaction for cloud)
  promptVersion, // semver of our prompt template, e.g. "capa.rca@1.0.0"
  tokensInput,
  tokensOutput,
  latencyMs,
  toolCalls = [],
  redactionsApplied = [], // from piiRedactionService
  fallbackApplied = false,
} = {}) {
  if (!tenantId || !feature) {
    throw new Error("recordAiDecision: tenantId and feature are required");
  }

  const inputHash = input ? sha256(input) : null;
  const retrievalHash = retrievalSet ? sha256(retrievalSet) : null;

  const meta = {
    ai: {
      feature,
      linkedEntityType,
      linkedEntityId,
      provider,
      model,
      modelVersion,
      promptHash,
      promptVersion,
      inputHash,
      retrievalHash,
      retrievalCount: Array.isArray(retrievalSet) ? retrievalSet.length : 0,
      confidence: typeof confidence === "number" ? confidence : null,
      grounded: Boolean(grounded),
      tokensInput: tokensInput || 0,
      tokensOutput: tokensOutput || 0,
      latencyMs: latencyMs || 0,
      toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
      redactionsApplied,
      fallbackApplied,
      // Truncated output preview so inspectors can see shape without full content.
      // Full output lives on the linked record itself (e.g. capa.ai_draft.rca_text).
      outputPreview:
        typeof output === "string"
          ? output.slice(0, 240)
          : JSON.stringify(output || {}).slice(0, 240),
    },
  };

  // Reuse the main audit trail infrastructure. The auditId fallback to
  // linkedEntityId keeps the signature compatible even if the AI feature
  // wasn't invoked from an audit context (e.g. standalone CAPA).
  await writeAuditTrail({
    tenantId,
    auditId: auditId || linkedEntityId || String(tenantId),
    entityType: AI_ENTITY_TYPE,
    entityId: linkedEntityId || null,
    action: `AI_${String(feature).toUpperCase()}`,
    actorId,
    actorRole,
    meta,
  });

  return {
    recordedAt: new Date().toISOString(),
    feature,
    promptHash,
    grounded,
    confidence,
  };
}

/**
 * Record the human's disposition of an AI draft.
 * Called when the user accepts, edits, or rejects an AI-drafted artifact.
 */
export async function recordAiOutcome({
  tenantId,
  auditId,
  actorId,
  actorRole,
  feature,
  linkedEntityType,
  linkedEntityId,
  outcome, // "USER_ACCEPTED" | "USER_EDITED" | "USER_REJECTED" | "SUPERSEDED"
  feedback, // optional free-text from user
  originalOutputPreview,
  finalOutputPreview,
} = {}) {
  if (!tenantId || !feature || !outcome) {
    throw new Error("recordAiOutcome: tenantId, feature, outcome are required");
  }

  await writeAuditTrail({
    tenantId,
    auditId: auditId || linkedEntityId || String(tenantId),
    entityType: AI_ENTITY_TYPE,
    entityId: linkedEntityId || null,
    action: `AI_${String(feature).toUpperCase()}_OUTCOME`,
    actorId,
    actorRole,
    meta: {
      ai: {
        feature,
        linkedEntityType,
        linkedEntityId,
        outcome,
        feedback: typeof feedback === "string" ? feedback.slice(0, 800) : undefined,
        originalOutputPreview,
        finalOutputPreview,
        recordedAt: new Date().toISOString(),
      },
    },
  });
}

export const __private = { AI_ENTITY_TYPE };
