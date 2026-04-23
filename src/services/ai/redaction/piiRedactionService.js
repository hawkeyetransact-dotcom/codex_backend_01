/**
 * PII / sensitive-data redaction — runs BEFORE any LLM call.
 *
 * Philosophy:
 *   - Default-on for every cloud-provider call.
 *   - Per-tenant policy can add custom patterns OR disable redaction for
 *     specific data types.
 *   - On-prem LLM route (provider = "local") bypasses redaction since data
 *     stays in the tenant's VPC.
 *   - Redaction is reversible via a per-request replacement map so we can
 *     un-redact the LLM's response where appropriate (e.g. the LLM echoes
 *     `[NAME_1]` and we re-insert the real name for the user).
 *
 * Returns { redactedPrompt, replacementMap, redactionsApplied: [{type, count}] }
 * where replacementMap is { "[NAME_1]": "Elena Vasquez", ... }.
 */

const DEFAULT_POLICY = {
  email: { enabled: true, placeholder: "[EMAIL]" },
  phone: { enabled: true, placeholder: "[PHONE]" },
  ssn: { enabled: true, placeholder: "[SSN]" },
  creditCard: { enabled: true, placeholder: "[CC]" },
  ipAddress: { enabled: false, placeholder: "[IP]" }, // off by default
  batchNumber: { enabled: false, placeholder: "[BATCH]" }, // opt-in
  patientId: { enabled: true, placeholder: "[PATIENT]" },
  apiKey: { enabled: true, placeholder: "[KEY]" },
  // Proper nouns (names / company names) are high-precision-low-recall —
  // tenant opts in if they want it.
  properNouns: { enabled: false, placeholder: "[NAME_N]" },
};

const PATTERNS = {
  // Order matters — more specific first.
  apiKey: /\b(sk-[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xoxb-[A-Za-z0-9-]{20,}|AKIA[A-Z0-9]{16})\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6011)[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  batchNumber: /\b(?:BATCH|LOT|BN)-?[\dA-Z]{4,}\b/gi,
  patientId: /\bPT-?[\dA-Z]{4,}\b|\bPATIENT[-:\s]?\d{4,}\b/gi,
  // properNouns: handled separately because regex alone is unreliable; we use
  // a simple stop-list of tenant-supplied names.
};

/**
 * Resolve the effective redaction policy for a tenant/provider pair.
 * Local (on-prem) LLMs skip redaction entirely.
 */
export function resolvePolicy({ provider, tenantPolicyOverrides } = {}) {
  if (provider === "local") {
    return { skipRedaction: true, policy: DEFAULT_POLICY };
  }
  const policy = { ...DEFAULT_POLICY };
  if (tenantPolicyOverrides && typeof tenantPolicyOverrides === "object") {
    for (const [k, v] of Object.entries(tenantPolicyOverrides)) {
      if (policy[k]) policy[k] = { ...policy[k], ...v };
    }
  }
  return { skipRedaction: false, policy };
}

/**
 * Redact a single string against the resolved policy.
 * Returns { redacted, replacementMap, redactionsApplied }.
 */
export function redactString(input, policyArgs = {}) {
  const { skipRedaction, policy } = resolvePolicy(policyArgs);
  if (skipRedaction || typeof input !== "string" || !input.length) {
    return { redacted: input, replacementMap: {}, redactionsApplied: [] };
  }

  let redacted = input;
  const replacementMap = {};
  const redactionsApplied = [];

  for (const [type, rule] of Object.entries(policy)) {
    if (!rule.enabled) continue;
    const pattern = PATTERNS[type];
    if (!pattern) continue;

    let count = 0;
    redacted = redacted.replace(pattern, (match) => {
      count++;
      const key = `[${type.toUpperCase()}_${count}]`;
      // Collapse exact duplicates to the same token so the LLM sees
      // stable identifiers rather than a flood of unique placeholders.
      for (const [existingKey, existingVal] of Object.entries(replacementMap)) {
        if (existingVal === match) return existingKey;
      }
      replacementMap[key] = match;
      return key;
    });

    if (count > 0) redactionsApplied.push({ type, count });
  }

  // Proper-noun redaction via tenant-supplied stop list (if enabled).
  if (policy.properNouns?.enabled && Array.isArray(policyArgs.properNounList)) {
    let nounIdx = 0;
    for (const name of policyArgs.properNounList) {
      if (!name || typeof name !== "string" || name.length < 3) continue;
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${esc}\\b`, "g");
      let count = 0;
      redacted = redacted.replace(regex, () => {
        count++;
        nounIdx++;
        const key = `[NAME_${nounIdx}]`;
        replacementMap[key] = name;
        return key;
      });
      if (count > 0) redactionsApplied.push({ type: "properNoun", count });
    }
  }

  return { redacted, replacementMap, redactionsApplied };
}

/**
 * Re-insert original values where the LLM echoed the placeholders.
 * Safe to call on any LLM output string; no-op if no placeholders found.
 */
export function unredactString(llmOutput, replacementMap) {
  if (!llmOutput || !replacementMap || !Object.keys(replacementMap).length) {
    return llmOutput;
  }
  let result = llmOutput;
  for (const [key, value] of Object.entries(replacementMap)) {
    // Escape regex special chars in the key — though our keys are
    // alphanumeric+brackets only, keep this safe for future key formats.
    const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escKey, "g"), value);
  }
  return result;
}

/**
 * Apply redaction to a messages[] array (multi-turn). Returns the same
 * shape, plus a single replacementMap that lets you unredact the final
 * response.
 */
export function redactMessages(messages, policyArgs) {
  const replacementMap = {};
  const redactionsApplied = [];
  const redactedMessages = messages.map((m) => {
    const { redacted, replacementMap: localMap, redactionsApplied: localApplied } =
      redactString(String(m.content ?? ""), policyArgs);
    Object.assign(replacementMap, localMap);
    for (const { type, count } of localApplied) {
      const existing = redactionsApplied.find((x) => x.type === type);
      if (existing) existing.count += count;
      else redactionsApplied.push({ type, count });
    }
    return { ...m, content: redacted };
  });
  return { redactedMessages, replacementMap, redactionsApplied };
}
