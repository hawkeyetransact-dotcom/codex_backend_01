import crypto from "crypto";
import KbArticle from "../models/kbArticleModel.js";
import KbChunk from "../models/kbChunkModel.js";
import { AskHawkEmbeddingService } from "./askHawkEmbeddingService.js";
import { extractTextFromBuffer } from "./questionnaireExtractionService.js";

const DEFAULT_PRODUCT_AREA = "uploaded_documents";
const DEFAULT_CHUNK_SIZE = Math.max(400, Number(process.env.ASKHAWK_INGEST_CHUNK_SIZE || 1200));
const DEFAULT_CHUNK_OVERLAP = Math.max(50, Number(process.env.ASKHAWK_INGEST_CHUNK_OVERLAP || 200));
const MAX_CHUNKS_PER_DOC = Math.max(10, Number(process.env.ASKHAWK_INGEST_MAX_CHUNKS || 200));

export const ALLOWED_ASKHAWK_INGEST_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const normalizeRole = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "ALL";
  return raw;
};

const normalizeTag = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-./ ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);

const parseTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeTag(item)).filter(Boolean))].slice(0, 20);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return parseTags(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    return parseTags(trimmed.split(","));
  }
  return [];
};

const safeSlugPart = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const splitIntoChunks = (text = "", { chunkSize, chunkOverlap, maxChunks } = {}) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const size = Math.max(300, Number(chunkSize || DEFAULT_CHUNK_SIZE));
  const overlap = Math.min(size - 50, Math.max(30, Number(chunkOverlap || DEFAULT_CHUNK_OVERLAP)));
  const max = Math.max(1, Number(maxChunks || MAX_CHUNKS_PER_DOC));
  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length && chunks.length < max) {
    const end = Math.min(normalized.length, cursor + size);
    let nextEnd = end;
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf("\n", end);
      const sentenceBoundary = normalized.lastIndexOf(". ", end);
      nextEnd = Math.max(boundary, sentenceBoundary);
      if (nextEnd <= cursor + 120) nextEnd = end;
    }
    const content = normalized.slice(cursor, nextEnd).trim();
    if (content) {
      chunks.push({
        content,
        charStart: cursor,
        charEnd: nextEnd,
      });
    }
    if (nextEnd >= normalized.length) break;
    cursor = Math.max(cursor + 1, nextEnd - overlap);
  }

  return chunks;
};

const citationForChunk = (slug, chunkOrder) => `doc:${slug}#chunk-${chunkOrder}`;

export const ingestAskHawkFileToKb = async ({
  tenantId,
  role,
  file,
  productArea,
  tags,
  title,
  chunkSize,
  chunkOverlap,
  maxChunks,
} = {}) => {
  if (!tenantId) {
    const err = new Error("tenantId required");
    err.status = 400;
    throw err;
  }
  if (!file?.buffer || !file?.originalname) {
    const err = new Error("file is required");
    err.status = 400;
    throw err;
  }
  if (!ALLOWED_ASKHAWK_INGEST_MIME_TYPES.has(file.mimetype || "")) {
    const err = new Error("Unsupported file type. Only PDF, DOCX, TXT allowed.");
    err.status = 400;
    throw err;
  }

  const extracted = await extractTextFromBuffer(file.mimetype, file.buffer);
  const extractedText = normalizeText(extracted?.text || "");
  if (!extractedText) {
    const err = new Error("No extractable text found in file");
    err.status = 422;
    throw err;
  }

  const documentHash = crypto
    .createHash("sha256")
    .update(file.buffer)
    .digest("hex")
    .slice(0, 12);
  const fileStem = safeSlugPart(file.originalname.replace(/\.[^.]+$/, "")) || "document";
  const slug = `askhawk-doc-${fileStem}-${documentHash}-${Date.now()}`;
  const normalizedRole = normalizeRole(role);
  const normalizedTags = parseTags(tags);
  const normalizedProductArea = String(productArea || DEFAULT_PRODUCT_AREA).trim() || DEFAULT_PRODUCT_AREA;
  const articleTitle = String(title || file.originalname || "Uploaded document").trim();
  const chunks = splitIntoChunks(extractedText, { chunkSize, chunkOverlap, maxChunks });
  if (!chunks.length) {
    const err = new Error("No chunks generated from extracted text");
    err.status = 422;
    throw err;
  }

  const article = await KbArticle.create({
    tenantId: String(tenantId),
    role: normalizedRole,
    productArea: normalizedProductArea,
    tags: normalizedTags,
    title: articleTitle.slice(0, 200),
    slug,
    summary: extractedText.slice(0, 280),
    source: "uploaded_document",
  });

  const docs = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const embedded = await AskHawkEmbeddingService.embedText(chunk.content || "");
    docs.push({
      tenantId: String(tenantId),
      role: normalizedRole,
      productArea: normalizedProductArea,
      tags: normalizedTags,
      articleId: article._id,
      chunkOrder: index,
      content: chunk.content,
      embedding: embedded.vector || [],
      embeddingNorm: Number(embedded.norm || 0),
      embeddingProvider: embedded.provider || "deterministic_hash",
      embeddingModel: embedded.model || "",
      tokenCount: Number(embedded.tokenCount || 0),
      metadata: {
        source: "uploaded_document",
        citation: citationForChunk(slug, index),
        fileName: file.originalname,
        mimeType: file.mimetype || "",
        charStart: Number(chunk.charStart || 0),
        charEnd: Number(chunk.charEnd || 0),
        extractedSource: extracted?.source || "unknown",
        usedOcr: Boolean(extracted?.usedOcr),
      },
    });
  }

  if (docs.length) await KbChunk.insertMany(docs);

  return {
    tenantId: String(tenantId),
    articleId: String(article._id),
    fileName: file.originalname,
    mimeType: file.mimetype || "",
    role: normalizedRole,
    productArea: normalizedProductArea,
    chunkCount: docs.length,
    source: "uploaded_document",
    usedOcr: Boolean(extracted?.usedOcr),
    citations: docs.slice(0, 20).map((item) => item.metadata.citation),
  };
};
