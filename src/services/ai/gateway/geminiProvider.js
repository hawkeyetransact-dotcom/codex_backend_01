/**
 * Gemini provider — Google AI Studio / Gemini 1.5 + 2.x.
 *
 * FREE tier-friendly. Direct fetch (no SDK). Honours JSON mode via
 * generationConfig.responseMimeType so structured-output features work
 * end-to-end without prompt-engineering hacks.
 *
 * Required env: GEMINI_API_KEY
 * Optional env: GEMINI_API_BASE (defaults to https://generativelanguage.googleapis.com/v1beta)
 */

const API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");

/**
 * Convert our internal {role,content} messages into Gemini's contents shape.
 * Gemini uses "user" and "model" roles; system text is passed as
 * `system_instruction` (a separate top-level field).
 */
function toGeminiContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") continue; // handled separately
    const role = m.role === "assistant" ? "model" : "user";
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

export async function callGemini(messages, plan) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set — cannot call Gemini provider");
  }
  const model = plan.model || "gemini-1.5-flash";
  const url = `${API_BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const systemPrompt =
    plan.systemPrompt ||
    messages.find((m) => m.role === "system")?.content ||
    null;

  const generationConfig = {
    temperature: plan.temperature ?? 0.2,
    maxOutputTokens: plan.maxTokens ?? 2048,
  };
  if (plan.responseFormat === "json") {
    generationConfig.responseMimeType = "application/json";
  }

  const body = {
    contents: toGeminiContents(messages),
    generationConfig,
  };
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: String(systemPrompt) }] };
  }

  // Free-tier Gemini has tight RPM limits. Retry on 429 up to 3 times with
  // exponential backoff honouring any retry-delay the API suggests.
  const MAX_ATTEMPTS = 3;
  let res;
  let attempt = 0;
  let errBody = "";
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), plan.timeoutMs ?? 60_000);
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) break;
    errBody = await res.text().catch(() => "");
    if (res.status !== 429 || attempt >= MAX_ATTEMPTS) {
      throw new Error(`gemini ${res.status}: ${errBody.slice(0, 400)}`);
    }
    // Extract a retry-delay if present (format `Please retry in 5.8s`).
    const delayMatch = /retry in (\d+(?:\.\d+)?)s/i.exec(errBody);
    const waitMs = delayMatch ? Math.min(15_000, Math.ceil(parseFloat(delayMatch[1]) * 1000) + 500) : 2000 * attempt;
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data = await res.json();

  // candidates[0].content.parts is an array of {text} blocks.
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("");

  // Gemini also surfaces token counts under usageMetadata.
  const usage = data?.usageMetadata || {};

  return {
    text: String(text || ""),
    tokensInput: usage.promptTokenCount ?? 0,
    tokensOutput: usage.candidatesTokenCount ?? 0,
    toolCalls: undefined, // Gemini's function-calling support is configurable separately; not used in the gateway path yet
    rawResponse: data,
  };
}
