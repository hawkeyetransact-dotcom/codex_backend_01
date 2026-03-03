import multer from "multer";
import mongoose from "mongoose";
import { DigiLockerDocument } from "../models/digilockerDocumentModel.js";
import { DigiLockerDocumentVersion } from "../models/digilockerDocumentVersionModel.js";
import { extractTextFromBuffer } from "../services/questionnaireExtractionService.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";
import { readExtractedText } from "../services/digilocker/digilockerStorageService.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 25 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "image/jpeg",
      "image/png",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, Word, Excel, text, or image files are allowed"), false);
    }
    return cb(null, true);
  },
});

export const profileImportUpload = upload.any();

const EMPTY_FIELDS = {
  email: "",
  title: "",
  firstName: "",
  lastName: "",
  companyName: "",
  phone: "",
  countryCode: "",
  gender: "",
  addressline1: "",
  addressline2: "",
  addressline3: "",
  city: "",
  state: "",
  country: "",
  zipcode: "",
  linkedinUrl: "",
  resumeUrl: "",
};

const EMPTY_ONBOARDING = {
  primaryInfo: { ...EMPTY_FIELDS },
  locations: [],
  products: [],
};

const FIELD_KEYS = Object.keys(EMPTY_FIELDS);
const CRITICAL_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "companyName",
  "addressline1",
  "city",
  "state",
  "country",
  "zipcode",
];
const INVALID_VALUE_RE =
  /^(na|n\/a|none|null|nil|unknown|not available|not provided|tbd|to be confirmed|not applicable|--|-)$/i;

const ADDRESS_STOP_RE =
  /^(phone|telephone|mobile|email|fax|website|web|contact|country|state|city|zip|zipcode|postal|gst|pan|cin|tin|vat)\b/i;
const PROFILE_CONTEXT_RE =
  /\b(company|organization|organisation|supplier|manufacturer|site|address|location|contact|person|name|phone|mobile|email|city|state|country|zip|postal|head office|registered office|plant)\b/i;
const COMPANY_HINT_RE =
  /\b(ltd|limited|inc|llc|corp|corporation|plc|gmbh|ag|pvt|private|pharma|pharmaceutical|lifescience|life science|biotech|laboratories|labs|industries|solutions|sciences)\b/i;

const COUNTRY_HINTS = [
  "india",
  "united states",
  "usa",
  "united kingdom",
  "uk",
  "germany",
  "france",
  "italy",
  "spain",
  "ireland",
  "switzerland",
  "singapore",
  "china",
  "japan",
  "canada",
  "australia",
  "brazil",
  "mexico",
  "south korea",
  "netherlands",
  "belgium",
];

const ALLOWED_ROLES = new Set(["supplier", "supplierUser", "auditor", "buyer", "tenant_admin", "admin", "superadmin"]);

const toObjectIdIfValid = (value) => {
  if (!value) return value;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : value;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

const parseStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseStringArray(parsed);
      } catch {
        return [];
      }
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeValue = (value) => {
  if (value === undefined || value === null) return "";
  const cleaned = String(value)
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-]+/, "")
    .replace(/[\s:;,\-]+$/, "")
    .trim();
  if (!cleaned || INVALID_VALUE_RE.test(cleaned)) return "";
  return cleaned;
};

const hasValue = (value) => Boolean(normalizeValue(value));

const toLines = (text = "") =>
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const normalizePhoneNumber = (value = "") => {
  const raw = normalizeValue(value);
  if (!raw) return "";
  const keepPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits || digits.length < 8) return "";
  return keepPlus ? `+${digits}` : digits;
};

const normalizeCountryCode = (value = "") => {
  const raw = normalizeValue(value);
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits || digits.length < 1 || digits.length > 4) return "";
  return `+${digits}`;
};

