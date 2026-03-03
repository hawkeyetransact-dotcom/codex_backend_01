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

const extractWithLLM = async (text, role) => {
  if (!text) return null;
  const prompt = `${buildPrompt(role)}\nDocument:\n${text.slice(0, 18000)}`;
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

    const aiResult = await extractWithLLM(trimmed, role);
    const fallback = basicExtractFromText(trimmed);
    const merged = normalizeExtracted({ ...fallback, ...(aiResult || {}) });

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

    const aiResult = await extractWithLLM(trimmed, role);
    const fallback = basicExtractFromText(trimmed);
    const merged = normalizeExtracted({ ...fallback, ...(aiResult || {}) });
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
