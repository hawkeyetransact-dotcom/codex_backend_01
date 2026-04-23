/**
 * OpenAI (GPT) provider adapter.
 *
 * Uses the `openai` npm package already installed. Output normalised to
 * the gateway envelope.
 *
 * Required env: OPENAI_API_KEY
 * Optional env: OPENAI_API_BASE (self-hosted / Azure compat)
 */
import OpenAI from "openai";

let client;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not set — cannot call OpenAI provider"
      );
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE || undefined,
    });
  }
  return client;
}

/**
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} plan - { model, maxTokens, temperature, systemPrompt, tools, responseFormat, timeoutMs }
 */
export async function callOpenAI(messages, plan) {
  const api = getClient();

  // OpenAI accepts "system"/"user"/"assistant" roles directly in messages[].
  const effectiveMessages = [...messages];
  if (plan.systemPrompt && !effectiveMessages.some((m) => m.role === "system")) {
    effectiveMessages.unshift({ role: "system", content: plan.systemPrompt });
  }

  const payload = {
    model: plan.model,
    messages: effectiveMessages,
    max_tokens: plan.maxTokens,
    temperature: plan.temperature,
  };
  if (plan.responseFormat === "json") {
    payload.response_format = { type: "json_object" };
  }
  if (Array.isArray(plan.tools) && plan.tools.length) {
    payload.tools = plan.tools;
    payload.tool_choice = "auto";
  }

  const response = await api.chat.completions.create(payload, {
    timeout: plan.timeoutMs,
  });

  const choice = response.choices?.[0];
  const text = choice?.message?.content || "";
  const toolCalls = Array.isArray(choice?.message?.tool_calls)
    ? choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function?.name,
        input: safeParseJson(tc.function?.arguments),
      }))
    : undefined;

  return {
    text,
    tokensInput: response.usage?.prompt_tokens ?? 0,
    tokensOutput: response.usage?.completion_tokens ?? 0,
    toolCalls,
    rawResponse: response,
  };
}

function safeParseJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: String(raw) };
  }
}