const deriveCountryCodeFromPhone = (phone = "") => {
  const normalized = normalizeValue(phone);
  if (!normalized || !normalized.startsWith("+")) return "";
  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits || digits.length < 8) return "";
  const ccLen = digits.length > 11 ? 3 : digits.length > 10 ? 2 : 1;
  return `+${digits.slice(0, ccLen)}`;
};

const isLikelyKeyValueLine = (line = "") => {
  const trimmed = normalizeValue(line);
  if (!trimmed) return false;
  return /^[A-Za-z][A-Za-z0-9/&(),.'\s]{1,60}\s*[:=\-]\s*\S+/.test(trimmed);
};

const parseJsonObject = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

const parseNameParts = (value = "") => {
  const nameRaw = normalizeValue(value);
  if (!nameRaw) return {};
  let title = "";
  let fullName = nameRaw;
  const titleMatch = nameRaw.match(/^(mr|mrs|ms|dr)\.?\s+/i);
  if (titleMatch) {
    title = titleMatch[1];
    fullName = normalizeValue(nameRaw.replace(/^(mr|mrs|ms|dr)\.?\s+/i, ""));
  }
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) {
    return { title, fullName, firstName: parts[0] };
  }
  return {
    title,
    fullName,
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const mapKeyToField = (rawKey = "") => {
  const key = normalizeValue(rawKey)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return "";
  if (/(^| )email( id| address)?$/.test(key)) return "email";
  if (/(^| )linkedin( profile| url)?$/.test(key)) return "linkedinUrl";
  if (
    /(phone|mobile|contact number|telephone|tel no|tel number|contact no)/.test(
      key
    )
  )
    return "phone";
  if (/(country code|dial code|isd code)/.test(key)) return "countryCode";
  if (
    /(company|organization|organisation|legal name|supplier name|manufacturer name|business name|entity name|firm name)/.test(
      key
    )
  )
    return "companyName";
  if (
    /(full name|contact person|contact name|name of contact|authorized signatory|attn|attention|prepared by|person responsible)/.test(
      key
    )
  )
    return "fullName";
  if (/^name$/.test(key)) return "fullName";
  if (/^title$/.test(key)) return "title";
  if (/^first name$|forename|given name/.test(key)) return "firstName";
  if (/^last name$|surname|family name/.test(key)) return "lastName";
  if (/^gender$|sex/.test(key)) return "gender";
  if (/address line 1|address1|addr1|street address|registered address|site address/.test(key))
    return "addressline1";
  if (/address line 2|address2|addr2/.test(key)) return "addressline2";
  if (/address line 3|address3|addr3/.test(key)) return "addressline3";
  if (/(^| )address$/.test(key)) return "addressline1";
  if (/^city$|town/.test(key)) return "city";
  if (/^state$|province|region/.test(key)) return "state";
  if (/^country$/.test(key)) return "country";
  if (/zip|zipcode|postal|pincode|pin code/.test(key)) return "zipcode";
  return "";
};

const enrichAddressFields = (result = {}) => {
  const merged = { ...result };
  const address = normalizeValue(
    [merged.addressline1, merged.addressline2, merged.addressline3]
      .filter(Boolean)
      .join(", ")
  );
  if (!address) return merged;

  if (!hasValue(merged.zipcode)) {
    const zip = address.match(/\b\d{5,6}(?:-\d{4})?\b/);
    if (zip) merged.zipcode = zip[0];
  }
  if (!hasValue(merged.country)) {
    const lc = address.toLowerCase();
    const country = COUNTRY_HINTS.find((item) => lc.includes(item));
    if (country) merged.country = country;
  }

  const parts = address
    .split(",")
    .map((item) => normalizeValue(item))
    .filter(Boolean);
  if (!hasValue(merged.city) && parts.length >= 2) {
    merged.city = parts[Math.max(parts.length - 3, 0)] || "";
  }
  if (!hasValue(merged.state) && parts.length >= 2) {
    merged.state = parts[Math.max(parts.length - 2, 0)] || "";
  }
  return merged;
};

const extractFromKeyValuePairs = (text = "") => {
  const lines = toLines(text);
  const result = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(
      /^([A-Za-z][A-Za-z0-9/&(),.'\s]{1,60})\s*[:=\-]\s*(.+)$/
    );
    if (!match) continue;
    const key = normalizeValue(match[1]);
    let value = normalizeValue(match[2]);
    if (!value) continue;
    const field = mapKeyToField(key);
    if (!field) continue;

    if (field.startsWith("addressline")) {
      const continuation = [];
      for (let j = i + 1; j < lines.length && continuation.length < 3; j += 1) {
        const nextLine = lines[j];
        if (!nextLine || isLikelyKeyValueLine(nextLine) || ADDRESS_STOP_RE.test(nextLine)) break;
        continuation.push(nextLine);
      }
      if (continuation.length) {
        value = normalizeValue([value, ...continuation].join(", "));
      }
    }

    if (field === "fullName") {
      result.fullName = result.fullName || value;
      continue;
    }
    if (!hasValue(result[field])) {
      result[field] = value;
    }
  }

  return enrichAddressFields(result);
};

const extractFromHeuristicPatterns = (text = "") => {
  const result = {};
  const lines = toLines(text);
  if (!lines.length) return result;

  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (emailMatches.length) {
    result.email = normalizeValue(emailMatches[0]).toLowerCase();
  }

  const linkedinMatch = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i);
  if (linkedinMatch) result.linkedinUrl = normalizeValue(linkedinMatch[0]);

  const phoneMatches = text.match(/(?:\+\d{1,4}[\s-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{3,5}/g) || [];
  const normalizedPhones = phoneMatches
    .map((item) => normalizePhoneNumber(item))
    .filter((item) => item.length >= 10)
    .sort((a, b) => b.length - a.length);
  if (normalizedPhones.length) {
    result.phone = normalizedPhones[0];
  }

  const titledNameMatch = text.match(
    /\b(Mr|Mrs|Ms|Dr)\.?\s+([A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+){0,3})/m
  );
  if (titledNameMatch) {
    const parsed = parseNameParts(`${titledNameMatch[1]} ${titledNameMatch[2]}`);
    if (parsed.title) result.title = parsed.title;
    if (parsed.fullName) result.fullName = parsed.fullName;
    if (parsed.firstName) result.firstName = parsed.firstName;
    if (parsed.lastName) result.lastName = parsed.lastName;
  }

  const contactLine = lines.find((line) =>
    /\b(contact person|contact name|authorized signatory|attn|attention)\b/i.test(line)
  );
  if (contactLine && !hasValue(result.fullName)) {
    const split = contactLine.split(/[:\-]/);
    const guess = split.length > 1 ? split.slice(1).join(" ") : contactLine;
    const parsed = parseNameParts(guess);
    if (parsed.fullName) result.fullName = parsed.fullName;
    if (parsed.firstName) result.firstName = parsed.firstName;
    if (parsed.lastName) result.lastName = parsed.lastName;
    if (parsed.title && !hasValue(result.title)) result.title = parsed.title;
  }

  const companyLabelLine = lines.find((line) =>
    /\b(company|organization|organisation|manufacturer|supplier)\b/i.test(line)
  );
  if (companyLabelLine) {
    const split = companyLabelLine.split(/[:\-]/);
    const labelValue = split.length > 1 ? split.slice(1).join(" ") : "";
    if (hasValue(labelValue)) result.companyName = normalizeValue(labelValue);
  }

  if (!hasValue(result.companyName)) {
    const companyLine = lines
      .slice(0, 120)
      .find(
        (line) =>
          COMPANY_HINT_RE.test(line) &&
          !isLikelyKeyValueLine(line) &&
          !/\b(quality|sop|index|procedure|policy|report|template|version|document)\b/i.test(line)
      );
    if (companyLine) result.companyName = normalizeValue(companyLine);
  }

  const addressBlockMatch = text.match(
    /(?:registered office|site address|address|location)\s*[:\-]\s*([^\n]+(?:\n(?!\s*(?:phone|email|fax|website|contact|gst|pan|cin|vat)\b).+){0,2})/i
  );
  if (addressBlockMatch) {
    const address = normalizeValue(addressBlockMatch[1].replace(/\r?\n/g, ", "));
    if (address) result.addressline1 = address;
  }

  const cityStateZipMatch = text.match(
    /\b([A-Za-z][A-Za-z .'-]{1,40})\s*,\s*([A-Za-z][A-Za-z .'-]{1,40})\s+(\d{5,6}(?:-\d{4})?)\b/
  );
  if (cityStateZipMatch) {
    result.city = result.city || normalizeValue(cityStateZipMatch[1]);
    result.state = result.state || normalizeValue(cityStateZipMatch[2]);
    result.zipcode = result.zipcode || normalizeValue(cityStateZipMatch[3]);
  }

  const countryFromText = COUNTRY_HINTS.find((country) =>
    String(text || "").toLowerCase().includes(country)
  );
  if (countryFromText && !hasValue(result.country)) {
    result.country = countryFromText;
  }

  return enrichAddressFields(result);
};

const basicExtractFromText = (text = "") => {
  const fromPattern = extractFromHeuristicPatterns(text);
  const fromKeyValue = extractFromKeyValuePairs(text);
  return {
    ...fromPattern,
    ...fromKeyValue,
  };
};

const normalizeExtracted = (raw = {}) => {
  const cleaned = { ...EMPTY_FIELDS };
  const source = raw || {};
  Object.keys(EMPTY_FIELDS).forEach((key) => {
    if (source[key] !== undefined && source[key] !== null) {
      cleaned[key] = normalizeValue(source[key]);
    }
  });

  const fullName = normalizeValue(source.fullName || source.name);
  if ((!cleaned.firstName || !cleaned.lastName) && fullName) {
    const parsedName = parseNameParts(fullName);
    if (parsedName.firstName && !cleaned.firstName) cleaned.firstName = parsedName.firstName;
    if (parsedName.lastName && !cleaned.lastName) cleaned.lastName = parsedName.lastName;
    if (parsedName.title && !cleaned.title) cleaned.title = parsedName.title;
  }

  cleaned.email = normalizeValue(cleaned.email).toLowerCase();
  cleaned.phone = normalizePhoneNumber(cleaned.phone);
  const explicitCountryCode = normalizeCountryCode(cleaned.countryCode);
  cleaned.countryCode = explicitCountryCode || deriveCountryCodeFromPhone(cleaned.phone);
  cleaned.companyName = normalizeValue(
    cleaned.companyName.replace(/\b(company|organization|organisation)\s*name\s*[:\-]?\s*/i, "")
  );

  return enrichAddressFields(cleaned);
};

const countCriticalFields = (fields = {}) =>
  CRITICAL_PROFILE_FIELDS.reduce(
    (count, key) => (hasValue(fields[key]) ? count + 1 : count),
    0
  );

const getMissingCriticalFields = (fields = {}) =>
  CRITICAL_PROFILE_FIELDS.filter((key) => !hasValue(fields[key]));

const mergeExtractedFields = (...sources) => {
  const merged = { ...EMPTY_FIELDS };
  sources
    .filter(Boolean)
    .forEach((source) => {
      const normalized = normalizeExtracted(source);
      FIELD_KEYS.forEach((key) => {
        if (!hasValue(merged[key]) && hasValue(normalized[key])) {
          merged[key] = normalized[key];
        }
      });
    });
  return normalizeExtracted(merged);
};

const buildPrompt = (role) => {
  const normalizedRole = String(role || "").toLowerCase();
  const label =
    normalizedRole === "auditor"
      ? "auditor"
      : normalizedRole === "buyer"
      ? "buyer"
      : normalizedRole === "supplieruser"
      ? "supplier"
      : normalizedRole;
  return `Extract ${label} profile data from the document below.
Return a JSON object with these exact keys:
email, title, firstName, lastName, companyName, phone, countryCode, gender, addressline1, addressline2, addressline3, city, state, country, zipcode, linkedinUrl, resumeUrl.
Use empty string when unknown. Do not add extra keys.`;
};

const buildProfileContextSnippet = (text = "", maxChars = 18000) => {
  const lines = toLines(text);
  if (!lines.length) return "";
  const selected = [];
  const seen = new Set();
  const push = (line) => {
    const value = normalizeValue(line);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(value);
  };

  lines.slice(0, 80).forEach((line) => push(line));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!PROFILE_CONTEXT_RE.test(line)) continue;
    push(lines[i - 1] || "");
    push(line);
    push(lines[i + 1] || "");
  }

  const snippet = selected.join("\n");
  return snippet.length > maxChars ? snippet.slice(0, maxChars) : snippet;
};

const extractWithLLM = async (text, role) => {
  if (!text) return null;
  const snippet = buildProfileContextSnippet(text, 18000) || text.slice(0, 18000);
  const prompt = `${buildPrompt(role)}\nDocument:\n${snippet}`;
  try {
    const content = await callLlmService({
      prompt,
      model: process.env.PROFILE_IMPORT_MODEL || LLM_MODEL,
      maxTokens: 900,
      temperature: 0.2,
    });
    return parseJsonObject(content || "");
  } catch (err) {
    console.warn("profile import llm failed", err.message);
    return null;
  }
};

const buildFocusedPrompt = (role, missingFields = []) => {
  const keys = missingFields.length ? missingFields.join(", ") : CRITICAL_PROFILE_FIELDS.join(", ");
  return `Extract missing ${role} profile fields from the evidence below.
Return a single JSON object with ONLY these keys:
${keys}
If a value is unknown, return empty string.
Do not include commentary or markdown.`;
};

const extractWithFocusedLLM = async (text, role, missingFields = []) => {
  if (!text || !missingFields.length) return null;
  const snippet = buildProfileContextSnippet(text, 14000);
  if (!snippet) return null;
  const prompt = `${buildFocusedPrompt(role, missingFields)}\nEvidence:\n${snippet}`;
  try {
    const content = await callLlmService({
      prompt,
      model: process.env.PROFILE_IMPORT_MODEL || LLM_MODEL,
      maxTokens: 450,
      temperature: 0.1,
    });
    return parseJsonObject(content || "");
  } catch (err) {
    console.warn("profile import focused llm failed", err.message);
    return null;
  }
};

const extractProfileFields = async (text, role) => {
  const baseHeuristic = basicExtractFromText(text);
  const llmPrimary = await extractWithLLM(text, role);
  let merged = mergeExtractedFields(llmPrimary, baseHeuristic);

  if (countCriticalFields(merged) < 5) {
    const missingCritical = getMissingCriticalFields(merged);
    const llmFocused = await extractWithFocusedLLM(text, role, missingCritical);
    merged = mergeExtractedFields(llmPrimary, llmFocused, baseHeuristic);
  }
  return merged;
};

const buildOnboardingPrompt = (role) => {
  const normalizedRole = String(role || "").toLowerCase();
  if (normalizedRole === "auditor") {
    return `Extract onboarding hints for auditor registration from the document below.
Return a JSON object with these exact keys:
locations, products.
locations must be an empty array [].
products must be an empty array [].
Do not add extra keys.`;
  }
  return `Extract onboarding hints for ${normalizedRole || "supplier"} onboarding from the document below.
Return a JSON object with these exact keys:
locations, products.
locations is an array of objects with keys:
siteName, plantId, addressLine1, addressLine2, addressLine3, city, state, country, zipcode, title, firstName, lastName, contactEmail, countryCode, contactNumber.
products is an array of objects with keys:
name, casNumber, description, apiTechnology, dosageForm, manufacturingRole.
Use empty string when unknown and [] when no records are found.
Do not add extra keys.`;
};

const extractOnboardingWithLLM = async (text, role) => {
  if (!text) return null;
  const prompt = `${buildOnboardingPrompt(role)}\nDocument:\n${text.slice(0, 22000)}`;
  try {
    const content = await callLlmService({
      prompt,
      model: process.env.PROFILE_IMPORT_MODEL || LLM_MODEL,
      maxTokens: 1300,
      temperature: 0.2,
    });
    return parseJsonObject(content || "");
  } catch (err) {
    console.warn("profile import onboarding llm failed", err.message);
    return null;
  }
};

const hasUsedOcr = (details = []) => details.some((item) => Boolean(item?.usedOcr));

const normalizeOnboardingExtracted = (raw = {}, fields = {}, role = "supplier") => {
  const source = raw || {};
  const normalizedRole = String(role || "").toLowerCase();
  const locationsRaw = Array.isArray(source.locations) ? source.locations : [];
  const productsRaw = Array.isArray(source.products) ? source.products : [];

  const locations = locationsRaw
    .map((item = {}) => ({
      siteName: normalizeValue(item.siteName || item.name),
      plantId: normalizeValue(item.plantId || item.plantID || item.siteCode),
      addressLine1: normalizeValue(item.addressLine1 || item.addressline1),
      addressLine2: normalizeValue(item.addressLine2 || item.addressline2),
      addressLine3: normalizeValue(item.addressLine3 || item.addressline3),
      city: normalizeValue(item.city),
      state: normalizeValue(item.state),
      country: normalizeValue(item.country),
      zipcode: normalizeValue(item.zipcode || item.postalCode),
      title: normalizeValue(item.title || fields.title),
      firstName: normalizeValue(item.firstName || item.contactFirstName || fields.firstName),
      lastName: normalizeValue(item.lastName || item.contactLastName || fields.lastName),
      contactEmail: normalizeValue(item.contactEmail || item.email || fields.email),
      countryCode: normalizeValue(item.countryCode || fields.countryCode),
      contactNumber: normalizeValue(item.contactNumber || item.phone || fields.phone),
    }))
    .filter(
      (item) =>
        item.siteName ||
        item.plantId ||
        item.addressLine1 ||
        item.city ||
        item.state ||
        item.country
    )
    .slice(0, 5);

  const products = productsRaw
    .map((item = {}) => ({
      name: normalizeValue(item.name || item.productName || item.apiName),
      casNumber: normalizeValue(item.casNumber || item.casNo),
      description: normalizeValue(item.description),
      apiTechnology: normalizeValue(item.apiTechnology),
      dosageForm: normalizeValue(item.dosageForm),
      manufacturingRole: normalizeValue(item.manufacturingRole || "API"),
    }))
    .filter((item) => item.name || item.casNumber || item.description)
    .slice(0, 10);

  if (
    !locations.length &&
    (normalizedRole === "supplier" || normalizedRole === "buyer") &&
    (fields.companyName || fields.addressline1 || fields.country || fields.city)
  ) {
    locations.push({
      siteName: normalizeValue(fields.companyName || "Primary Site"),
      plantId: "",
      addressLine1: normalizeValue(fields.addressline1),
      addressLine2: normalizeValue(fields.addressline2),
      addressLine3: normalizeValue(fields.addressline3),
      city: normalizeValue(fields.city),
      state: normalizeValue(fields.state),
      country: normalizeValue(fields.country),
      zipcode: normalizeValue(fields.zipcode),
      title: normalizeValue(fields.title),
      firstName: normalizeValue(fields.firstName),
      lastName: normalizeValue(fields.lastName),
      contactEmail: normalizeValue(fields.email),
      countryCode: normalizeValue(fields.countryCode),
      contactNumber: normalizeValue(fields.phone),
    });
  }

  return {
    primaryInfo: { ...EMPTY_FIELDS, ...fields },
    locations,
    products,
  };
};

const loadUploadedFileTexts = async (files = []) => {
  let text = "";
  const details = [];
  for (const file of files) {
    if (!file?.buffer) continue;
    const parsed = await extractTextFromBuffer(file.mimetype, file.buffer);
    const extractedText = String(parsed?.text || "").trim();
    if (extractedText) {
      text += `\n${extractedText}`;
      details.push({
        fileName: file.originalname || "upload",
        source: parsed?.source || "upload",
        usedOcr: Boolean(parsed?.usedOcr),
      });
    }
  }
  return { text: text.trim(), details };
};

const loadDigiLockerText = async ({
  tenantId,
  userId,
  selectedDocumentIds = [],
  includeAllDocuments = false,
  maxDocuments = 40,
}) => {
  if (!userId || (!includeAllDocuments && !selectedDocumentIds.length)) {
    return { text: "", details: [], scanned: 0 };
  }

  const filter = {
    supplierOrgId: toObjectIdIfValid(userId),
  };
  if (tenantId) {
    filter.tenantId = toObjectIdIfValid(tenantId);
  }
  if (selectedDocumentIds.length) {
    const validIds = selectedDocumentIds
      .map((id) => toObjectIdIfValid(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (!validIds.length) {
      return { text: "", details: [], scanned: 0 };
    }
    filter._id = { $in: validIds };
  }

  const docs = await DigiLockerDocument.find(filter)
    .sort({ updatedAt: -1 })
    .limit(maxDocuments)
    .select("_id title currentVersionId")
    .lean();
  if (!docs.length) return { text: "", details: [], scanned: 0 };

  const versionIds = docs
    .map((doc) => doc?.currentVersionId)
    .filter(Boolean)
    .map((id) => String(id));
  if (!versionIds.length) {
    return { text: "", details: [], scanned: docs.length };
  }
  const versions = await DigiLockerDocumentVersion.find({ _id: { $in: versionIds } })
    .select("_id documentId extractedTextRef file.originalFileName")
    .lean();
  const versionById = new Map(versions.map((version) => [String(version._id), version]));

  let text = "";
  const details = [];
  for (const doc of docs) {
    const version = versionById.get(String(doc.currentVersionId || ""));
    if (!version?.extractedTextRef) continue;
    try {
      const extracted = await readExtractedText(version.extractedTextRef);
      const extractedText = String(extracted?.text || "").trim();
      if (!extractedText) continue;
      text += `\n${extractedText}`;
      details.push({
        documentId: String(doc._id),
        fileName: version?.file?.originalFileName || doc.title || "DigiLocker Document",
        source: "digilocker",
      });
    } catch {
      // Best effort: skip documents where extracted text cannot be loaded.
    }
  }

  return { text: text.trim(), details, scanned: docs.length };
};

export const autoFillProfileFromUpload = async (req, res) => {
  try {
    const role = String(req.user?.role || "");
    if (!ALLOWED_ROLES.has(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const uploadedFiles = Array.isArray(req.files)
      ? req.files.filter((file) => file?.buffer)
      : req.file?.buffer
      ? [req.file]
      : [];
    const selectedDigiLockerDocumentIds = parseStringArray(
      req.body?.selectedDigiLockerDocumentIds || req.body?.digilockerDocumentIds
    );
    const includeAllDigiLockerDocuments = toBoolean(req.body?.includeAllDigiLockerDocuments, false);

    if (!uploadedFiles.length && !selectedDigiLockerDocumentIds.length && !includeAllDigiLockerDocuments) {
      return res.status(400).json({ error: "Upload file(s) or select DigiLocker documents" });
    }

    const uploaded = await loadUploadedFileTexts(uploadedFiles);
    const digilocker = await loadDigiLockerText({
      tenantId: req.tenantId || req.user?.tenant_id || req.user?.tenantId || null,
      userId: req.user?._id || null,
      selectedDocumentIds: selectedDigiLockerDocumentIds,
      includeAllDocuments: includeAllDigiLockerDocuments,
    });

    const combinedText = `${uploaded.text}\n${digilocker.text}`.trim();
    const trimmed = combinedText;
    if (!trimmed) {
      return res.json({
        success: true,
        data: {
          fields: { ...EMPTY_FIELDS },
          onboarding: { ...EMPTY_ONBOARDING },
          meta: {
            source: "empty",
            fileNames: uploadedFiles.map((file) => file?.originalname).filter(Boolean),
            uploadedFiles: uploadedFiles.length,
            digilockerDocumentsScanned: digilocker.scanned || 0,
            digilockerDocumentsSelected: selectedDigiLockerDocumentIds.length,
            includeAllDigiLockerDocuments,
            usedOcr: hasUsedOcr(uploaded.details),
            role,
          },
        },
      });
    }

    const merged = await extractProfileFields(trimmed, role);

    return res.json({
      success: true,
      data: {
        fields: merged,
        onboarding: normalizeOnboardingExtracted({}, merged, role),
        meta: {
          source: "mixed",
          fileNames: uploadedFiles.map((file) => file?.originalname).filter(Boolean),
          uploadedFiles: uploadedFiles.length,
          uploadedSources: uploaded.details,
          usedOcr: hasUsedOcr(uploaded.details),
          digilockerDocumentsScanned: digilocker.scanned || 0,
          digilockerDocumentsSelected: selectedDigiLockerDocumentIds.length,
          digilockerSources: digilocker.details,
          includeAllDigiLockerDocuments,
          role,
        },
      },
    });
  } catch (err) {
    console.error("autoFillProfileFromUpload error", err);
    return res.status(500).json({ error: "Failed to import profile data" });
  }
};

export const autoFillProfileForSignupFromUpload = async (req, res) => {
  try {
    const uploadedFiles = Array.isArray(req.files)
      ? req.files.filter((file) => file?.buffer)
      : req.file?.buffer
      ? [req.file]
      : [];
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: "Upload file(s) to import profile data" });
    }

    const requestedRole = String(req.body?.role || "supplier").trim().toLowerCase();
    const role = ["supplier", "buyer", "auditor"].includes(requestedRole)
      ? requestedRole
      : "supplier";

    const uploaded = await loadUploadedFileTexts(uploadedFiles);
    const trimmed = String(uploaded.text || "").trim();
    if (!trimmed) {
      return res.json({
        success: true,
        data: {
          fields: { ...EMPTY_FIELDS },
          onboarding: { ...EMPTY_ONBOARDING },
          meta: {
            source: "empty",
            fileNames: uploadedFiles.map((file) => file?.originalname).filter(Boolean),
            uploadedFiles: uploadedFiles.length,
            uploadedSources: uploaded.details,
            usedOcr: hasUsedOcr(uploaded.details),
            role,
          },
        },
      });
    }

    const merged = await extractProfileFields(trimmed, role);
    const onboardingAi = await extractOnboardingWithLLM(trimmed, role);
    const onboarding = normalizeOnboardingExtracted(onboardingAi || {}, merged, role);

    return res.json({
      success: true,
      data: {
        fields: merged,
        onboarding,
        meta: {
          source: "upload",
          fileNames: uploadedFiles.map((file) => file?.originalname).filter(Boolean),
          uploadedFiles: uploadedFiles.length,
          uploadedSources: uploaded.details,
          usedOcr: hasUsedOcr(uploaded.details),
          role,
        },
      },
    });
  } catch (err) {
    console.error("autoFillProfileForSignupFromUpload error", err);
    return res.status(500).json({ error: "Failed to import signup profile data" });
  }
};
