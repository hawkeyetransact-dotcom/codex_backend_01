// backend/src/services/vocabularyService.js
// Resolves tenant-specific vocabulary overrides with defaults fallback.
// Cached per tenantId with 5-minute TTL.

import ModuleConfig from "../models/ModuleConfigModel.js";

export const DEFAULT_VOCABULARY = {
  audit: "Audit",
  supplier: "Supplier",
  buyer: "Buyer",
  auditor: "Auditor",
  product: "Product",
  site: "Site",
  finding: "Finding",
  capa: "CAPA",
  report: "Report",
};

const vocabularyCache = new Map(); // tenantId → { vocab, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getVocabulary = async (tenantId) => {
  const key = String(tenantId);
  const cached = vocabularyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.vocab;

  const config = await ModuleConfig.findOne({ tenantId }).lean();
  const overrides = config?.vocabularyOverrides ?? {};

  const vocab = Object.fromEntries(
    Object.entries(DEFAULT_VOCABULARY).map(([k, defaultVal]) => [
      k,
      overrides[k] || defaultVal,
    ])
  );

  vocabularyCache.set(key, { vocab, expiresAt: Date.now() + CACHE_TTL_MS });

  return vocab;
};

export const invalidateVocabularyCache = (tenantId) => {
  vocabularyCache.delete(String(tenantId));
};
