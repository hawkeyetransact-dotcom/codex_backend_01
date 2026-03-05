import { load as loadHtml } from "cheerio";
import { extractTextFromBuffer } from "./questionnaireExtractionService.js";

const COMPANY_SUFFIX_RE =
  /\b(?:ltd|limited|inc|llc|corp|corporation|plc|gmbh|ag|sa|pvt|private|pharma|pharmaceutical|lifesciences?|life sciences?)\b/i;
const EMAIL_GLOBAL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_GLOBAL_RE = /(?:\+\d{1,4}[\s\-().]*)?(?:\d[\s\-().]*){8,15}\d/g;
const DATE_GLOBAL_RE =
  /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;
const COUNTRY_LIST = [
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

const DOC_CLASSIFIERS = [
  {
    type: "fda_483",
    patterns: [
      /form\s+fda\s*483/i,
      /inspectional observations/i,
      /\bfei\b/i,
      /establishment inspection report/i,
    ],
  },
  {
    type: "who_pir",
    patterns: [/public inspection report/i, /\bwho\b/i, /\bgmp inspection\b/i, /\bpir\b/i],
  },
  {
    type: "site_master_file",
    patterns: [/site master file/i, /\bsmf\b/i, /\bsite layout\b/i],
  },
  {
    type: "sop",
    patterns: [/standard operating procedure/i, /\bsop\b/i, /\beffective date\b/i],
  },
  {
    type: "audit_report",
    patterns: [/\baudit report\b/i, /\bobservations?\b/i, /\bcapa\b/i, /\bmajor\b|\bminor\b/i],
  },
  {
    type: "certificate",
    patterns: [/\bcertificate\b/i, /\bissued to\b/i, /\bvalid until\b/i],
  },
];

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeFieldKey = (value = "", fallback = "field_1") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.replace(/\s+/g, "_");
};

const toNonNegativeNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const toPositiveNumberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const roundConfidence = (value = 0) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const bounded = Math.max(0, Math.min(1, safe));
  return Math.round(bounded * 100) / 100;
};

const truncate = (value = "", max = 220) => {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
};

const safeJsonParse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const makeEvidence = ({ line = "", page_number = 1, file_name = "uploaded_document" }, confidence = 0.5) => ({
  snippet: truncate(line),
  page_number: Number.isFinite(Number(page_number)) ? Number(page_number) : 1,
  source_file: file_name || "uploaded_document",
  confidence: roundConfidence(confidence),
});

const makeCandidate = (value, entry, confidence = 0.5, extra = {}) => {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;
  return {
    value: cleaned,
    confidence: roundConfidence(confidence),
    evidence: makeEvidence(entry || {}, confidence),
    ...extra,
  };
};

const dedupeCandidates = (candidates = [], max = 5) => {
  const seen = new Set();
  const out = [];
  candidates.forEach((candidate) => {
    if (!candidate?.value) return;
    const key = candidate.value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  });
  return out.slice(0, max);
};

const splitTextToPages = (text = "") => {
  const source = String(text || "");
  const chunks = source
    .split(/\f+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length) {
    return chunks.map((chunk, idx) => ({ page_number: idx + 1, text: chunk }));
  }
  const cleaned = source.trim();
  return cleaned ? [{ page_number: 1, text: cleaned }] : [];
};

const buildLineIndex = (documents = []) => {
  const lines = [];
  documents.forEach((doc) => {
    doc.pages.forEach((page) => {
      const pageLines = String(page.text || "")
        .split(/\r?\n/)
        .map((raw) => raw.trim())
        .filter(Boolean);
      pageLines.forEach((line, index) => {
        lines.push({
          line,
          line_index: index,
          page_number: page.page_number || 1,
          file_name: doc.file_name || "uploaded_document",
        });
      });
    });
  });
  return lines;
};

const inferTypeCandidatesForAddressLabel = (label = "") => {
  const lower = label.toLowerCase();
  const out = [];
  if (lower.includes("manufacturing") || lower.includes("plant") || lower.includes("facility")) {
    out.push("manufacturing_site");
  }
  if (lower.includes("registered")) out.push("registered_office");
  if (lower.includes("corporate")) out.push("corporate_office");
  if (!out.length) out.push("mailing");
  return out;
};

const parseName = (value = "") => {
  const cleaned = normalizeText(value)
    .replace(/^(mr|mrs|ms|dr)\.?\s+/i, "")
    .replace(/\b(qa|qc|manager|director|head|officer|associate|lead|specialist)\b.*$/i, "")
    .trim();
  if (!cleaned) return { full_name: "", first_name: "", last_name: "" };
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { full_name: cleaned, first_name: parts[0], last_name: "" };
  }
  return {
    full_name: cleaned,
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
};

