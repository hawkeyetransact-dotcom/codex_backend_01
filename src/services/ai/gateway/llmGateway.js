/**
 * LLM Gateway — Wave 1 foundation.
 *
 * Unified interface for calling any configured LLM provider. Per-tenant
 * provider selection + per-call overrides + token accounting + retry/fallback
 * chain. All calls flow through this. No controller talks to a provider
 * SDK directly.
 *
 * Providers:
 *   - anthropic (Claude) — raw fetch to https://api.anthropic.com
 *   - openai   (GPT)     — uses `openai` npm package
 *   - gemini             — delegated to legacy llmServiceClient.js
 *   - local              — vLLM / Llama3 via llmServiceClient.js (MCP path)
 *
 * Tenant chooses: modelConfig lives in tenant settings. Platform-default
 * falls back to env: LLM_DEFAULT_PROVIDER + LLM_DEFAULT_MODEL.
 *
 * Output shape (always):
 *   {
 *     text: string,                  // primary response text
 *     tokensInput: number,
 *     tokensOutput: number,
 *     model: string,                 // resolved model name
 *     provider: string,              // resolved provider
 *     latencyMs: number,
 *     rawResponse: object,           // provider-native response, redacted
 *     toolCalls?: Array<{...}>,      // if provider returned structured tool_use
 *   }
 *
 * Never returns a string alone; always the envelope above.
 */
import crypto from "crypto";
import { callAnthropic } from "./anthropicProvider.js";
import { callOpenAI } from "./openaiProvider.js";
import { callGemini } from "./geminiProvider.js";
import { callLegacyLlm } from "./legacyProvider.js";

const DEFAULT_PROVIDER =
  process.env.LLM_DEFAULT_PROVIDER?.toLowerCase() || "anthropic";
const DEFAULT_MODELS = {
  anthropic: process.env.LLM_ANTHROPIC_MODEL || "claude-opus-4-7",
  openai: process.env.LLM_OPENAI_MODEL || "gpt-4-turbo",
  gemini: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  local: process.env.LLM_MODEL || "llama3",
};

const ALL_PROVIDERS = new Set(["anthropic", "openai", "gemini", "local"]);

/**
 * Normalise a tenant LLM config into a concrete call plan.
 *
 * @param {object} tenantConfig - optional { provider, model, maxTokens, temperature }
 * @param {object} callOverride - per-call overrides { provider, model, ... }
 */
function resolveCallPlan(tenantConfig = {}, callOverride = {}) {
  const provider = (
    callOverride.provider ||
    tenantConfig.provider ||
    DEFAULT_PROVIDER
  ).toLowerCase();
  if (!ALL_PROVIDERS.has(provider)) {
    throw new Error(
      `llmGateway: unknown provider '${provider}'. Valid: ${[...ALL_PROVIDERS].join(", ")}`
    );
  }
  const model =
    callOverride.model || tenantConfig.model || DEFAULT_MODELS[provider];
  return {
    provider,
    model,
    maxTokens: callOverride.maxTokens ?? tenantConfig.maxTokens ?? 2048,
    temperature: callOverride.temperature ?? tenantConfig.temperature ?? 0.2,
    systemPrompt: callOverride.systemPrompt || tenantConfig.systemPrompt,
    tools: callOverride.tools || undefined,
    responseFormat: callOverride.responseFormat, // 'json' or 'text' (default)
    timeoutMs: callOverride.timeoutMs ?? tenantConfig.timeoutMs ?? 60_000,
  };
}

/**
 * Primary entry point.
 *
 * @param {object} args
 * @param {string} args.prompt - user message content
 * @param {Array} [args.messages] - full message history if multi-turn (overrides prompt)
 * @param {object} [args.tenantConfig] - tenant-scoped LLM config
 * @param {object} [args.callOverride] - per-call overrides
 * @returns {Promise<object>} response envelope (see top)
 */
export async function generate({
  prompt,
  messages,
  tenantConfig,
  callOverride,
} = {}) {
  const plan = resolveCallPlan(tenantConfig, callOverride);
  const effectiveMessages = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: String(prompt ?? "") }];

  if (!effectiveMessages[0]?.content) {
    throw new Error("llmGateway.generate: prompt/messages is required");
  }

  const startedAt = Date.now();

  let result;
  try {
    if (plan.provider === "anthropic") {
      result = await callAnthropic(effectiveMessages, plan);
    } else if (plan.provider === "openai") {
      result = await callOpenAI(effectiveMessages, plan);
    } else if (plan.provider === "gemini") {
      result = await callGemini(effectiveMessages, plan);
    } else {
      // local (vLLM / Llama via legacy llmServiceClient)
      result = await callLegacyLlm(effectiveMessages, plan);
    }
  } catch (err) {
    // Fallback chain: if the primary provider fails and a fallback is
    // configured, try that instead. Keeps hot path resilient.
    const fallbackProvider = process.env.LLM_FALLBACK_PROVIDER?.toLowerCase();
    if (
      fallbackProvider &&
      ALL_PROVIDERS.has(fallbackProvider) &&
      fallbackProvider !== plan.provider
    ) {
      console.warn(
        `[llmGateway] ${plan.provider} failed (${err.message}); retrying with fallback=${fallbackProvider}`
      );
      const fallbackPlan = { ...plan, provider: fallbackProvider, model: DEFAULT_MODELS[fallbackProvider] };
      if (fallbackProvider === "anthropic") result = await callAnthropic(effectiveMessages, fallbackPlan);
      else if (fallbackProvider === "openai") result = await callOpenAI(effectiveMessages, fallbackPlan);
      else if (fallbackProvider === "gemini") result = await callGemini(effectiveMessages, fallbackPlan);
      else result = await callLegacyLlm(effectiveMessages, fallbackPlan);
      result.providerFallback = true;
    } else {
      throw err;
    }
  }

  const latencyMs = Date.now() - startedAt;
  return {
    provider: plan.provider,
    model: plan.model,
    latencyMs,
    ...result,
  };
}

/**
 * Build a prompt-hash for audit traceability.
 * Lets an inspector reconstruct exactly what was sent to the LLM
 * without storing full sensitive prompts in every audit entry.
 */
export function hashPrompt(prompt) {
  return crypto
    .createHash("sha256")
    .update(typeof prompt === "string" ? prompt : JSON.stringify(prompt))
    .digest("hex");
}

export const __private = {
  resolveCallPlan,
  DEFAULT_PROVIDER,
  DEFAULT_MODELS,
  ALL_PROVIDERS,
};
