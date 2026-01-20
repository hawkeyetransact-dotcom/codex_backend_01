const COMPANY_SUFFIXES = [
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "co",
  "company",
  "corp",
  "corporation",
  "gmbh",
  "sarl",
  "sa",
  "bv",
  "plc",
  "llp",
  "pvt",
  "pte",
];

const normalizeWhitespace = (value = "") => value.replace(/\s+/g, " ").trim();

const stripPunctuation = (value = "") => value.replace(/[^\w\s]/g, " ");

export const normalizeApiName = (value = "") => {
  const cleaned = normalizeWhitespace(stripPunctuation(String(value).toLowerCase()));
  return cleaned;
};

export const normalizeSupplierName = (value = "") => {
  const cleaned = normalizeWhitespace(stripPunctuation(String(value).toLowerCase()));
  const parts = cleaned.split(" ");
  while (parts.length > 1 && COMPANY_SUFFIXES.includes(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(" ");
};

export const normalizeFirmName = (value = "") => normalizeSupplierName(value);

export const normalizeForLookup = (value = "") => normalizeWhitespace(stripPunctuation(String(value).toLowerCase()));
