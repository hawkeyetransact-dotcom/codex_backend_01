/**
 * Grounded Generation Runtime — Wave 1.
 *
 * Wraps llmGateway.generate() with the four platform guarantees:
 *
 *   1. STRUCTURED OUTPUT — the caller declares a JSON schema shape. We
 *      instruct the LLM to produce JSON + parse + validate. If the model
 *      returns non-JSON or the wrong shape, we re-ask once with stricter
 *      phrasing. Second failure = fail closed (fallback response).
 *
 *   2. CITATION GATE — every structured output must include a `citations`
 *      array (or per-field citations). We verify at least one citation is
 *      present when the caller requires it. Empty-citation responses trigger
 *      re-ask or fallback.
 *
 *   3. CONFIDENCE FLOOR — caller sets a minimum confidence. If the LLM's
 *      self-reported confidence (a required output field) is below the
 *      floor, we either re-ask at lower temperature or return fallback.
 *
 *   4. AUDIT + REDACTION — every call flows through piiRedactionService
 *      and recordAiDecision. The caller never touches those primitives.
 *
 * Usage:
 *   const result = await groundedGenerate({
 *     feature: "capa.draft_rca",
 *     systemPrompt: "...",
 *     userPrompt: "...",
 *     retrievalSet: [{ docId, chunkId, text, score }],
 *     outputSchema: { requiredFields: ["rca","corrective","preventive","citations","confidence"] },
 *     minConfidence: 0.6,
 *     requireCitations: true,
 *     tenantContext: { tenantId, userId, userRole, auditId, linkedEntityType, linkedEntityId },
 *     llmConfig: { tenantConfig: {...}, callOverride: {...} },
 *     promptVersion: "capa.rca@1.0.0",
 *   });
 *
 * Returns:
 *   {
 *     ok: true,
 *     output: {...parsed LLM output...},
 *     grounded: true,
 *     confidence: 0.82,
 *     citations: [...],
 *     auditRecord: { feature, promptHash, ... },
 *     llmMeta: { provider, model, latencyMs, tokensInput, tokensOutput },
 *   }
 *   OR on fallback:
 *   {
 *     ok: false,
 *     reason: "low_confidence" | "missing_citations" | "invalid_json" | "llm_error",
 *     fallbackMessage: "I could not verify this confidently...",
 *     auditRecord: {...},
 *   }
 */
import { generate, hashPrompt } from "../gateway/llmGateway.js";
import { redactMessages, unredactString } from "../redaction/piiRedactionService.js";
import { recordAiDecision, sha256 } from "../audit/aiAuditTrail.js";

const DEFAULT_MIN_CONFIDENCE = 0.55;
const MAX_REASK = 1; // at most one retry on structured-output failure

const FALLBACK = {
  message:
    "I could not verify this with enough confidence from the controlled documents and evidence available. " +
    "Please provide additional context, or draft this section manually and I will help review it.",
};

const JSON_INSTRUCTION = [
  "You MUST respond with a single valid JSON object, no prose before or after.",
  "Every factual claim must be supported by a citation drawn from the SOURCES block.",
  "Include a top-level `citations` array (strings like `SOURCE_3:para_12` referencing the SOURCES you were given).",
  "Include a top-level `confidence` number between 0 and 1 representing how well-grounded your answer is.",
  "If you cannot produce a well-grounded answer, return {\"insufficient_evidence\": true, \"reason\": \"...\", \"citations\": [], \"confidence\": 0}.",
].join(" ");

function buildSourcesBlock(retrievalSet = []) {
  if (!Array.isArray(retrievalSet) || !retrievalSet.length) return "";
  return [
    "SOURCES (grounded evidence — cite these, do not invent new facts):",
    ...retrievalSet.map((r, i) => {
      const id = r.docId || r.id || `SRC_${i + 1}`;
      const chunk = r.chunkId || r.chunk || i + 1;
      const text = (r.text || r.content || "").replace(/\s+/g, " ").slice(0, 1200);
      return `[SOURCE_${i + 1} · ${id}:${chunk}]\n${text}`;
    }),
    "END SOURCES",
  ].join("\n\n");
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") return null;
  // Strip Markdown code fences if the model ignored the no-prose instruction.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Look for the outermost JSON object as a best-effort fallback.
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function checkSchema(parsed, outputSchema) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "not_object" };
  }
  const missing = [];
  for (const field of outputSchema.requiredFields || []) {
    if (!(field in parsed)) missing.push(field);
  }
  if (missing.length) {
    return { ok: false, reason: "missing_fields", missing };
  }
  return { ok: true };
}

/**
 * Primary entry.
 */