const isLikelyHumanNameToken = (value = "") => {
  const cleaned = normalizeText(value).replace(/[.]/g, "");
  if (!cleaned) return false;
  if (!/^[A-Za-z][A-Za-z '-]{1,50}$/.test(cleaned)) return false;
  if (/\b(manufacturing|quality|facility|site|department|contact|phone|email|hours|unit|plant)\b/i.test(cleaned)) {
    return false;
  }
  return true;
};

const normalizePhone = (value = "") => {
  const cleaned = normalizeText(value);
  if (!cleaned) return "";
  const leadingPlus = cleaned.startsWith("+");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (digits.length < 8) return "";
  return leadingPlus ? `+${digits}` : digits;
};

const deriveCountryCodeFromPhone = (value = "") => {
  const phone = normalizePhone(value);
  if (!phone || !phone.startsWith("+")) return "";
  const digits = phone.slice(1);
  const code = digits.slice(0, 3);
  if (!code) return "";
  if (code.startsWith("1")) return "+1";
  if (code.startsWith("91")) return "+91";
  if (code.startsWith("44")) return "+44";
  return `+${code.slice(0, Math.min(code.length, 3))}`;
};

const chooseBestCandidate = (candidates = []) => dedupeCandidates(candidates, 1)[0] || null;

const classifyText = (text = "") => {
  const source = String(text || "");
  const scored = DOC_CLASSIFIERS.map((classifier) => {
    const hits = classifier.patterns.filter((pattern) => pattern.test(source)).length;
    return {
      type: classifier.type,
      score: hits,
      rationale: hits
        ? [`Matched ${hits} classification signal(s) for ${classifier.type}`]
        : [],
    };
  }).sort((a, b) => b.score - a.score);

  const primary = scored.find((item) => item.score > 0)?.type || "unknown";
  const secondary = scored.filter((item) => item.score > 0 && item.type !== primary).map((item) => item.type);
  const rationale = scored.find((item) => item.type === primary)?.rationale || [];
  return {
    primary_type: primary,
    secondary_types: secondary,
    rationale,
  };
};
const normalizeDiscoveredField = (field = {}, index = 0) => {
  const rawKey =
    field.field_key ||
    field.key ||
    field.name ||
    field.id ||
    field.dataTestId ||
    field.label ||
    `field_${index + 1}`;
  const field_key = normalizeFieldKey(String(rawKey || ""), `field_${index + 1}`);
  const label = normalizeText(field.label || field.placeholder || field_key);
  const rawType = String(field.type || "text").toLowerCase();
  const type = rawType === "number" ? "text" : rawType;
  const options = Array.isArray(field.options)
    ? field.options
        .map((option) => {
          if (typeof option === "string") {
            return { value: normalizeText(option), label: normalizeText(option) };
          }
          const value = normalizeText(option?.value || option?.label || "");
          if (!value) return null;
          return { value, label: normalizeText(option?.label || value) };
        })
        .filter(Boolean)
    : [];
  return {
    field_key,
    label,
    required: Boolean(field.required),
    type,
    constraints: {
      minLength:
        toNonNegativeNumberOrNull(field?.constraints?.minLength) ??
        toNonNegativeNumberOrNull(field?.minLength),
      maxLength:
        toPositiveNumberOrNull(field?.constraints?.maxLength) ??
        toPositiveNumberOrNull(field?.maxLength),
      pattern: normalizeText(field?.constraints?.pattern || field?.pattern || ""),
    },
    options,
    section: normalizeText(field.section || "General"),
  };
};

const getElementLabel = ($, $element, fieldKey) => {
  const ariaLabel = normalizeText($element.attr("aria-label") || "");
  if (ariaLabel) return ariaLabel;

  const id = normalizeText($element.attr("id") || "");
  if (id) {
    const labelByFor = normalizeText($(`label[for="${id}"]`).first().text());
    if (labelByFor) return labelByFor;
  }

  const parentLabel = normalizeText($element.closest("label").text());
  if (parentLabel) return parentLabel;

  const labelledBy = normalizeText($element.attr("aria-labelledby") || "");
  if (labelledBy) {
    const joined = labelledBy
      .split(/\s+/)
      .map((labelId) => normalizeText($(`#${labelId}`).first().text()))
      .filter(Boolean)
      .join(" ");
    if (joined) return joined;
  }

  const placeholder = normalizeText($element.attr("placeholder") || "");
  if (placeholder) return placeholder;
  return fieldKey.replace(/_/g, " ");
};

const getElementSection = ($, $element) => {
  const legend = normalizeText($element.closest("fieldset").find("legend").first().text());
  if (legend) return legend;
  const nearestHeading = normalizeText(
    $element
      .closest("form")
      .find("h1, h2, h3, h4, h5, h6")
      .first()
      .text()
  );
  return nearestHeading || "General";
};

const discoverFormSchemaFromHtml = (formHtml = "") => {
  const html = String(formHtml || "");
  if (!html.trim()) return { source: "none", fields: [] };
  const $ = loadHtml(html);
  const root = $("form").first().length ? $("form").first() : $("body");
  const fields = [];
  const fieldMap = new Map();

  root.find("input, textarea, select").each((index, node) => {
    const $node = $(node);
    const tag = String(node.tagName || "").toLowerCase();
    const inputType = String($node.attr("type") || (tag === "select" ? "select" : "text")).toLowerCase();
    if (["submit", "button", "file", "reset", "image"].includes(inputType)) return;

    const fromName = normalizeText($node.attr("name") || "");
    const fromId = normalizeText($node.attr("id") || "");
    const fromTestId = normalizeText($node.attr("data-testid") || "");
    const fieldKeyBase = fromName || fromId || fromTestId || `field_${index + 1}`;
    const fieldKey = normalizeFieldKey(fieldKeyBase, `field_${index + 1}`);
    const label = getElementLabel($, $node, fieldKey);
    const requiredByLabel = /\*$/.test(label);
    const required =
      $node.attr("required") !== undefined ||
      normalizeText($node.attr("aria-required") || "").toLowerCase() === "true" ||
      requiredByLabel;
    const section = getElementSection($, $node);
    const minLength = Number.isFinite(Number($node.attr("minlength"))) ? Number($node.attr("minlength")) : null;
    const maxLength = Number.isFinite(Number($node.attr("maxlength"))) ? Number($node.attr("maxlength")) : null;
    const pattern = normalizeText($node.attr("pattern") || "");

    const type = inputType === "hidden" && $node.closest(".MuiFormControl-root").length ? "select" : inputType;
    if (type === "radio" || type === "checkbox") {
      const existingIndex = fieldMap.get(fieldKey);
      const optionValue = normalizeText($node.attr("value") || "");
      const optionLabel = label || optionValue || `option_${index + 1}`;
      const option = { value: optionValue || optionLabel, label: optionLabel };
      if (existingIndex === undefined) {
        const entry = normalizeDiscoveredField(
          {
            field_key: fieldKey,
            label,
            type,
            required,
            constraints: { minLength, maxLength, pattern },
            section,
            options: [option],
          },
          index
        );
        fieldMap.set(fieldKey, fields.length);
        fields.push(entry);
      } else {
        const current = fields[existingIndex];
        const exists = current.options.some((item) => item.value.toLowerCase() === option.value.toLowerCase());
        if (!exists) current.options.push(option);
      }
      return;
    }

    const options =
      tag === "select"
        ? $node
            .find("option")
            .toArray()
            .map((optionNode) => {
              const option = $(optionNode);
              const value = normalizeText(option.attr("value") || option.text());
              if (!value) return null;
              return { value, label: normalizeText(option.text() || value) };
            })
            .filter(Boolean)
        : [];
    const entry = normalizeDiscoveredField(
      {
        field_key: fieldKey,
        label,
        type,
        required,
        constraints: { minLength, maxLength, pattern },
        section,
        options,
      },
      index
    );
    if (!fieldMap.has(entry.field_key)) {
      fieldMap.set(entry.field_key, fields.length);
      fields.push(entry);
    }
  });

  return { source: "dom_html", fields };
};

const discoverFormSchema = ({ discoveredFormSchema, formHtml }) => {
  const provided = safeJsonParse(discoveredFormSchema) || discoveredFormSchema;
  if (provided && Array.isArray(provided.fields)) {
    return {
      source: "provided_schema",
      fields: provided.fields.map((field, index) => normalizeDiscoveredField(field, index)),
    };
  }
  if (Array.isArray(provided)) {
    return {
      source: "provided_schema",
      fields: provided.map((field, index) => normalizeDiscoveredField(field, index)),
    };
  }
  return discoverFormSchemaFromHtml(formHtml);
};

const extractDocumentCorpus = async (files = []) => {
  const documents = [];
  for (const file of files) {
    if (!file?.buffer) continue;
    const parsed = await extractTextFromBuffer(file.mimetype, file.buffer);
    const rawText = String(parsed?.text || "").trim();
    if (!rawText) continue;
    documents.push({
      file_name: file.originalname || "uploaded_document",
      mimetype: file.mimetype || "",
      source: parsed?.source || "upload",
      used_ocr: Boolean(parsed?.usedOcr),
      text: rawText,
      pages: splitTextToPages(rawText),
    });
  }
  const combined_text = documents.map((document) => document.text).join("\n\n").trim();
  return { documents, combined_text };
};
const extractCompanyAndSite = (lines = []) => {
  const companyCandidates = [];
  const siteCandidates = [];
  lines.forEach((entry, index) => {
    const line = entry.line;
    const companyLabelMatch = line.match(
      /\b(?:company name|legal entity|organization|organisation|manufacturer|auditee|supplier)\b\s*[:\-]\s*(.+)$/i
    );
    if (companyLabelMatch?.[1]) {
      const candidate = makeCandidate(companyLabelMatch[1], entry, 0.9);
      if (candidate) companyCandidates.push(candidate);
    }

    const siteLabelMatch = line.match(/\b(?:site name|facility name|plant name|manufacturing site)\b\s*[:\-]\s*(.+)$/i);
    if (siteLabelMatch?.[1]) {
      const candidate = makeCandidate(siteLabelMatch[1], entry, 0.86);
      if (candidate) siteCandidates.push(candidate);
    }

    if (index < 140 && COMPANY_SUFFIX_RE.test(line) && line.length < 120) {
      const candidate = makeCandidate(line, entry, 0.72);
      if (candidate) companyCandidates.push(candidate);
    }
  });
  return {
    company_name: chooseBestCandidate(companyCandidates),
    company_alternatives: dedupeCandidates(companyCandidates, 3),
    site_name: chooseBestCandidate(siteCandidates),
    site_alternatives: dedupeCandidates(siteCandidates, 3),
  };
};

const extractAddresses = (lines = []) => {
  const candidates = [];
  const keyValueAddressRe =
    /\b(registered office|corporate office|manufacturing site|plant address|site address|facility address|address|location)\b\s*[:\-]\s*(.+)$/i;
  lines.forEach((entry, index) => {
    const line = entry.line;
    const kv = line.match(keyValueAddressRe);
    if (kv?.[2]) {
      let combined = normalizeText(kv[2]);
      const nextLine = normalizeText(lines[index + 1]?.line || "");
      if (nextLine && !/^[A-Za-z][A-Za-z0-9/&(),.'\s]{1,40}\s*[:\-]/.test(nextLine)) {
        combined = normalizeText(`${combined}, ${nextLine}`);
      }
      const scoreBoost = /manufacturing|plant|facility/.test(kv[1].toLowerCase()) ? 0.9 : 0.8;
      const candidate = makeCandidate(combined, entry, scoreBoost, {
        type_candidates: inferTypeCandidatesForAddressLabel(kv[1]),
      });
      if (candidate) candidates.push(candidate);
      return;
    }
    if (line.length > 14 && line.length < 180 && /,\s*/.test(line) && /\b(plot|road|street|lane|district|city|state|postal|zip|india)\b/i.test(line)) {
      const candidate = makeCandidate(line, entry, 0.65, { type_candidates: ["mailing"] });
      if (candidate) candidates.push(candidate);
    }
  });
  return dedupeCandidates(candidates, 6);
};

const extractGeoFromAddress = (addressCandidate) => {
  if (!addressCandidate?.value) {
    return {
      country: null,
      state: null,
      city: null,
      postal_code: null,
    };
  }
  const address = addressCandidate.value;
  const lower = address.toLowerCase();
  const postal = address.match(/\b\d{5,6}(?:-\d{4})?\b/);
  const country = COUNTRY_LIST.find((item) => lower.includes(item));
  const parts = address
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean);

  const countryCandidate = country
    ? makeCandidate(country, { ...addressCandidate.evidence, line: addressCandidate.evidence.snippet }, 0.85)
    : null;
  const countryRegex = new RegExp(`([A-Za-z][A-Za-z .'-]{2,50})\\s*,\\s*(${COUNTRY_LIST.join("|")})\\b`, "i");
  const stateFromCountry = address.match(countryRegex)?.[1] || "";
  const districtPart = address.match(/\b([A-Za-z][A-Za-z .'-]{2,40})\s+district\b/i)?.[1] || "";
  const statePart = stateFromCountry || (parts.length > 1 ? parts[Math.max(parts.length - 2, 0)] : "");
  let cityPart = districtPart || (parts.length > 2 ? parts[Math.max(parts.length - 3, 0)] : parts[0] || "");
  if (/^(plot|unit|building|floor|block)\b/i.test(cityPart)) {
    cityPart = parts.length > 1 ? parts[Math.max(parts.length - 3, 0)] : "";
  }

  return {
    country: countryCandidate,
    state: statePart
      ? makeCandidate(statePart, { ...addressCandidate.evidence, line: addressCandidate.evidence.snippet }, 0.68)
      : null,
    city: cityPart
      ? makeCandidate(cityPart, { ...addressCandidate.evidence, line: addressCandidate.evidence.snippet }, 0.68)
      : null,
    postal_code: postal?.[0]
      ? makeCandidate(postal[0], { ...addressCandidate.evidence, line: addressCandidate.evidence.snippet }, 0.82)
      : null,
  };
};

const parseNameFromEmail = (email = "") => {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw.includes("@")) return { first_name: "", last_name: "" };
  const local = raw.split("@")[0].replace(/[0-9]+/g, "");
  const parts = local
    .split(/[._-]+/)
    .map((part) => normalizeText(part))
    .filter((part, index) => (index === 0 ? /^[a-z]{2,}$/i.test(part) : /^[a-z]{1,}$/i.test(part)));
  if (!parts.length) return { first_name: "", last_name: "" };
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  const toTitleCase = (value = "") => value.charAt(0).toUpperCase() + value.slice(1);
  return {
    first_name: first ? toTitleCase(first) : "",
    last_name: last ? toTitleCase(last) : "",
  };
};

const extractPrimaryPhone = (lines = []) => {
  const candidates = [];
  lines.forEach((entry) => {
    const line = String(entry?.line || "");
    if (!line) return;
    const phones = line.match(PHONE_GLOBAL_RE) || [];
    if (!phones.length) return;
    const lower = line.toLowerCase();
    phones.forEach((token) => {
      const phone = normalizePhone(token);
      if (!phone) return;
      let score = phone.startsWith("+") ? 0.8 : 0.68;
      if (/\b(phone|mobile|tel|contact)\b/.test(lower)) score += 0.12;
      if (/\bfax\b/.test(lower)) score -= 0.3;
      const candidate = makeCandidate(phone, entry, score);
      if (candidate) candidates.push(candidate);
    });
  });
  return chooseBestCandidate(candidates);
};

const extractContacts = (lines = []) => {
  const contacts = [];
  lines.forEach((entry, index) => {
    const line = entry.line;
    const emails = line.match(EMAIL_GLOBAL_RE) || [];
    if (!emails.length) return;
    const email = normalizeText(emails[0]).toLowerCase();
    const sameLineNameMatch = line.match(
      /\b(contact person|contact name|name|authorized signatory)\b\s*[:\-]\s*([A-Za-z][A-Za-z .,'-]{2,80})/i
    );
    const prevLine = normalizeText(lines[index - 1]?.line || "");
    const nameSource = sameLineNameMatch?.[2] || prevLine;
    const parsedName = parseName(nameSource);
    const phoneLine = `${line} ${normalizeText(lines[index + 1]?.line || "")}`;
    const phones = phoneLine.match(PHONE_GLOBAL_RE) || [];
    const phone = phones.length ? normalizePhone(phones[0]) : "";
    const titleMatch = line.match(/\b(title|designation|role)\b\s*[:\-]\s*([A-Za-z][A-Za-z\s/-]{2,60})/i);

    contacts.push({
      full_name: makeCandidate(parsedName.full_name, entry, parsedName.full_name ? 0.72 : 0.4),
      title: makeCandidate(titleMatch?.[2] || "", entry, titleMatch?.[2] ? 0.72 : 0.3),
      role: makeCandidate(titleMatch?.[2] || "", entry, titleMatch?.[2] ? 0.65 : 0.3),
      email: makeCandidate(email, entry, 0.96),
      phone: makeCandidate(phone, entry, phone ? 0.82 : 0.3),
    });
  });
  return contacts.filter((contact) => contact.email || contact.phone).slice(0, 5);
};

const extractIds = (lines = []) => {
  const extractSingle = (regex, confidence = 0.86) => {
    for (const entry of lines) {
      const match = entry.line.match(regex);
      if (match?.[1]) return makeCandidate(match[1], entry, confidence);
    }
    return null;
  };
  return {
    DUNS: extractSingle(/\bDUNS(?:\s*(?:No|Number)\.?)?\s*[:\-]?\s*([0-9\-]{7,13})\b/i, 0.92),
    FEI: extractSingle(/\bFEI(?:\s*(?:No|Number)\.?)?\s*[:\-]?\s*([0-9]{6,12})\b/i, 0.92),
    license_no: extractSingle(/\b(?:license|licence)(?:\s*(?:no|number)\.?)?\s*[:\-]?\s*([A-Za-z0-9./-]{4,40})\b/i, 0.86),
    document_no: extractSingle(/\b(?:document|doc)(?:\s*(?:no|number)\.?)?\s*[:\-]?\s*([A-Za-z0-9./-]{4,40})\b/i, 0.8),
  };
};

const extractDates = (lines = []) => {
  const issue = [];
  const effective = [];
  const inspection = [];
  lines.forEach((entry) => {
    const matches = entry.line.match(DATE_GLOBAL_RE) || [];
    if (!matches.length) return;
    const lineLower = entry.line.toLowerCase();
    matches.forEach((match) => {
      if (/\b(effective|valid from|effective date)\b/.test(lineLower)) {
        const candidate = makeCandidate(match, entry, 0.88);
        if (candidate) effective.push(candidate);
      } else if (/\b(inspection|audit date|visited|visit date)\b/.test(lineLower)) {
        const candidate = makeCandidate(match, entry, 0.84);
        if (candidate) inspection.push(candidate);
      } else if (/\b(issue|issued|revision date|date)\b/.test(lineLower)) {
        const candidate = makeCandidate(match, entry, 0.8);
        if (candidate) issue.push(candidate);
      }
    });
  });
  return {
    issue: dedupeCandidates(issue, 6),
    effective: dedupeCandidates(effective, 6),
    inspection: dedupeCandidates(inspection, 6),
  };
};
const inferIntent = (field = {}) => {
  const joined = `${field.field_key || ""} ${field.label || ""}`.toLowerCase();
  if (/password/.test(joined)) return "password";
  if (/confirm/.test(joined) && /password/.test(joined)) return "password";
  if (/company|organisation|organization|legal entity|supplier name|manufacturer/.test(joined)) return "company_name";
  if (/(site|facility|plant).*(name)|name.*(site|facility|plant)/.test(joined)) return "site_name";
  if (/address.*line.*1|address1|addr1|street|address/.test(joined)) return "address_line_1";
  if (/address.*line.*2|address2|addr2/.test(joined)) return "address_line_2";
  if (/address.*line.*3|address3|addr3/.test(joined)) return "address_line_3";
  if (/country code|dial code|isd/.test(joined)) return "country_code";
  if (/country/.test(joined)) return "country";
  if (/state|province|region/.test(joined)) return "state";
  if (/city|town/.test(joined)) return "city";
  if (/zip|zipcode|postal|pin/.test(joined)) return "postal_code";
  if (/first name|given name|forename/.test(joined)) return "first_name";
  if (/last name|surname|family name/.test(joined)) return "last_name";
  if (/full name|contact person|contact name|authorized signatory|name/.test(joined)) return "full_name";
  if (/title|designation|role/.test(joined)) return "title";
  if (/email/.test(joined)) return "email";
  if (/phone|mobile|telephone|contact number/.test(joined)) return "phone";
  if (/register as|role|user type/.test(joined)) return "register_as";
  if (/gender|sex/.test(joined)) return "gender";
  return "unknown";
};

const pickOption = (value, options = []) => {
  const candidate = normalizeText(value);
  if (!candidate || !options.length) return "";
  const lower = candidate.toLowerCase();
  const exact = options.find(
    (option) => option.value.toLowerCase() === lower || option.label.toLowerCase() === lower
  );
  if (exact) return exact.value;
  const partial = options.find(
    (option) => lower.includes(option.value.toLowerCase()) || option.value.toLowerCase().includes(lower)
  );
  return partial ? partial.value : "";
};

const splitAddressLines = (addressValue = "") => {
  const parts = normalizeText(addressValue)
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean);
  return {
    line1: parts[0] || "",
    line2: parts[1] || "",
    line3: parts.slice(2).join(", "),
  };
};

const choosePrimaryAddress = (addresses = []) => {
  const manufacturing = addresses.find((entry) => (entry.type_candidates || []).includes("manufacturing_site"));
  if (manufacturing) return manufacturing;
  if (!addresses.length) return null;
  const stitched = addresses
    .slice(0, 5)
    .map((entry) => normalizeText(entry?.value || ""))
    .filter(Boolean);
  if (stitched.length >= 2) {
    const composite = normalizeText(stitched.join(", ").replace(/,\s*,/g, ", "));
    if (composite.length >= 18) {
      return {
        ...addresses[0],
        value: composite,
        confidence: roundConfidence((addresses[0]?.confidence || 0.65) + 0.08),
      };
    }
  }
  const withCountry = addresses.find((entry) =>
    COUNTRY_LIST.some((country) => String(entry?.value || "").toLowerCase().includes(country))
  );
  if (withCountry) return withCountry;
  return addresses[0] || null;
};

const mapField = ({ field, entities, role }) => {
  const primaryAddress = choosePrimaryAddress(entities.addresses || []);
  const addressLines = splitAddressLines(primaryAddress?.value || "");
  const primaryContact = entities.contacts?.[0] || {};
  const intent = inferIntent(field);
  let selected = null;
  let alternatives = [];

  switch (intent) {
    case "company_name":
      selected = entities.org?.company_name || null;
      alternatives = entities.org?.company_alternatives || [];
      break;
    case "site_name":
      selected = entities.org?.site_name || null;
      alternatives = entities.org?.site_alternatives || [];
      break;
    case "address_line_1":
      selected = makeCandidate(addressLines.line1, primaryAddress?.evidence, 0.76);
      alternatives = entities.addresses || [];
      break;
    case "address_line_2":
      selected = makeCandidate(addressLines.line2, primaryAddress?.evidence, 0.66);
      alternatives = entities.addresses || [];
      break;
    case "address_line_3":
      selected = makeCandidate(addressLines.line3, primaryAddress?.evidence, 0.6);
      alternatives = entities.addresses || [];
      break;
    case "country":
      selected = entities.geo?.country || null;
      break;
    case "state":
      selected = entities.geo?.state || null;
      break;
    case "city":
      selected = entities.geo?.city || null;
      break;
    case "postal_code":
      selected = entities.geo?.postal_code || null;
      break;
    case "full_name":
      selected = primaryContact.full_name || null;
      break;
    case "first_name": {
      const parsed = parseName(primaryContact.full_name?.value || "");
      const fallback = parseNameFromEmail(primaryContact.email?.value || "");
      selected = makeCandidate(
        isLikelyHumanNameToken(parsed.first_name) ? parsed.first_name : fallback.first_name,
        primaryContact.full_name?.evidence || primaryContact.email?.evidence,
        isLikelyHumanNameToken(parsed.first_name) ? 0.72 : 0.64
      );
      break;
    }
    case "last_name": {
      const parsed = parseName(primaryContact.full_name?.value || "");
      const fallback = parseNameFromEmail(primaryContact.email?.value || "");
      selected = makeCandidate(
        isLikelyHumanNameToken(parsed.last_name) ? parsed.last_name : fallback.last_name,
        primaryContact.full_name?.evidence || primaryContact.email?.evidence,
        isLikelyHumanNameToken(parsed.last_name) ? 0.72 : 0.64
      );
      break;
    }
    case "title":
      selected = primaryContact.title || primaryContact.role || null;
      break;
    case "email":
      selected = primaryContact.email || null;
      break;
    case "phone":
      selected = primaryContact.phone || entities.primary_phone || null;
      break;
    case "country_code":
      selected = makeCandidate(
        deriveCountryCodeFromPhone(primaryContact.phone?.value || entities.primary_phone?.value || ""),
        primaryContact.phone?.evidence || entities.primary_phone?.evidence,
        0.7
      );
      break;
    case "register_as":
      selected = makeCandidate(role || "supplier", { line: "Role selected by user", page_number: 1, file_name: "request" }, 0.92);
      break;
    case "gender":
      selected = null;
      break;
    case "password":
      selected = null;
      break;
    default:
      selected = null;
      break;
  }

  if (selected && (field.type === "select" || field.type === "radio")) {
    const picked = pickOption(selected.value, field.options || []);
    if (picked) {
      selected = { ...selected, value: picked };
    } else if ((field.options || []).length > 0) {
      selected = null;
    }
  }

  if (selected && selected.value && field.constraints?.pattern) {
    try {
      const regex = new RegExp(field.constraints.pattern);
      if (!regex.test(selected.value)) selected = null;
    } catch {
      // Ignore invalid regex patterns from UI constraints.
    }
  }
  if (selected && selected.value && Number.isFinite(Number(field.constraints?.maxLength))) {
    const max = Number(field.constraints.maxLength);
    if (max > 0 && selected.value.length > max) {
      selected = null;
    }
  }

  const value = selected?.value || null;
  return {
    field_key: field.field_key,
    intent,
    value,
    evidence_snippet: selected?.evidence?.snippet || null,
    page_number: selected?.evidence?.page_number ?? null,
    confidence: value ? roundConfidence(selected?.confidence || 0.5) : 0,
    alternatives: dedupeCandidates(alternatives, 2).map((item) => ({
      value: item.value,
      evidence_snippet: item.evidence?.snippet || null,
      page_number: item.evidence?.page_number ?? null,
      confidence: roundConfidence(item.confidence || 0.5),
    })),
  };
};

const buildMapping = ({ formSchema, entities, role }) => {
  const mapping_result = {};
  const autofill_payload = {};
  const missing_fields = [];
  const fill_report = [];
  const followup_questions = [];

  formSchema.fields.forEach((field) => {
    const mapped = mapField({ field, entities, role });
    mapping_result[field.field_key] = mapped;
    autofill_payload[field.field_key] = mapped.value;
    if (!mapped.value && field.required) {
      missing_fields.push(field.field_key);
      followup_questions.push(`Please provide ${field.label || field.field_key}.`);
    }
    fill_report.push({
      field_key: field.field_key,
      status: mapped.value ? "filled" : "skipped",
      reason: mapped.value ? "Mapped with evidence" : "No evidence-supported value found",
      confidence: mapped.confidence,
    });
  });

  if (!formSchema.fields.length) {
    followup_questions.push("Provide form HTML or discovered form schema so autofill can map values reliably.");
  }

  return { mapping_result, autofill_payload, missing_fields, followup_questions, fill_report };
};

const buildExtractedEntities = ({ lines, combinedText }) => {
  const org = extractCompanyAndSite(lines);
  const addresses = extractAddresses(lines);
  const primaryAddress = choosePrimaryAddress(addresses);
  const geo = extractGeoFromAddress(primaryAddress);
  const contacts = extractContacts(lines);
  const primaryPhone = extractPrimaryPhone(lines);
  const ids = extractIds(lines);
  const dates = extractDates(lines);

  return {
    org: {
      company_name: org.company_name,
      site_name: org.site_name,
      company_alternatives: org.company_alternatives,
      site_alternatives: org.site_alternatives,
    },
    addresses,
    geo,
    contacts,
    primary_phone: primaryPhone,
    ids,
    dates,
    source_text_length: combinedText.length,
  };
};

const buildDocClassification = ({ documents, combinedText }) => {
  const overall = classifyText(combinedText);
  const per_document = documents.map((doc) => ({
    file_name: doc.file_name,
    ...classifyText(doc.text),
  }));
  return { ...overall, per_document };
};

const buildEmptyResponse = () => ({
  discovered_form_schema: { source: "none", fields: [] },
  doc_classification: {
    primary_type: "unknown",
    secondary_types: [],
    rationale: [],
    per_document: [],
  },
  extracted_entities: {
    org: { company_name: null, site_name: null, company_alternatives: [], site_alternatives: [] },
    addresses: [],
    geo: { country: null, state: null, city: null, postal_code: null },
    contacts: [],
    ids: { DUNS: null, FEI: null, license_no: null, document_no: null },
    dates: { issue: [], effective: [], inspection: [] },
    source_text_length: 0,
  },
  mapping_result: {},
  autofill_payload: {},
  missing_fields: [],
  followup_questions: [],
  filled_in_browser: false,
  fill_report: [],
});

export const runAgenticFormAutofill = async ({
  files = [],
  discoveredFormSchema = null,
  formHtml = "",
  role = "supplier",
} = {}) => {
  const response = buildEmptyResponse();
  const formSchema = discoverFormSchema({ discoveredFormSchema, formHtml });
  response.discovered_form_schema = formSchema;

  const corpus = await extractDocumentCorpus(files);
  if (!corpus.documents.length) {
    response.followup_questions = ["Upload at least one document to extract profile information."];
    const mapping = buildMapping({
      formSchema,
      entities: response.extracted_entities,
      role,
    });
    response.mapping_result = mapping.mapping_result;
    response.autofill_payload = mapping.autofill_payload;
    response.missing_fields = mapping.missing_fields;
    response.fill_report = mapping.fill_report;
    response.followup_questions = [...response.followup_questions, ...mapping.followup_questions];
    return response;
  }

  const lines = buildLineIndex(corpus.documents);
  const extractedEntities = buildExtractedEntities({ lines, combinedText: corpus.combined_text });
  response.extracted_entities = extractedEntities;
  response.doc_classification = buildDocClassification({
    documents: corpus.documents,
    combinedText: corpus.combined_text,
  });

  const mapping = buildMapping({
    formSchema,
    entities: extractedEntities,
    role,
  });
  response.mapping_result = mapping.mapping_result;
  response.autofill_payload = mapping.autofill_payload;
  response.missing_fields = mapping.missing_fields;
  response.followup_questions = mapping.followup_questions;
  response.fill_report = mapping.fill_report;
  return response;
};

