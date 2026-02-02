const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || process.env.MCP_LLM_URL || "";
const LLM_MODEL = process.env.LLM_MODEL || "llama3";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);

const buildServiceUrl = (path = "") => {
  if (!LLM_SERVICE_URL) return "";
  const base = LLM_SERVICE_URL.replace(/\/+$/, "");
  const tail = String(path || "").replace(/^\/+/, "");
  return `${base}/${tail}`;
};

const callLlmService = async ({ prompt, model, temperature = 0.2, maxTokens = 1400 } = {}) => {
  if (!LLM_SERVICE_URL || !prompt) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(buildServiceUrl("v1/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: model || LLM_MODEL,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM service ${res.status}: ${body}`);
    }
    const data = await res.json().catch(() => null);
    const text = data?.text ?? data?.response ?? data?.content;
    return text ? String(text).trim() : null;
  } catch (err) {
    console.warn("LLM service call failed:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const parseDocxWithService = async ({ buffer, filename = "document.docx" } = {}) => {
  if (!LLM_SERVICE_URL || !buffer) return null;
  try {
    const blob = new Blob([buffer]);
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await fetch(buildServiceUrl("v1/docx/parse"), { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM service ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    console.warn("LLM docx parse failed:", err?.message || err);
    return null;
  }
};

export { callLlmService, parseDocxWithService, LLM_MODEL };