export async function groundedGenerate({
  feature,
  systemPrompt,
  userPrompt,
  retrievalSet = [],
  outputSchema = { requiredFields: ["citations", "confidence"] },
  minConfidence = DEFAULT_MIN_CONFIDENCE,
  requireCitations = true,
  tenantContext = {},
  llmConfig = {},
  promptVersion = "unversioned@0.0.0",
} = {}) {
  if (!feature) throw new Error("groundedGenerate: `feature` is required");
  if (!userPrompt) throw new Error("groundedGenerate: `userPrompt` is required");

  const { tenantId, userId, userRole, auditId, linkedEntityType, linkedEntityId, tenantPolicyOverrides, properNounList } = tenantContext;

  // Build the prompt envelope.
  const sources = buildSourcesBlock(retrievalSet);
  const fullSystem = [
    systemPrompt?.trim(),
    JSON_INSTRUCTION,
  ].filter(Boolean).join("\n\n");
  const fullUser = [sources, userPrompt?.trim()].filter(Boolean).join("\n\n");

  // Apply PII redaction before sending to the provider.
  const providerForPolicy = llmConfig.callOverride?.provider || llmConfig.tenantConfig?.provider;
  const { redactedMessages, replacementMap, redactionsApplied } = redactMessages(
    [
      { role: "system", content: fullSystem },
      { role: "user", content: fullUser },
    ],
    { provider: providerForPolicy, tenantPolicyOverrides, properNounList }
  );

  // Pre-compute prompt hash over the un-redacted prompt — this is the
  // reproducibility fingerprint for this tenant.
  const promptHash = sha256(fullSystem + "\n---\n" + fullUser);

  // Attempt 1.
  let attempt = 0;
  let llmResult;
  let parsed;
  let schemaCheck;
  let failureReason;
  let auditRecord;

  while (attempt <= MAX_REASK) {
    attempt += 1;
    try {
      llmResult = await generate({
        messages: redactedMessages,
        tenantConfig: llmConfig.tenantConfig,
        callOverride: {
          ...llmConfig.callOverride,
          responseFormat: "json",
          temperature: attempt === 1 ? 0.2 : 0.1, // cooler on re-ask
        },
      });
    } catch (err) {
      failureReason = "llm_error";
      console.error(`[groundedGen] LLM error on ${feature} attempt ${attempt}:`, err.message);
      break;
    }

    parsed = safeJsonParse(llmResult.text);
    schemaCheck = checkSchema(parsed, outputSchema);

    if (!schemaCheck.ok) {
      failureReason = `schema_${schemaCheck.reason}`;
      if (attempt > MAX_REASK) break;
      // Add a brief corrective system note and re-ask.
      redactedMessages.push({
        role: "user",
        content:
          `Your previous response was not valid JSON matching the required schema (missing: ${(schemaCheck.missing || []).join(", ")}). ` +
          "Respond again with a single valid JSON object including ALL required fields.",
      });
      continue;
    }

    // Citation gate
    if (requireCitations) {
      const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
      if (!citations.length && !parsed.insufficient_evidence) {
        failureReason = "missing_citations";
        if (attempt > MAX_REASK) break;
        redactedMessages.push({
          role: "user",
          content:
            "Your response had no citations. Every factual claim must cite a SOURCE. " +
            "If the sources are insufficient, return {\"insufficient_evidence\": true, ...}.",
        });
        continue;
      }
    }

    // Confidence floor
    const confidence = Number(parsed.confidence);
    if (parsed.insufficient_evidence) {
      failureReason = "insufficient_evidence";
      break;
    }
    if (!Number.isFinite(confidence) || confidence < minConfidence) {
      failureReason = "low_confidence";
      break;
    }

    // All gates passed.
    failureReason = null;
    break;
  }

  // Unredact the output so users see real names, emails, etc (not the placeholders).
  const unredactedOutputText = unredactString(
    JSON.stringify(parsed || {}),
    replacementMap
  );
  const output = parsed ? JSON.parse(unredactedOutputText) : null;

  // Write audit trail regardless of success.
  auditRecord = await recordAiDecision({
    tenantId,
    auditId,
    actorId: userId,
    actorRole: userRole,
    feature,
    linkedEntityType,
    linkedEntityId,
    input: userPrompt,
    retrievalSet,
    output,
    confidence: output?.confidence,
    grounded: !failureReason,
    provider: llmResult?.provider,
    model: llmResult?.model,
    modelVersion: `${llmResult?.provider}/${llmResult?.model}`,
    promptHash,
    promptVersion,
    tokensInput: llmResult?.tokensInput,
    tokensOutput: llmResult?.tokensOutput,
    latencyMs: llmResult?.latencyMs,
    redactionsApplied,
    fallbackApplied: llmResult?.providerFallback || false,
  }).catch((err) => {
    console.error("[groundedGen] audit write failed:", err.message);
    return null;
  });

  if (failureReason) {
    return {
      ok: false,
      reason: failureReason,
      fallbackMessage: FALLBACK.message,
      auditRecord,
      llmMeta: llmResult
        ? {
            provider: llmResult.provider,
            model: llmResult.model,
            latencyMs: llmResult.latencyMs,
            tokensInput: llmResult.tokensInput,
            tokensOutput: llmResult.tokensOutput,
          }
        : null,
    };
  }

  return {
    ok: true,
    output,
    grounded: true,
    confidence: output.confidence,
    citations: output.citations || [],
    auditRecord,
    llmMeta: {
      provider: llmResult.provider,
      model: llmResult.model,
      latencyMs: llmResult.latencyMs,
      tokensInput: llmResult.tokensInput,
      tokensOutput: llmResult.tokensOutput,
    },
  };
}

export const __private = { safeJsonParse, checkSchema, buildSourcesBlock, FALLBACK };
