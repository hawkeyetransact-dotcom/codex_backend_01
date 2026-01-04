import HawkPolicy from "../models/hawkPolicyModel.js";

const DEFAULT_REGEXES = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // email
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // phone
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // simple names
];

export const sanitizeForLLM = async (text, { tenantId, role } = {}) => {
  let policy = null;
  if (tenantId) {
    policy = await HawkPolicy.findOne({ tenantId, role, tags: { $in: ["redaction"] } }).lean();
  }
  const custom = (policy?.body || "").split(/\s+/).filter(Boolean);
  const regexes = [...DEFAULT_REGEXES, ...custom.map((w) => new RegExp(w, "gi"))];
  let sanitized = text || "";
  regexes.forEach((re) => {
    sanitized = sanitized.replace(re, "[REDACTED]");
  });
  return sanitized;
};
