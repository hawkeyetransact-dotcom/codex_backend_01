/**
 * Anthropic (Claude) provider adapter.
 *
 * Raw fetch against https://api.anthropic.com/v1/messages so we don't add a
 * package dep. Output normalised to the gateway envelope.
 *
 * Required env: ANTHROPIC_API_KEY
 * Optional env: ANTHROPIC_API_BASE (default https://api.anthropic.com/v1)
 *               ANTHROPIC_API_VERSION (default 2023-06-01)
 */

const API_BASE = process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1";
const API_VERSION = process.env.ANTHROPIC_API_VERSION || "2023-06-01";

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} plan - { model, maxTokens, temperature, systemPrompt, tools, responseFormat, timeoutMs }
 */
export async function callAnthropic(messages, plan) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — cannot call Anthropic provider"
    );
  }

  // Anthropic requires system prompt as a separate field (not in messages[]),
  // and `role` must be either "user" or "assistant".
  const systemPrompt =
    plan.systemPrompt ||
    messages.find((m) => m.role === "system")?.content ||
    undefined;
  const convoMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: Array.isArray(m.content) ? m.content : String(m.content),
    }));

  const body = {
    model: plan.model,
    max_tokens: plan.maxTokens,
    temperature: plan.temperature,
    messages: convoMessages,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (Array.isArray(plan.tools) && plan.tools.length) body.tools = plan.tools;

  // Structured output: Anthropic does not have a native JSON mode, but we can
  // ask for JSON via system prompt. The grounded-generation layer handles
  // schema enforcement; here we just pass through.

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), plan.timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`anthropic ${response.status}: ${errBody.slice(0, 400)}`);
  }

  const data = await response.json();

  // data.content is an array of content blocks. For plain text: [{type:"text", text:"..."}].
  // For tool use: includes {type:"tool_use", id, name, input}.
  const textBlocks = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text)
    : [];
  const toolCallBlocks = Array.isArray(data.content)
    ? data.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input }))
    : [];

  return {
    text: textBlocks.join("\n\n"),
    tokensInput: data.usage?.input_tokens ?? 0,
    tokensOutput: data.usage?.output_tokens ?? 0,
    toolCalls: toolCallBlocks.length ? toolCallBlocks : undefined,
    rawResponse: data,
  };
}
