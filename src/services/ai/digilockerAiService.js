import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const normalize = (text = "") => text.replace(/\s+/g, " ").trim();

const DOC_TYPE_KEYWORDS = [
  { type: "SOP", keywords: ["sop", "standard operating procedure"] },
  { type: "ValidationProtocol", keywords: ["validation protocol"] },
  { type: "ValidationReport", keywords: ["validation report"] },
  { type: "Certificate", keywords: ["certificate", "certification"] },
  { type: "Policy", keywords: ["policy", "code of conduct"] },
  { type: "Manual", keywords: ["manual"] },
  { type: "Report", keywords: ["report", "audit report"] },
  { type: "Record", keywords: ["record", "log book", "logbook"] },
  { type: "Log", keywords: ["log", "logbook"] },
  { type: "Form", keywords: ["form"] },
  { type: "Template", keywords: ["template"] },
];

const DEPARTMENT_KEYWORDS = [
  { dept: "QA", keywords: ["quality assurance", "qa"] },
  { dept: "QC", keywords: ["quality control", "qc"] },
  { dept: "Production", keywords: ["production", "manufacturing"] },
  { dept: "Engineering", keywords: ["engineering", "maintenance"] },
  { dept: "Warehouse", keywords: ["warehouse", "storage"] },
  { dept: "EHS", keywords: ["environment", "safety", "ehs"] },
  { dept: "Regulatory", keywords: ["regulatory", "compliance", "gmp"] },
];

const TAG_KEYWORDS = [
  { tag: "training", keywords: ["training", "competency"] },
  { tag: "calibration", keywords: ["calibration", "calibrate"] },
  { tag: "validation", keywords: ["validation", "qualification"] },
  { tag: "capa", keywords: ["capa"] },
  { tag: "deviation", keywords: ["deviation"] },
  { tag: "change-control", keywords: ["change control"] },
  { tag: "audit", keywords: ["audit"] },
  { tag: "quality", keywords: ["quality", "qms"] },
];

const scoreKeywords = (haystack = "", keywords = []) => {
  const lower = haystack.toLowerCase();
  let score = 0;
  keywords.forEach((kw) => {
    if (lower.includes(kw)) score += 1;
  });
  return score;
};

const pickBest = (text, candidates, defaultValue) => {
  let best = defaultValue;
  let bestScore = 0;
  candidates.forEach((item) => {
    const score = scoreKeywords(text, item.keywords);
    if (score > bestScore) {
      bestScore = score;
      best = item.type || item.dept;
    }
  });
  return { value: best, score: bestScore };
};

const extractMatch = (text, regex) => {
  const match = text.match(regex);
  return match ? match[1] || match[0] : "";
};

const extractDate = (text, label) => {
  const pattern = new RegExp(`${label}\\s*[:\\-]?\\s*([A-Za-z]{3,9}\\s+\\d{1,2},\\s+\\d{4}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})`, "i");
  const raw = extractMatch(text, pattern);
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? null : new Date(parsed);
};

export const extractTextFromBuffer = async ({ buffer, mimeType, fileName }) => {
  const name = fileName || "";
  const type = mimeType || "";

  if (type.includes("pdf") || /\.pdf$/i.test(name)) {
    const pages = [];
    const options = {
      pagerender: (pageData) =>
        pageData.getTextContent({ normalizeWhitespace: true }).then((textContent) => {
          const pageText = textContent.items.map((item) => item.str).join(" ");
          pages.push(pageText);
          return pageText;
        }),
    };
    const parsed = await pdfParse(buffer, options);
    const fullText = parsed?.text || pages.join("\n");
    return { pages, text: normalize(fullText) };
  }

  if (type.includes("word") || /\.docx?$/i.test(name)) {
    const result = await mammoth.extractRawText({ buffer });
    const text = normalize(result.value || "");
    return { pages: [text], text };
  }

  const text = normalize(buffer.toString("utf8"));
  return { pages: [text], text };
};

export const classifyAndExtract = ({ text = "" }) => {
  const normalized = text.toLowerCase();
  const docTypePick = pickBest(normalized, DOC_TYPE_KEYWORDS, "Other");
  const deptPick = pickBest(normalized, DEPARTMENT_KEYWORDS, "Other");

  const suggestedTags = TAG_KEYWORDS.map((entry) => ({
    tag: entry.tag,
    confidence: Math.min(1, scoreKeywords(normalized, entry.keywords) / 2),
  })).filter((entry) => entry.confidence > 0);

  const sopNumber =
    extractMatch(text, /\bSOP[-\s]*([A-Z0-9\-]{2,})\b/i) ||
    extractMatch(text, /SOP\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]{2,})/i);
  const docNumber = extractMatch(text, /Doc(?:ument)?\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9\-]{2,})/i);
  const revision = extractMatch(text, /Rev(?:ision)?\s*[:\-]?\s*([A-Z0-9\.]+)/i);
  const effectiveDate = extractDate(text, "Effective Date");
  const expiryDate = extractDate(text, "Expiry Date");
  const siteName = extractMatch(text, /Site Name\s*[:\-]?\s*([A-Za-z0-9\s\-]+)/i);
  const siteAddress = extractMatch(text, /Site Address\s*[:\-]?\s*([A-Za-z0-9\s,.\-]+)/i);
  const issuer = extractMatch(text, /Issued by\s*[:\-]?\s*([A-Za-z0-9\s\-]+)/i);
  const equipmentMatch = text.match(/\bEQP[-\s]?\d{2,}\b/gi) || [];
  const productMatch = text.match(/Product\s*Name\s*[:\-]?\s*([A-Za-z0-9\s\-]+)/i);
  const productNames = productMatch ? [productMatch[1].trim()] : [];

  const confidence = Math.min(1, 0.3 + docTypePick.score * 0.1 + deptPick.score * 0.1);

  return {
    docTypeGuess: docTypePick.value,
    departmentGuess: deptPick.value,
    confidence,
    suggestedTags,
    keyFields: {
      sopNumber: sopNumber || undefined,
      docNumber: docNumber || undefined,
      revision: revision || undefined,
      siteName: siteName || undefined,
      siteAddress: siteAddress || undefined,
      productNames,
      equipmentIds: equipmentMatch.map((m) => m.replace(/\s+/g, "")).slice(0, 8),
      issuer: issuer || undefined,
      signaturePresent: /signed by|signature/i.test(normalized),
      effectiveDate: effectiveDate || undefined,
      expiryDate: expiryDate || undefined,
    },
  };
};

export const suggestMappings = ({ questionText = "", candidates = [] }) => {
  const keywords = normalize(questionText)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
  if (!keywords.length) return [];

  return candidates
    .map((candidate) => {
      const pages = candidate.pages || [];
      let bestScore = 0;
      let bestPage = 1;
      pages.forEach((page, idx) => {
        const score = scoreKeywords(page.toLowerCase(), keywords);
        if (score > bestScore) {
          bestScore = score;
          bestPage = idx + 1;
        }
      });
      const fullScore = scoreKeywords(candidate.text?.toLowerCase() || "", keywords);
      const score = Math.max(bestScore, fullScore);
      return {
        ...candidate,
        confidence: Math.min(1, score / 6),
        pageNumber: bestPage,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
};
