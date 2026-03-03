import OpenAI from "openai";

const DEFAULT_FALLBACK_DIMENSIONS = Math.min(
  1024,
  Math.max(128, Number(process.env.ASKHAWK_FALLBACK_VECTOR_DIMENSIONS || 512))
);
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_ENABLED = Boolean(process.env.OPENAI_API_KEY);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_EMBED_TIMEOUT_MS || 15000);
const EMBED_CACHE_LIMIT = Math.max(200, Number(process.env.ASKHAWK_EMBED_CACHE_LIMIT || 4000));

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "are",
  "was",
  "were",
  "your",
  "you",
  "into",
  "under",
  "shall",
  "should",
  "must",
  "may",
  "can",
  "not",
  "all",
  "any",
  "their",
  "there",
  "where",
  "which",
  "what",
  "when",
  "how",
  "who",
  "why",
  "about",
  "also",
  "gmp",
  "audit",
  "questionnaire",
  "question",
  "response",
  "please",
  "would",
  "could",
  "kindly",
  "screen",
  "page",
  "menu",
]);

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s./_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value = "") =>
  normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const hashToken = (value = "") => {
  let hash = 2166136261;
  const source = String(value || "");
  for (let idx = 0; idx < source.length; idx += 1) {
    hash ^= source.charCodeAt(idx);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
};

const normalizeUnitVector = (vector = []) => {
  const out = Array.isArray(vector) ? vector.map((value) => Number(value || 0)) : [];
  const norm = Math.sqrt(out.reduce((sum, item) => sum + item * item, 0));
  if (!norm) {
    return {
      vector: out,
      norm: 0,
    };
  }
  return {
    vector: out.map((item) => Number((item / norm).toFixed(8))),
    norm: 1,
  };
};

const cosineSimilarity = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let idx = 0; idx < len; idx += 1) {
    dot += Number(a[idx] || 0) * Number(b[idx] || 0);
  }
  return Number(dot.toFixed(8));
};

const lexicalVector = (text = "") => {
  const out = {};
  tokenize(text).forEach((token) => {
    out[token] = (out[token] || 0) + 1;
  });
  return out;
};

const lexicalCosine = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  keys.forEach((key) => {
    const va = Number(a?.[key] || 0);
    const vb = Number(b?.[key] || 0);
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  });
  if (!normA || !normB) return 0;
  return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(8));
};

const buildFallbackEmbedding = (text = "") => {
  const vector = new Array(DEFAULT_FALLBACK_DIMENSIONS).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) {
    return {
      vector,
      norm: 0,
      provider: "deterministic_hash",
      model: `hash-${DEFAULT_FALLBACK_DIMENSIONS}`,
      tokenCount: 0,
    };
  }

  tokens.forEach((token) => {
    const h1 = hashToken(token);
    const h2 = hashToken(`${token}_alt`);
    const index = h1 % DEFAULT_FALLBACK_DIMENSIONS;
    const sign = h2 % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  });

  const normalized = normalizeUnitVector(vector);
  return {
    vector: normalized.vector,
    norm: normalized.norm,
    provider: "deterministic_hash",
    model: `hash-${DEFAULT_FALLBACK_DIMENSIONS}`,
    tokenCount: tokens.length,
  };
};

const openAiClient = OPENAI_ENABLED
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
    })
  : null;

const embedCache = new Map();

const cacheGet = (key) => {
  if (!embedCache.has(key)) return null;
  const value = embedCache.get(key);
  embedCache.delete(key);
  embedCache.set(key, value);
  return value;
};

const cacheSet = (key, value) => {
  embedCache.set(key, value);
  if (embedCache.size <= EMBED_CACHE_LIMIT) return;
  const first = embedCache.keys().next().value;
  if (first) embedCache.delete(first);
};

const cacheKeyForText = (text = "") => normalizeText(text).slice(0, 4000);

const embedWithOpenAi = async (text = "") => {
  if (!openAiClient) return null;
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const response = await openAiClient.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: normalized,
  });
  const vector = Array.isArray(response?.data?.[0]?.embedding)
    ? response.data[0].embedding.map((value) => Number(value || 0))
    : [];
  if (!vector.length) return null;

  const normalizedVector = normalizeUnitVector(vector);
  return {
    vector: normalizedVector.vector,
    norm: normalizedVector.norm,
    provider: "openai",
    model: OPENAI_EMBEDDING_MODEL,
    tokenCount: tokenize(text).length,
  };
};

const embedText = async (text = "") => {
  const key = cacheKeyForText(text);
  if (!key) return buildFallbackEmbedding("");

  const cached = cacheGet(key);
  if (cached) return cached;

  let embedded = null;
  if (openAiClient) {
    try {
      embedded = await embedWithOpenAi(text);
    } catch (error) {
      console.warn("askhawk embedWithOpenAi failed; using fallback", error?.message || error);
    }
  }

  const result = embedded || buildFallbackEmbedding(text);
  cacheSet(key, result);
  return result;
};

export const AskHawkEmbeddingService = {
  normalizeText,
  tokenize,
  lexicalVector,
  lexicalCosine,
  cosineSimilarity,
  normalizeUnitVector,
  buildFallbackEmbedding,
  embedText,
};

