/**
 * Pure-function redactor. Stateless — caller passes the token store separately.
 *
 * Default rule library covers PHI/PII classes; customers extend via rule-set JSON.
 *
 * Token format: [<TYPE>_<HASH8>] — stable per (text, type) pair so the LLM can
 * reason about repeated entities consistently within one prompt.
 */
import crypto from "node:crypto";

export const DEFAULT_RULES = [
  // Patient identifiers
  { type: "EMAIL", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "SSN_US", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "AADHAAR_IN", pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g },
  { type: "PHONE_US", pattern: /\b(?:\+1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
  { type: "DOB", pattern: /\b(0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])[/-](19|20)\d\d\b/g },
  { type: "MRN", pattern: /\bMRN[-:]?\s?[A-Z0-9]{6,12}\b/gi },
  // Pharma-specific
  { type: "LOT", pattern: /\bLOT[-:]?\s?[A-Z0-9]{4,16}\b/gi },
  { type: "BATCH", pattern: /\bBATCH[-:]?\s?[A-Z0-9]{4,16}\b/gi },
  // API keys / tokens (defense-in-depth)
  { type: "API_KEY", pattern: /\b(?:sk|pk|key|tok)[-_][A-Za-z0-9]{20,}\b/g },
];

function tokenFor(type, value) {
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `[${type}_${hash}]`;
}

/**
 * Redact a single string + emit token map for un-redaction later.
 * @returns {{ redacted: string, replacements: Map<string,string>, hits: number }}
 */
export function redactText(text, rules = DEFAULT_RULES) {
  if (!text || typeof text !== "string") return { redacted: text, replacements: new Map(), hits: 0 };
  let out = text;
  const replacements = new Map();
  let hits = 0;
  for (const rule of rules) {
    out = out.replace(rule.pattern, (match) => {
      const token = tokenFor(rule.type, match);
      replacements.set(token, match);
      hits++;
      return token;
    });
  }
  return { redacted: out, replacements, hits };
}

/**
 * Reverse the redaction using the token map (or external store).
 */
export function unredactText(text, replacements) {
  if (!text || !replacements) return text;
  let out = text;
  // Iterate from longest token first to avoid prefix collisions
  const sorted = [...replacements.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [token, value] of sorted) {
    out = out.split(token).join(value);
  }
  return out;
}

/**
 * Redact a chat-style messages[] array (system + user + assistant prompts).
 */
export function redactMessages(messages, rules = DEFAULT_RULES) {
  const merged = new Map();
  let totalHits = 0;
  const redactedMessages = messages.map((m) => {
    const { redacted, replacements, hits } = redactText(m.content || "", rules);
    for (const [k, v] of replacements) merged.set(k, v);
    totalHits += hits;
    return { ...m, content: redacted };
  });
  return { redactedMessages, replacements: merged, totalHits };
}
