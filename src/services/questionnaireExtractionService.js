import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import xlsx from "xlsx";
import { fromBuffer as pdfToPic } from "pdf2pic";
import { createWorker } from "tesseract.js";

const uploadsDir = path.join(process.cwd(), "uploads");
const tmpOcrDir = path.join(process.cwd(), "tmp", "questionnaire-ocr");

export const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const ensureUploadDir = () => ensureDir(uploadsDir);

const FORM_TEMPLATE_TYPES = new Set([
  "INTIMATION_LETTER",
  "RFQ",
  "SCOPE",
  "AGENDA",
  "CAPA_NOTICE",
  "FINAL_REPORT",
  "VENDOR_REGISTRATION",
]);

const isFormTemplate = (templateType = "") =>
  FORM_TEMPLATE_TYPES.has(String(templateType || "").toUpperCase());

const normalizeCategory = (rawHeading = "", question = "") => {
  const heading = rawHeading.trim();
  if (heading) return heading;
  // Only fallback to keyword-based bucket when no heading is present
  const lc = `${heading} ${question}`.toLowerCase();
  if (/\bhealth\s*&?\s*safety\b/.test(lc)) return "Health & Safety";
  if (/\bmanagement\b|\baudit\b/.test(lc)) return "Management Systems";
  if (/\bethic\b|\banti[- ]?bribery\b/.test(lc)) return "Ethics";
  if (/\benvironment\b|\bwaste\b|\bemission\b|\bpollution\b/.test(lc)) return "Environmental Protection";
  if (/\bquality\b|\bdeviation\b|\bnonconformance\b/.test(lc)) return "Quality";
  if (/\bdata\b|\bprivacy\b|\bsecurity\b/.test(lc)) return "Data Security & Privacy";
  if (/\bsupplier\b|\bvendor\b|\blogistic\b/.test(lc)) return "Supply Chain";
  if (/\bfacility\b/.test(lc)) return "Facility";
  return "Uncategorized";
};

const detectRiskCategory = (line = "") => {
  const lc = line.toLowerCase();
  if (/\bincident\b|\binjury\b|\bexplosion\b|\bfire\b|\bhazard\b|\brisk\b|\bbreach\b/.test(lc)) return "H";
  if (/\bdeviation\b|\bnonconformance\b|\bfinding\b|\bissue\b/.test(lc)) return "M";
  return "M";
};

const detectAnswerType = (line = "") => {
  const lc = line.toLowerCase();
  if (/\byes\/no\b|\byes or no\b/.test(lc)) return "radio";
  if (/\bselect all that apply\b|\bmultiple\b/.test(lc)) return "checkbox";
  if (/\battach\b|\battachment\b|\bupload\b/.test(lc)) return "attachment";
  return "text";
};

const buildResponseSchema = (questionText, answerType, options = [], section = "") => {
  return {
    type: answerType || "text",
    labelPosition: "left",
    options: (options || []).map((o) => ({ value: o, label: o })),
    placeholder: "",
    helperText: "",
    required: false,
    validation: {},
    commentPlaceholder: "",
    layout: { section },
    subQuestions: [],
  };
};

const PLACEHOLDER_REGEX = /\[([^\]]+)\]|\{([^}]+)\}|<([^>]+)>/g;

const cleanPlaceholderLabel = (raw = "") => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*,?\s*if\s+[^,]+$/i, "")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const extractPlaceholderLabels = (line = "") => {
  const labels = [];
  PLACEHOLDER_REGEX.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_REGEX.exec(line)) !== null) {
    const token = match[1] || match[2] || match[3] || "";
    const cleaned = cleanPlaceholderLabel(token);
    if (cleaned) labels.push(cleaned);
  }
  return labels;
};

