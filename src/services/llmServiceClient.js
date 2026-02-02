import SystemSetting from "../models/systemSettingModel.js";

const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || process.env.MCP_LLM_URL || "";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "").toLowerCase() || (LLM_SERVICE_URL ? "local" : "gemini");
const LOCAL_MODEL = process.env.LLM_MODEL || "llama3";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);

const buildServiceUrl = (path = "") => {
  if (!LLM_SERVICE_URL) return "";
  const base = LLM_SERVICE_URL.replace(/\/+$/, "");
  const tail = String(path || "").replace(/^\/+/, "");
  return `${base}/${tail}`;
};

const PROVIDERS = new Set(["gemini", "local"]);

const normalizeProvider = (value) => {
  if (!value) return null;
  const candidate = String(value).toLowerCase();
  return PROVIDERS.has(candidate) ? candidate : null;
};

let cachedProvider = null;
let cachedProviderAt = 0;
const PROVIDER_CACHE_MS = 60 * 1000;

const getActiveProvider = async () => {
  const now = Date.now();
  if (cachedProvider && now - cachedProviderAt < PROVIDER_CACHE_MS) {
    return cachedProvider;
  }
  try {
    const setting = await SystemSetting.findOne({ key: "llm_provider" }).lean();
    const provider = normalizeProvider(setting?.value?.provider);
    cachedProvider = provider || LLM_PROVIDER;
    cachedProviderAt = now;
    return cachedProvider;
  } catch (err) {
    cachedProvider = LLM_PROVIDER;
    cachedProviderAt = now;
    return cachedProvider;
  }
};

const resolveModel = (provider, model) => {
  if (provider === "gemini") {
    if (model && model !== LOCAL_MODEL) return model;
    return GEMINI_MODEL;
  }
  return model || LOCAL_MODEL;
};

const callGemini = async ({ prompt, model, temperature = 0.2, maxTokens = 1400 } = {}) => {
  if (!GEMINI_API_KEY || !prompt) return null;
  const effectiveModel = resolveModel("gemini", model);
  const url = `${GEMINI_API_BASE}/models/${effectiveModel}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${bodyText}`);
    }
    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? String(text).trim() : null;
  } catch (err) {
    console.warn("Gemini call failed:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const callLlmService = async ({ prompt, model, temperature = 0.2, maxTokens = 1400 } = {}) => {
  if (!prompt) return null;
  const provider = await getActiveProvider();
  if (provider === "gemini") {
    return callGemini({ prompt, model, temperature, maxTokens });
  }
  if (!LLM_SERVICE_URL) return null;
  const effectiveModel = resolveModel("local", model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(buildServiceUrl("v1/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: effectiveModel,
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

export { callLlmService, parseDocxWithService, LOCAL_MODEL as LLM_MODEL };
