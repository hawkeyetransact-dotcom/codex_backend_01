import crypto from "crypto";
import path from "path";
import fs from "fs";
import { uploadFileToBucket } from "../../utils/s3Upload.js";

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const normalizePath = (value) => value.replace(/\\/g, "/");

const resolveUploadDir = () => process.env.DIGILOCKER_UPLOAD_DIR || "uploads/digilocker";

const resolveExtractDir = () => process.env.DIGILOCKER_EXTRACT_DIR || path.join(resolveUploadDir(), "extracted");

const useLocalStorage = () => {
  if (process.env.UPLOADS_MODE === "local") return true;
  if (!process.env.AWS_S3_BUCKET || !process.env.AWS_REGION) return true;
  return false;
};

export const computeSha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

export const storeDocumentFile = async ({ file }) => {
  if (!file?.buffer) throw new Error("File buffer missing");
  const checksumSha256 = computeSha256(file.buffer);
  const originalName = file.originalname || file.name || "document";
  const mimeType = file.mimetype || file.type || "application/octet-stream";

  if (useLocalStorage()) {
    const uploadDir = path.join(process.cwd(), resolveUploadDir());
    ensureDir(uploadDir);
    const fileName = `${crypto.randomUUID()}${path.extname(originalName)}`;
    const relativeKey = normalizePath(path.join(resolveUploadDir(), fileName));
    const filePath = path.join(process.cwd(), relativeKey);
    await fs.promises.writeFile(filePath, file.buffer);
    const baseUrl = process.env.UPLOADS_BASE_URL || `http://localhost:${process.env.PORT || 8101}`;
    return {
      storageProvider: "local",
      bucket: "",
      key: relativeKey,
      url: `${baseUrl}/${relativeKey}`,
      originalFileName: originalName,
      mimeType,
      sizeBytes: file.size || file.buffer.length,
      checksumSha256,
    };
  }

  const fileUrl = await uploadFileToBucket(file.buffer, originalName, mimeType);
  let key = "";
  try {
    key = new URL(fileUrl).pathname.replace(/^\//, "");
  } catch {
    key = "";
  }
  return {
    storageProvider: "s3",
    bucket: process.env.AWS_S3_BUCKET || "",
    key,
    url: fileUrl,
    originalFileName: originalName,
    mimeType,
    sizeBytes: file.size || file.buffer.length,
    checksumSha256,
  };
};

export const saveExtractedText = async ({ versionId, pages = [], text = "" }) => {
  const extractDir = path.join(process.cwd(), resolveExtractDir());
  ensureDir(extractDir);
  const fileName = `${versionId}.json`;
  const relativeRef = normalizePath(path.join(resolveExtractDir(), fileName));
  const filePath = path.join(process.cwd(), relativeRef);
  await fs.promises.writeFile(filePath, JSON.stringify({ pages, text }, null, 2), "utf8");
  return relativeRef;
};

export const readExtractedText = async (ref) => {
  if (!ref) return { pages: [], text: "" };
  const filePath = path.isAbsolute(ref) ? ref : path.join(process.cwd(), ref);
  const raw = await fs.promises.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    text: parsed.text || "",
  };
};
