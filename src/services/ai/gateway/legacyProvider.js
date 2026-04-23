/**
 * Legacy provider adapter — routes gemini + local (vLLM/Llama3) calls to
 * the existing llmServiceClient so we don't duplicate that integration.
 *
 * Output normalised to the gateway envelope. If the legacy client returns
 * only text, we fabricate a minimal envelope and set tokens to 0 (unknown).
 */
import { callLlmService } from "../../llmServiceClient.js";

export async function callLegacyLlm(messages, plan) {
  // llmServiceClient expects a single prompt string for simple calls; multi-turn
  // is concatenated. The full structured-messages path is a future upgrade.
  const prompt = messages
    .map((m) => (m.role === "system" ? `[SYSTEM] ${m.content}` : m.content))
    .filter(Boolean)
    .join("\n\n");

  const text = await callLlmService({
    prompt,
    temperature: plan.temperature,
    maxTokens: plan.maxTokens,
    model: plan.model,
    provider: plan.provider, // "gemini" or "local"
    timeoutMs: plan.timeoutMs,
  }).catch((err) => {
    throw new Error(`legacyProvider (${plan.provider}) failed: ${err.message}`);
  });

  return {
    text: typeof text === "string" ? text : text?.text || "",
    tokensInput: 0, // legacy client doesn't surface token counts
    tokensOutput: 0,
    toolCalls: undefined,
    rawResponse: { legacyText: text },
  };
}
