/**
 * Shared types + helpers for audit agents.
 */

/**
 * Canonical provenance envelope. Every data point surfaced to the UI must
 * be wrapped in this shape so public vs tenant vs unknown is always clear.
 *
 * @typedef {{
 *   value: any,
 *   source: "openFDA" | "pharmaCompass" | "fdaWarningLetter" | "tenant" | "manual" | "inferred" | "unknown",
 *   fetchedAt: string,
 *   confidence: number,
 *   url?: string,
 *   ref?: string,  // tenant record id when source === "tenant"
 * }} ProvenancedValue
 */

export function provenanced(value, source, opts = {}) {
  return {
    value,
    source,
    fetchedAt: opts.fetchedAt || new Date().toISOString(),
    confidence: typeof opts.confidence === "number" ? opts.confidence : 1.0,
    url: opts.url,
    ref: opts.ref,
  };
}

/**
 * Normalise a supplier name for fuzzy match.
 */
export function normaliseName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bltd\.?|inc\.?|corp\.?|limited|incorporated|llc|co\.?|gmbh|plc|pvt\.?|pte\.?|sa\.?|ag\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaro-Winkler-ish cheap similarity on normalised names. Returns 0..1.
 */
export function nameSimilarity(a, b) {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length < y.length ? x : y;
  if (longer.length === 0) return 1;
  // Edit distance (Levenshtein) — cheap enough for our cardinality.
  const dp = Array.from({ length: longer.length + 1 }, () => new Array(shorter.length + 1).fill(0));
  for (let i = 0; i <= longer.length; i++) dp[i][0] = i;
  for (let j = 0; j <= shorter.length; j++) dp[0][j] = j;
  for (let i = 1; i <= longer.length; i++) {
    for (let j = 1; j <= shorter.length; j++) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const editDist = dp[longer.length][shorter.length];
  return 1 - editDist / longer.length;
}

/**
 * Simple in-memory TTL cache to avoid hammering free-tier public APIs.
 */
const CACHE = new Map();
export function ttlCacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { CACHE.delete(key); return null; }
  return entry.value;
}
export function ttlCacheSet(key, value, ttlSeconds = 600) {
  CACHE.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Respectful fetch — honours rate-limits + times out.
 */
export async function respectfulFetch(url, opts = {}, { timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: {
        "User-Agent": "HawkeyeAuditAgent/1.0 (+https://hawkeyesmart.com)",
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
