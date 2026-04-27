/**
 * Per-1k-token pricing for each (provider, model) pair, in USD.
 * Used to compute costUsd on every agent-usage-event.
 *
 * Update quarterly as provider pricing changes.
 * Reference (Apr 2026):
 *   - Gemini 2.5 Flash-Lite: free tier, paid $0.075/$0.30 per 1M (input/output)
 *   - Gemini 2.5 Flash:      $0.30 / $2.50 per 1M
 *   - Claude Sonnet 4.6:     $3.00 / $15.00 per 1M
 *   - Claude Opus 4.7:       $15.00 / $75.00 per 1M
 *   - GPT-4o:                $2.50 / $10.00 per 1M
 *   - GPT-4o-mini:           $0.15 / $0.60 per 1M
 *   - Local (vLLM Llama 70B): $0 cloud, but customer pays GPU compute
 */

const PRICING = {
  // Anthropic
  "anthropic:claude-opus-4-7":        { input: 15.0 / 1000, output: 75.0 / 1000 },
  "anthropic:claude-opus-4-7[1m]":    { input: 15.0 / 1000, output: 75.0 / 1000 },
  "anthropic:claude-sonnet-4-6":      { input: 3.0 / 1000,  output: 15.0 / 1000 },
  "anthropic:claude-haiku-4-5":       { input: 0.8 / 1000,  output: 4.0 / 1000 },

  // Google
  "gemini:gemini-2.5-pro":            { input: 1.25 / 1000, output: 5.0 / 1000 },
  "gemini:gemini-2.5-flash":          { input: 0.30 / 1000, output: 2.50 / 1000 },
  "gemini:gemini-2.5-flash-lite":     { input: 0.075 / 1000, output: 0.30 / 1000 },
  "gemini:gemini-1.5-flash":          { input: 0.075 / 1000, output: 0.30 / 1000 },

  // OpenAI
  "openai:gpt-4o":                    { input: 2.50 / 1000,  output: 10.0 / 1000 },
  "openai:gpt-4o-mini":               { input: 0.15 / 1000,  output: 0.60 / 1000 },

  // Local / on-prem (zero cloud cost; customer's GPUs)
  "local:llama-3.1-70b-instruct":     { input: 0, output: 0 },
  "local:mixtral-8x22b-instruct":     { input: 0, output: 0 },
  "local:qwen-2.5-72b-instruct":      { input: 0, output: 0 },
};

const FALLBACK = { input: 0.30 / 1000, output: 2.50 / 1000 }; // Gemini Flash equivalent

/**
 * @returns {number} cost in USD
 */
export function computeCostUsd({ provider, model, inputTokens = 0, outputTokens = 0 }) {
  if (!provider) return 0;
  const key = `${String(provider).toLowerCase()}:${String(model || "").toLowerCase()}`;
  const rate = PRICING[key] || FALLBACK;
  const cost = (Number(inputTokens) * rate.input + Number(outputTokens) * rate.output) / 1000;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 decimals
}
