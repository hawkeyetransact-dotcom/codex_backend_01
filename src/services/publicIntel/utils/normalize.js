import crypto from "crypto";

const stripSuffixes = (name = "") =>
  name
    .replace(/\b(ltd|limited|inc|inc\.|llc|co\.|corp|corporation|gmbh|s\.a\.|s\.a|pvt|private|plc)\b/gi, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const normalizeName = (name = "") => stripSuffixes(name || "");

export const normalizeCountry = (country = "") => (country || "").trim().toUpperCase();

export const makeSupplierKey = ({ name = "", country = "" }) => {
  const norm = `${normalizeName(name)}|${normalizeCountry(country)}`;
  return crypto.createHash("sha1").update(norm).digest("hex");
};

export const makeSiteKey = ({ supplier_key = "", address = "" }) => {
  const norm = `${supplier_key}|${(address || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
  return crypto.createHash("sha1").update(norm).digest("hex");
};

export const makeApiKey = (apiName = "") => {
  const norm = (apiName || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return crypto.createHash("sha1").update(norm).digest("hex");
};