const extractInlineLabel = (line = "") => {
  const before = line.split(/[\[\{<]/)[0] || "";
  if (!before) return "";
  const trimmed = before.trim();
  if (!trimmed) return "";
  if (!trimmed.endsWith(":")) return "";
  return trimmed.replace(/:\s*$/, "").trim();
};

export const extractQuestionsFromText = (text = "", { templateType } = {}) => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const questions = [];
  let currentCategory = "Uncategorized";
  let currentSubCategory = "";
  const formMode = isFormTemplate(templateType);
  const seen = new Set();

  const isHeading = (line = "", formMode = false) => {
    if (!line) return false;
    if (line.endsWith("?")) return false;
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Ignore pure numbers/letters or very short strings
    if (/^[0-9]+$/.test(trimmed)) return false;
    if (trimmed.length < 4) return false;
    // Ignore lines that look like options/answers
    if (/^\s*(yes|no)(\s*\/\s*(yes|no))?/i.test(trimmed)) return false;
    if (/^\s*please\s+/i.test(trimmed)) return false;
    if (/(yes\s*\/\s*no|yes\s*no)/i.test(trimmed)) return false;
    if (/^\s*(option|select)\b/i.test(trimmed)) return false;
    // Ignore lines that are mostly punctuation/slashes
    if ((trimmed.match(/\//g) || []).length >= 2) return false;
    const allUpper = trimmed === trimmed.toUpperCase();
    const titleCaseish = /^[A-Z][A-Za-z0-9 &/:-]{2,}$/.test(trimmed);
    const hasColon = trimmed.endsWith(":");
    // Require at least two words for headings
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 2) return false;
    if (formMode && hasColon) {
      if (allUpper && wordCount >= 2) return true;
      if (wordCount >= 4) return true;
      return false;
    }
    return allUpper || titleCaseish || hasColon;
  };

  const isFormField = (line = "") => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (isHeading(trimmed, true)) return false;
    if (trimmed.endsWith("?")) return true;
    if (/^\d+[\.\)]\s+/.test(trimmed)) return true;
    if (/^[-*]\s+/.test(trimmed)) return true;
    if (/\s*:\s*$/.test(trimmed)) return true;
    if (/_{3,}/.test(trimmed)) return true;
    if (/(yes\s*\/\s*no|yes\s+no)/i.test(trimmed)) return true;
    return false;
  };

  const normalizeFieldLabel = (line = "") =>
    line
      .replace(/^[-*\d\.\)\s]+/, "")
      .replace(/_{3,}.*/, "")
      .replace(/:\s*$/, "")
      .trim();

  const pushQuestion = (label) => {
    const cleaned = label.trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const categoryName = normalizeCategory(currentCategory, cleaned);
    const answerType = detectAnswerType(cleaned);
    const options = [];
    questions.push({
      question: cleaned,
      categoryName,
      subCategoryName: currentSubCategory,
      riskcategory: detectRiskCategory(cleaned),
      answerType,
      options,
      responseSchema: buildResponseSchema(cleaned, answerType, options, categoryName),
    });
  };

  for (const line of lines) {
    if (isHeading(line, formMode)) {
      // First heading -> category; subsequent heading without question -> subcategory
      if (currentCategory === "Uncategorized") {
        currentCategory = line.replace(/:$/, "").trim() || currentCategory;
      } else {
        currentSubCategory = line.replace(/:$/, "").trim() || currentSubCategory;
      }
      continue;
    }

    if (formMode) {
      const placeholders = extractPlaceholderLabels(line);
      if (placeholders.length) {
        const inline = extractInlineLabel(line);
        if (inline) pushQuestion(inline);
        placeholders.forEach((label) => pushQuestion(label));
        if (questions.length >= 500) break;
        continue;
      }
    }

    const looksLikeQuestion = formMode
      ? isFormField(line)
      : line.endsWith("?") || /^\d+[\.\)]\s+/.test(line) || /^[-*]\s+/.test(line);
    if (!looksLikeQuestion) continue;

    const cleaned = formMode ? normalizeFieldLabel(line) : line.replace(/^[-*\d\.\)\s]+/, "").trim();
    if (!cleaned) continue;
    pushQuestion(cleaned);
    if (questions.length >= 500) break;
  }

  return questions;
};

const extractFromDocx = async (buffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch {
    return "";
  }
};

const extractFromDoc = async (buffer) => {
  try {
    ensureDir(tmpOcrDir);
    const tmpPath = path.join(tmpOcrDir, `doc-${Date.now()}.doc`);
    fs.writeFileSync(tmpPath, buffer);
    const extractor = new WordExtractor();
    const doc = await extractor.extract(tmpPath);
    fs.unlinkSync(tmpPath);
    return doc?.getBody?.() || "";
  } catch {
    return "";
  }
};

