import multer from "multer";
import { extractTextFromBuffer } from "../services/questionnaireExtractionService.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "image/jpeg",
      "image/png",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, Word, or image files are allowed"), false);
    }
    return cb(null, true);
  },
});

export const profileImportUpload = upload.single("file");

const EMPTY_FIELDS = {
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

const normalizeValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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

const basicExtractFromText = (text = "") => {
  const result = {};
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) result.email = emailMatch[0];

  const linkedinMatch = text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i);
  if (linkedinMatch) result.linkedinUrl = linkedinMatch[0];

  const phoneMatch = text.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (phoneMatch) result.phone = phoneMatch[1];

  const companyMatch = text.match(/company\s*(name)?\s*[:\-]\s*(.+)/i);
  if (companyMatch) result.companyName = companyMatch[2].split(/\r?\n/)[0]?.trim();

  const nameMatch = text.match(/name\s*[:\-]\s*([A-Za-z .,'-]+)/i);
  if (nameMatch) result.fullName = nameMatch[1].trim();

  const addressMatch = text.match(/address\s*(line\s*1)?\s*[:\-]\s*(.+)/i);
  if (addressMatch) result.addressline1 = addressMatch[2].split(/\r?\n/)[0]?.trim();

  const cityMatch = text.match(/city\s*[:\-]\s*([A-Za-z .'-]+)/i);
  if (cityMatch) result.city = cityMatch[1].trim();

  const stateMatch = text.match(/state\s*[:\-]\s*([A-Za-z .'-]+)/i);
  if (stateMatch) result.state = stateMatch[1].trim();

  const zipMatch = text.match(/zip(code)?\s*[:\-]\s*([A-Za-z0-9 -]+)/i);
  if (zipMatch) result.zipcode = zipMatch[2].trim();

  const countryMatch = text.match(/country\s*[:\-]\s*([A-Za-z .'-]+)/i);
  if (countryMatch) result.country = countryMatch[1].trim();

  return result;
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
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1 && !cleaned.firstName) {
      cleaned.firstName = parts[0];
    } else if (parts.length > 1) {
      if (!cleaned.firstName) cleaned.firstName = parts[0];
      if (!cleaned.lastName) cleaned.lastName = parts.slice(1).join(" ");
    }
  }

  return cleaned;
};

const buildPrompt = (role) => {
  const label = role === "auditor" ? "auditor" : "supplier";
  return `Extract ${label} profile data from the document below.
Return a JSON object with these exact keys:
title, firstName, lastName, companyName, phone, countryCode, gender, addressline1, addressline2, addressline3, city, state, country, zipcode, linkedinUrl, resumeUrl.
Use empty string when unknown. Do not add extra keys.`;
};

const extractWithLLM = async (text, role) => {
  if (!text) return null;
  const prompt = `${buildPrompt(role)}\nDocument:\n${text.slice(0, 12000)}`;
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

export const autoFillProfileFromUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });
    if (!["supplier", "auditor"].includes(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { text, usedOcr, source } = await extractTextFromBuffer(req.file.mimetype, req.file.buffer);
    const trimmed = (text || "").trim();
    if (!trimmed) {
      return res.json({
        success: true,
        data: {
          fields: { ...EMPTY_FIELDS },
          meta: { source, usedOcr, fileName: req.file.originalname },
        },
      });
    }

    const aiResult = await extractWithLLM(trimmed, req.user?.role);
    const fallback = basicExtractFromText(trimmed);
    const merged = normalizeExtracted({ ...fallback, ...(aiResult || {}) });

    return res.json({
      success: true,
      data: {
        fields: merged,
        meta: { source, usedOcr, fileName: req.file.originalname },
      },
    });
  } catch (err) {
    console.error("autoFillProfileFromUpload error", err);
    return res.status(500).json({ error: "Failed to import profile data" });
  }
};