const extractFromXlsx = (buffer) => {
  try {
    const wb = xlsx.read(buffer, { type: "buffer" });
    const parts = [];
    wb.SheetNames.forEach((name) => {
      const sheet = wb.Sheets[name];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      rows.forEach((row) => {
        if (!Array.isArray(row)) return;
        const joined = row
          .map((cell) => (cell === undefined ? "" : String(cell)))
          .join(" ")
          .trim();
        if (joined) {
          parts.push(joined);
        }
      });
    });
    return parts.join("\n");
  } catch {
    return "";
  }
};

const ocrImages = async (images = []) => {
  if (!images.length) return "";
  const worker = await createWorker("eng");
  let text = "";
  for (const img of images) {
    const target = img?.path || img;
    const { data } = await worker.recognize(target);
    text += `${data?.text || ""}\n`;
  }
  await worker.terminate();
  return text;
};

const ocrPdfBuffer = async (buffer, pageLimit = 3) => {
  try {
    ensureDir(tmpOcrDir);
    const convert = pdfToPic(buffer, {
      density: 180,
      format: "png",
      saveFilename: `ocr-${Date.now()}`,
      savePath: tmpOcrDir,
    });
    const pages = await convert(1, true);
    const pageImages = Array.isArray(pages) ? pages.slice(0, pageLimit) : [pages];
    return await ocrImages(pageImages);
  } catch {
    return "";
  }
};

const extractTextFromImage = async (buffer) => {
  try {
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data?.text || "";
  } catch {
    return "";
  }
};

export const extractTextFromBuffer = async (mimetype, buffer) => {
  let text = "";
  let usedOcr = false;
  let source = "unknown";

  if (mimetype === "application/pdf") {
    source = "pdf";
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } catch {
      text = "";
    }
    if ((text || "").trim().length < 50) {
      const ocrText = await ocrPdfBuffer(buffer);
      if (ocrText) {
        text = `${text}\n${ocrText}`.trim();
        usedOcr = true;
        source = "pdf-ocr";
      }
    }
  } else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    source = "docx";
    text = await extractFromDocx(buffer);
  } else if (mimetype === "application/msword") {
    source = "doc";
    text = await extractFromDoc(buffer);
  } else if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    source = "xlsx";
    text = extractFromXlsx(buffer);
  } else if (mimetype && mimetype.startsWith("image/")) {
    source = "image-ocr";
    text = await extractTextFromImage(buffer);
    usedOcr = true;
  } else if (mimetype && mimetype.startsWith("text/")) {
    source = "text";
    text = buffer.toString("utf-8");
  } else {
    source = "binary";
    text = buffer.toString("utf-8");
  }

  return { text, usedOcr, source };
};

export const processQuestionnaireUpload = async ({ file, defaultCategory, templateType }) => {
  const { buffer, mimetype, originalname, size } = file;
  const { text, usedOcr, source } = await extractTextFromBuffer(mimetype, buffer);

  const questions = extractQuestionsFromText(text, { templateType }).map((q) => {
    if (q.categoryName === "Uncategorized" && defaultCategory) {
      return { ...q, categoryName: defaultCategory };
    }
    return q;
  });
  const categories = Array.from(new Set(questions.map((q) => q.categoryName)));
  const subCategories = Array.from(new Set(questions.map((q) => q.subCategoryName).filter(Boolean)));

  return {
    textSource: source,
    usedOcr,
    questions,
    categories,
    subCategories,
    meta: {
      characterCount: text.length,
      fileName: originalname,
      size,
    },
  };
};

export const computeDeltaForTemplate = async (TemplateQuestionsModel, templateId, incomingQuestions) => {
  if (!templateId) {
    return { existingCount: 0, newCount: incomingQuestions.length, duplicateCount: 0 };
  }
  const existing = await TemplateQuestionsModel.find({ templateId }).select("question").lean();
  const existingSet = new Set(existing.map((q) => (q.question || "").trim().toLowerCase()));
  let duplicates = 0;
  let fresh = 0;
  incomingQuestions.forEach((q) => {
    const text = (q.question || "").trim().toLowerCase();
    if (existingSet.has(text)) {
      duplicates += 1;
    } else {
      fresh += 1;
    }
  });
  return { existingCount: existing.length, newCount: fresh, duplicateCount: duplicates };
};
