import crypto from "crypto";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import {
  ComplianceGuidelineDocument,
} from "../../models/complianceGuidelineDocumentModel.js";
import { ComplianceGuidelineVector } from "../../models/complianceGuidelineVectorModel.js";
import { StandardRegistryService } from "./standardRegistryService.js";

const VECTOR_DIMENSIONS = Math.min(
  1024,
  Math.max(64, Number(process.env.COMPLIANCE_GUIDELINE_VECTOR_DIMENSIONS || 256))
);
const MAX_QUERY_HITS = 8;
const MIN_RETRIEVAL_SCORE = Number(process.env.COMPLIANCE_GUIDELINE_MIN_SCORE || 0.12);
const DEFAULT_CHUNK_SIZE = Math.max(300, Number(process.env.COMPLIANCE_GUIDELINE_CHUNK_SIZE || 1600));
const DEFAULT_CHUNK_OVERLAP = Math.max(40, Number(process.env.COMPLIANCE_GUIDELINE_CHUNK_OVERLAP || 220));
const MAX_CHUNKS_PER_DOCUMENT = Math.max(
  10,
  Number(process.env.COMPLIANCE_GUIDELINE_MAX_CHUNKS || 1200)
);

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "from",
  "have",
  "has",
  "are",
  "was",
  "were",
  "your",
  "you",
  "into",
  "under",
  "shall",
  "should",
  "must",
  "may",
  "can",
  "not",
  "all",
  "any",
  "their",
  "there",
  "where",
  "which",
  "what",
  "when",
  "how",
  "who",
  "why",
  "about",
  "also",
  "gmp",
  "audit",
  "questionnaire",
  "question",
  "response",
]);

const trim = (value) => String(value || "").trim();

const normalize = (value) =>
  trim(value)
    .replace(/\s+/g, " ")
    .trim();

const normalizeStandardKey = (value) => StandardRegistryService.normalizeStandardKey(value);
const normalizeStandardVersion = (value) => StandardRegistryService.normalizeVersion(value);

const safeObject = (value) => (value && typeof value === "object" ? value : {});

const splitStringList = (value) => {
  if (Array.isArray(value)) return value;
  const raw = trim(value);
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // No-op fallback to delimited parsing.
    }
  }
  return raw.split(/[|,;\n]/g);
};

const normalizeStringList = (value, max = 64) => {
  const out = [];
  splitStringList(value).forEach((item) => {
    const next = normalize(item);
    if (!next) return;
    if (out.some((existing) => existing.toLowerCase() === next.toLowerCase())) return;
    if (out.length >= max) return;
    out.push(next);
  });
  return out;
};

const normalizeDocText = (value = "") =>
  String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const tokenize = (value = "") =>
  normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s./_-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const hashToken = (value = "") => {
  let hash = 2166136261;
  const source = String(value || "");
  for (let idx = 0; idx < source.length; idx += 1) {
    hash ^= source.charCodeAt(idx);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
};

const buildEmbedding = (value = "") => {
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);
  const tokens = tokenize(value);
  if (!tokens.length) return { embedding: vector, norm: 0, tokenCount: 0 };

  tokens.forEach((token) => {
    const h1 = hashToken(token);
    const h2 = hashToken(`${token}_alt`);
    const index = h1 % VECTOR_DIMENSIONS;
    const sign = h2 % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  });

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (!norm) return { embedding: vector, norm: 0, tokenCount: tokens.length };

  const embedding = vector.map((item) => Number((item / norm).toFixed(8)));
  return { embedding, norm: 1, tokenCount: tokens.length };
};

const cosineForUnitVectors = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let idx = 0; idx < len; idx += 1) {
    dot += Number(a[idx] || 0) * Number(b[idx] || 0);
  }
  return dot;
};

const sha256 = (value = "") =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const guessMimeType = (file = {}) => {
  const raw = String(file.mimetype || "").toLowerCase();
  if (raw) return raw;
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
};

const extractTextFromUpload = async (file = {}) => {
  const buffer = file?.buffer;
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return "";
  const mimeType = guessMimeType(file);
  const ext = path.extname(String(file.originalname || "")).toLowerCase();

  if (mimeType.includes("pdf") || ext === ".pdf") {
    try {
      const parsed = await pdfParse(buffer);
      return normalizeDocText(parsed?.text || "");
    } catch {
      return "";
    }
  }

  if (
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("msword") ||
    ext === ".docx" ||
    ext === ".doc"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return normalizeDocText(result?.value || "");
    } catch {
      return normalizeDocText(buffer.toString("utf8"));
    }
  }

  if (mimeType.startsWith("text/") || ext === ".txt") {
    return normalizeDocText(buffer.toString("utf8"));
  }

  return normalizeDocText(buffer.toString("utf8"));
};

const chunkText = (value = "", { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) => {
  const text = normalizeDocText(value);
  if (!text) return [];
  const out = [];
  let start = 0;
  let guard = 0;
  while (start < text.length && guard < MAX_CHUNKS_PER_DOCUMENT) {
    let end = Math.min(text.length, start + chunkSize);
    if (end < text.length) {
      const boundary = Math.max(
        text.lastIndexOf("\n\n", end),
        text.lastIndexOf("\n", end),
        text.lastIndexOf(". ", end)
      );
      if (boundary > start + Math.floor(chunkSize * 0.55)) {
        end = boundary + 1;
      }
    }

    const chunk = normalizeDocText(text.slice(start, end));
    if (chunk) out.push(chunk);
    if (end >= text.length) break;

    const nextStart = Math.max(end - overlap, start + 1);
    start = nextStart;
    guard += 1;
  }
  return out;
};

const inferStandardRefs = (text = "") => {
  const refs = [];
  const cfrMatches = text.match(/\b21\s*CFR\s*\d+(?:\.\d+)?\b/gi) || [];
  cfrMatches.forEach((match) => {
    const ref = normalize(match).toUpperCase().replace(/\s+/g, " ");
    if (!ref) return;
    if (!refs.includes(ref)) refs.push(ref);
  });
  return refs.slice(0, 6);
};

const inferClauseRef = (text = "") => {
  const direct = text.match(/\bICH\s*Q7(?:A)?\s*(?:section|clause)?\s*\d+(?:\.\d+){0,4}\b/i);
  if (direct?.[0]) return normalize(direct[0]).replace(/\s+/g, " ");

  const generic = text.match(/\b(?:section|clause)\s*\d+(?:\.\d+){0,4}\b/i);
  if (generic?.[0]) return normalize(generic[0]).replace(/\s+/g, " ");

  return "";
};

const deriveChunkMetadata = (sourceMetadata = {}, chunkTextValue = "") => {
  const metadata = safeObject(sourceMetadata);
  const standardRefs = normalizeStringList([
    ...(Array.isArray(metadata.standardRefs) ? metadata.standardRefs : []),
    ...inferStandardRefs(chunkTextValue),
  ]);

  return {
    ...metadata,
    clauseRef: normalize(metadata.clauseRef || inferClauseRef(chunkTextValue)),
    standardRefs,
    contextTags: normalizeStringList(metadata.contextTags || [], 24),
    instructionContext: normalize(metadata.instructionContext || ""),
    sourceType: normalize(metadata.sourceType || "UPLOADED_GUIDELINE") || "UPLOADED_GUIDELINE",
    documentLabel: normalize(metadata.documentLabel || ""),
  };
};

const serializeMatch = (entry = {}, score = 0) => {
  const metadata = safeObject(entry.metadata);
  return {
    chunkId: String(entry._id || ""),
    documentId: String(entry.documentId || ""),
    documentName: normalize(metadata.documentLabel || ""),
    score: Number(score.toFixed(4)),
    snippet: normalize(entry.chunkText || "").slice(0, 420),
    clauseRef: normalize(metadata.clauseRef || ""),
    standardRefs: normalizeStringList(metadata.standardRefs || []),
    controlId: normalize(metadata.controlId || ""),
    title: normalize(metadata.title || ""),
    expectedAnswer: normalize(metadata.expectedAnswer || "").toUpperCase() || "ANY",
    requiredEvidence: Boolean(metadata.requiredEvidence),
    sourceType: normalize(metadata.sourceType || "UPLOADED_GUIDELINE") || "UPLOADED_GUIDELINE",
  };
};

const buildControlSeedChunks = (standard = {}) => {
  const controls = Array.isArray(standard.controls) ? standard.controls : [];
  return controls
    .filter((control) => control && control.active !== false)
    .map((control, idx) => {
      const text = [
        `Standard: ${standard.name || standard.standardKey}`,
        `Control ID: ${control.controlId || `CONTROL_${idx + 1}`}`,
        `Control Title: ${control.title || ""}`,
        `Clause: ${control.clauseRef || ""}`,
        `Description: ${control.description || ""}`,
        `Expected Answer: ${control.expectedAnswer || "ANY"}`,
        `Required Evidence: ${control.requiredEvidence ? "YES" : "NO"}`,
        `Keywords: ${(Array.isArray(control.keywords) ? control.keywords : []).join(", ")}`,
        `Standard References: ${(Array.isArray(control.standardRefs) ? control.standardRefs : []).join(", ")}`,
      ]
        .map((line) => normalize(line))
        .filter(Boolean)
        .join("\n");

      return {
        text,
        metadata: {
          sourceType: "STANDARD_CONTROL_SEED",
          documentLabel: `${standard.standardKey} ${standard.version} control seed`,
          controlId: normalize(control.controlId || `CONTROL_${idx + 1}`),
          title: normalize(control.title || ""),
          clauseRef: normalize(control.clauseRef || ""),
          standardRefs: normalizeStringList(control.standardRefs || []),
          contextTags: normalizeStringList(control.keywords || [], 24),
          expectedAnswer: normalize(control.expectedAnswer || "ANY").toUpperCase() || "ANY",
          requiredEvidence: Boolean(control.requiredEvidence),
        },
      };
    })
    .filter((entry) => entry.text);
};

const archiveActiveGuidelineData = async ({ tenantId, standardKey, standardVersion, actorUserId }) => {
  const now = new Date();
  const filter = {
    tenantId,
    standardKey,
    standardVersion,
    status: "ACTIVE",
  };

  await Promise.all([
    ComplianceGuidelineDocument.updateMany(filter, {
      $set: {
        status: "ARCHIVED",
        updatedBy: actorUserId || undefined,
        updatedAt: now,
      },
    }),
    ComplianceGuidelineVector.updateMany(filter, {
      $set: {
        status: "ARCHIVED",
        updatedBy: actorUserId || undefined,
        updatedAt: now,
      },
    }),
  ]);
};

const ensureStandard = async ({ tenantId, standardKey, standardVersion, actorUserId }) => {
  await StandardRegistryService.ensureDefaults({ tenantId, actorUserId });
  const normalizedKey = normalizeStandardKey(standardKey);
  const normalizedVersion = normalizeStandardVersion(standardVersion);
  const standard = await StandardRegistryService.getStandard({
    tenantId,
    standardKey: normalizedKey,
    version: normalizedVersion,
    actorUserId,
  });
  if (!standard) {
    const err = new Error("Compliance standard/version not found");
    err.status = 404;
    throw err;
  }
  return standard;
};

const indexDocumentChunks = async ({
  tenantId,
  standard,
  document,
  chunks,
  actorUserId,
}) => {
  await ComplianceGuidelineVector.deleteMany({
    tenantId,
    documentId: document._id,
  });

  const vectorDocs = [];
  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunk = chunks[idx];
    const text = normalizeDocText(chunk?.text || "");
    if (!text) continue;
    const metadata = deriveChunkMetadata(chunk?.metadata || {}, text);
    const { embedding, norm, tokenCount } = buildEmbedding(text);

    vectorDocs.push({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      documentId: document._id,
      status: "ACTIVE",
      chunkOrder: idx,
      chunkText: text,
      tokenCount,
      embedding,
      embeddingNorm: norm,
      metadata,
      createdBy: actorUserId || undefined,
      updatedBy: actorUserId || undefined,
    });
  }

  if (vectorDocs.length) {
    await ComplianceGuidelineVector.insertMany(vectorDocs, { ordered: false });
  }

  document.status = "ACTIVE";
  document.vectorCount = vectorDocs.length;
  document.extractedTextLength = chunks.reduce((sum, chunk) => sum + String(chunk?.text || "").length, 0);
  document.errorMessage = "";
  document.updatedBy = actorUserId || document.updatedBy;
  await document.save();
  return vectorDocs.length;
};

const upsertGuidelineDocument = async ({
  tenantId,
  standard,
  fileName,
  mimeType,
  fileSize,
  contentHash,
  instructionContext,
  contextTags,
  sourceType,
  actorUserId,
  metadata = {},
}) => {
  const existingActive = await ComplianceGuidelineDocument.findOne({
    tenantId,
    standardKey: standard.standardKey,
    standardVersion: standard.version,
    contentHash,
    status: "ACTIVE",
  });

  if (existingActive && Number(existingActive.vectorCount || 0) > 0) {
    return { document: existingActive, reused: true };
  }

  const existingAny = await ComplianceGuidelineDocument.findOne({
    tenantId,
    standardKey: standard.standardKey,
    standardVersion: standard.version,
    contentHash,
  });

  const next = existingAny || new ComplianceGuidelineDocument();
  next.tenantId = tenantId;
  next.standardKey = standard.standardKey;
  next.standardVersion = standard.version;
  next.status = "PROCESSING";
  next.sourceType = sourceType;
  next.fileName = fileName;
  next.mimeType = mimeType;
  next.fileSize = Number(fileSize || 0);
  next.contentHash = contentHash;
  next.instructionContext = normalize(instructionContext || "");
  next.contextTags = normalizeStringList(contextTags || [], 24);
  next.metadata = safeObject(metadata);
  next.errorMessage = "";
  next.updatedBy = actorUserId || undefined;
  if (!next.createdBy) next.createdBy = actorUserId || undefined;
  await next.save();

  return { document: next, reused: false };
};

const buildUploadChunks = ({
  text,
  sourceType,
  fileName,
  instructionContext,
  contextTags,
}) =>
  chunkText(text).map((chunk, idx) => ({
    text: chunk,
    metadata: {
      sourceType,
      documentLabel: fileName,
      instructionContext: normalize(instructionContext || ""),
      contextTags: normalizeStringList(contextTags || [], 24),
      chunkHint: `chunk-${idx + 1}`,
    },
  }));

const toGuidelineControlCandidates = (hits = []) =>
  (Array.isArray(hits) ? hits : []).map((hit, idx) => {
    const controlId = normalize(hit.controlId || "") || `GUIDELINE_${String(hit.chunkId || idx + 1).slice(-10)}`;
    const title = normalize(hit.title || "") || normalize(hit.snippet || "").slice(0, 120) || controlId;
    const clauseRef = normalize(hit.clauseRef || "");
    const standardRefs = normalizeStringList(hit.standardRefs || []);
    const score = Math.max(1, Number((Number(hit.score || 0) * 10).toFixed(2)));
    return {
      controlId,
      title,
      clauseRef,
      standardRefs,
      score,
      expectedAnswer: normalize(hit.expectedAnswer || "ANY").toUpperCase() || "ANY",
      requiredEvidence: Boolean(hit.requiredEvidence),
    };
  });

const mergeMappedControls = ({ mappedControls = [], guidelineHits = [], limit = 3 } = {}) => {
  const merged = new Map();
  const append = (item = {}) => {
    const controlId = normalize(item.controlId || "");
    const title = normalize(item.title || "");
    if (!controlId && !title) return;
    const key = controlId || `${title.toLowerCase()}::${normalize(item.clauseRef || "").toLowerCase()}`;
    const previous = merged.get(key);
    if (!previous || Number(item.score || 0) > Number(previous.score || 0)) {
      merged.set(key, {
        controlId: controlId || previous?.controlId || `CONTROL_${merged.size + 1}`,
        title: title || previous?.title || controlId,
        clauseRef: normalize(item.clauseRef || previous?.clauseRef || ""),
        standardRefs: normalizeStringList([
          ...(Array.isArray(item.standardRefs) ? item.standardRefs : []),
          ...(Array.isArray(previous?.standardRefs) ? previous.standardRefs : []),
        ]),
        score: Number(item.score || 0),
        expectedAnswer: normalize(item.expectedAnswer || previous?.expectedAnswer || "ANY").toUpperCase() || "ANY",
        requiredEvidence: Boolean(item.requiredEvidence || previous?.requiredEvidence),
      });
    } else if (previous) {
      previous.standardRefs = normalizeStringList([
        ...(Array.isArray(previous.standardRefs) ? previous.standardRefs : []),
        ...(Array.isArray(item.standardRefs) ? item.standardRefs : []),
      ]);
      merged.set(key, previous);
    }
  };

  (Array.isArray(mappedControls) ? mappedControls : []).forEach(append);
  toGuidelineControlCandidates(guidelineHits).forEach(append);

  return Array.from(merged.values())
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, Math.max(1, Number(limit || 3)));
};

export const ComplianceGuidelineVectorService = {
  normalizeStringList,

  async ensureGuidelineVectorsReady({ tenantId, standardKey, standardVersion, actorUserId }) {
    const standard = await ensureStandard({ tenantId, standardKey, standardVersion, actorUserId });

    const activeVectors = await ComplianceGuidelineVector.countDocuments({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      status: "ACTIVE",
    });
    if (activeVectors > 0) {
      return {
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        ready: true,
        source: "existing",
        activeVectorCount: activeVectors,
      };
    }

    const seedChunks = buildControlSeedChunks(standard);
    if (!seedChunks.length) {
      return {
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        ready: false,
        source: "missing-controls",
        activeVectorCount: 0,
      };
    }

    const seedHash = sha256(
      JSON.stringify({
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        controls: seedChunks.map((chunk) => chunk.metadata?.controlId || chunk.text),
      })
    );

    const { document } = await upsertGuidelineDocument({
      tenantId,
      standard,
      fileName: `${standard.standardKey}-${standard.version}-control-seed`,
      mimeType: "text/plain",
      fileSize: Buffer.byteLength(seedChunks.map((chunk) => chunk.text).join("\n\n"), "utf8"),
      contentHash: seedHash,
      instructionContext: "Auto-indexed from standard control registry for one-time baseline retrieval.",
      contextTags: ["seed", "control-mapping", standard.standardKey],
      sourceType: "STANDARD_CONTROL_SEED",
      actorUserId,
      metadata: {
        generatedFrom: "standard-controls",
        standardName: standard.name || standard.standardKey,
      },
    });

    await indexDocumentChunks({
      tenantId,
      standard,
      document,
      chunks: seedChunks,
      actorUserId,
    });

    const refreshedCount = await ComplianceGuidelineVector.countDocuments({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      status: "ACTIVE",
    });

    return {
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      ready: refreshedCount > 0,
      source: "control-seed",
      activeVectorCount: refreshedCount,
    };
  },

  async loadActiveVectors({ tenantId, standardKey, standardVersion }) {
    const key = normalizeStandardKey(standardKey);
    const version = normalizeStandardVersion(standardVersion);
    return ComplianceGuidelineVector.find({
      tenantId,
      standardKey: key,
      standardVersion: version,
      status: "ACTIVE",
    })
      .select("_id documentId chunkText embedding metadata")
      .sort({ documentId: 1, chunkOrder: 1 })
      .lean();
  },

  findTopMatchesForQuestion({
    vectors = [],
    questionText = "",
    categoryName = "",
    regulatoryReference = "",
    limit = 4,
    minScore = MIN_RETRIEVAL_SCORE,
  }) {
    const query = normalize([questionText, categoryName, regulatoryReference].filter(Boolean).join(" "));
    if (!query || !Array.isArray(vectors) || !vectors.length) return [];
    const { embedding: queryEmbedding } = buildEmbedding(query);
    const queryTokens = new Set(tokenize(query));
    const regulatoryNorm = normalize(regulatoryReference).toLowerCase();

    const scored = vectors
      .map((entry) => {
        const baseScore = cosineForUnitVectors(queryEmbedding, entry.embedding || []);
        if (baseScore <= 0) return null;

        const metadata = safeObject(entry.metadata);
        const clauseRef = normalize(metadata.clauseRef || "").toLowerCase();
        const standardRefs = normalizeStringList(metadata.standardRefs || []).map((item) =>
          item.toLowerCase()
        );
        const contextTags = normalizeStringList(metadata.contextTags || []).map((item) =>
          item.toLowerCase()
        );

        const tagOverlap = contextTags.reduce(
          (acc, tag) => (queryTokens.has(tag) ? acc + 1 : acc),
          0
        );

        const hasRegulatoryHit =
          !!regulatoryNorm &&
          ((clauseRef && (clauseRef.includes(regulatoryNorm) || regulatoryNorm.includes(clauseRef))) ||
            standardRefs.some(
              (ref) => ref.includes(regulatoryNorm) || regulatoryNorm.includes(ref)
            ));

        const sourceType = normalize(metadata.sourceType || "");
        const sourceBoost = sourceType === "UPLOADED_GUIDELINE" ? 0.03 : 0.015;
        const score = baseScore + tagOverlap * 0.018 + (hasRegulatoryHit ? 0.16 : 0) + sourceBoost;

        return { entry, score };
      })
      .filter((item) => item && Number(item.score || 0) >= Number(minScore || MIN_RETRIEVAL_SCORE))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, Math.max(1, Math.min(MAX_QUERY_HITS, Number(limit || 4))));

    return scored.map(({ entry, score }) => serializeMatch(entry, score));
  },

  mergeMappedControlsWithGuidelineHits({ mappedControls = [], guidelineHits = [], limit = 3 } = {}) {
    return mergeMappedControls({ mappedControls, guidelineHits, limit });
  },

  async uploadGuidelineFiles({
    tenantId,
    standardKey,
    standardVersion,
    files = [],
    instructionContext = "",
    contextTags = [],
    replaceExisting = false,
    actorUserId,
  }) {
    const standard = await ensureStandard({ tenantId, standardKey, standardVersion, actorUserId });
    const uploads = Array.isArray(files) ? files : [];
    if (!uploads.length) {
      const err = new Error("At least one guideline file is required");
      err.status = 400;
      throw err;
    }

    if (replaceExisting) {
      await archiveActiveGuidelineData({
        tenantId,
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        actorUserId,
      });
    }

    const results = [];
    for (const file of uploads) {
      const originalname = normalize(file?.originalname || "guideline");
      const mimeType = guessMimeType(file);
      const buffer = file?.buffer;

      if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
        results.push({
          fileName: originalname,
          status: "failed",
          reason: "File buffer is empty",
        });
        continue;
      }

      const text = await extractTextFromUpload({ ...file, mimetype: mimeType });
      if (!text || text.length < 40) {
        results.push({
          fileName: originalname,
          status: "failed",
          reason: "Extracted text is empty or too short",
        });
        continue;
      }

      const contentHash = sha256(text);
      const { document, reused } = await upsertGuidelineDocument({
        tenantId,
        standard,
        fileName: originalname,
        mimeType,
        fileSize: Number(file.size || buffer.length || 0),
        contentHash,
        instructionContext,
        contextTags,
        sourceType: "UPLOADED_GUIDELINE",
        actorUserId,
        metadata: {
          uploadedFrom: "compliance-guideline-api",
          uploadedByRole: normalize(actorUserId ? "user" : "system"),
        },
      });

      if (reused) {
        results.push({
          fileName: originalname,
          status: "reused",
          documentId: String(document._id),
          vectorCount: Number(document.vectorCount || 0),
          contentHash,
        });
        continue;
      }

      try {
        const chunks = buildUploadChunks({
          text,
          sourceType: "UPLOADED_GUIDELINE",
          fileName: originalname,
          instructionContext,
          contextTags,
        });

        const vectorCount = await indexDocumentChunks({
          tenantId,
          standard,
          document,
          chunks,
          actorUserId,
        });

        results.push({
          fileName: originalname,
          status: "indexed",
          documentId: String(document._id),
          chunks: chunks.length,
          vectorCount,
          contentHash,
        });
      } catch (error) {
        document.status = "FAILED";
        document.errorMessage = error?.message || "Failed to index guideline";
        document.updatedBy = actorUserId || document.updatedBy;
        await document.save();
        results.push({
          fileName: originalname,
          status: "failed",
          documentId: String(document._id),
          reason: error?.message || "Failed to index guideline",
        });
      }
    }

    const [activeVectors, docsByStatus] = await Promise.all([
      ComplianceGuidelineVector.countDocuments({
        tenantId,
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        status: "ACTIVE",
      }),
      ComplianceGuidelineDocument.aggregate([
        {
          $match: {
            tenantId,
            standardKey: standard.standardKey,
            standardVersion: standard.version,
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    return {
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      files: results,
      activeVectorCount: activeVectors,
      documentStatusSummary: docsByStatus.reduce((acc, item) => {
        acc[String(item?._id || "UNKNOWN")] = Number(item?.count || 0);
        return acc;
      }, {}),
    };
  },

  async getGuidelineStatus({ tenantId, standardKey, standardVersion, actorUserId }) {
    const standard = await ensureStandard({ tenantId, standardKey, standardVersion, actorUserId });
    const [activeVectorCount, docs] = await Promise.all([
      ComplianceGuidelineVector.countDocuments({
        tenantId,
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        status: "ACTIVE",
      }),
      ComplianceGuidelineDocument.find({
        tenantId,
        standardKey: standard.standardKey,
        standardVersion: standard.version,
      })
        .select(
          "_id fileName status sourceType vectorCount extractedTextLength createdAt updatedAt contentHash errorMessage"
        )
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const statusSummary = docs.reduce((acc, doc) => {
      const key = String(doc?.status || "UNKNOWN");
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});

    const sourceSummary = docs.reduce((acc, doc) => {
      const key = String(doc?.sourceType || "UNKNOWN");
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      standardName: standard.name || standard.standardKey,
      ready: activeVectorCount > 0,
      activeVectorCount,
      documentsCount: docs.length,
      statusSummary,
      sourceSummary,
      documents: docs.map((doc) => ({
        id: String(doc._id),
        fileName: doc.fileName || "",
        status: doc.status || "",
        sourceType: doc.sourceType || "",
        vectorCount: Number(doc.vectorCount || 0),
        extractedTextLength: Number(doc.extractedTextLength || 0),
        contentHash: doc.contentHash || "",
        errorMessage: doc.errorMessage || "",
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
      })),
    };
  },

  async reindexActiveGuidelines({
    tenantId,
    standardKey,
    standardVersion,
    actorUserId,
    ensureReady = true,
  }) {
    const standard = await ensureStandard({ tenantId, standardKey, standardVersion, actorUserId });
    const activeVectors = await ComplianceGuidelineVector.find({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      status: "ACTIVE",
    })
      .select("_id chunkText")
      .lean();

    if (!activeVectors.length) {
      if (!ensureReady) {
        return {
          standardKey: standard.standardKey,
          standardVersion: standard.version,
          reindexed: 0,
          reason: "No active vectors found",
        };
      }

      const ensured = await this.ensureGuidelineVectorsReady({
        tenantId,
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        actorUserId,
      });
      return {
        standardKey: standard.standardKey,
        standardVersion: standard.version,
        reindexed: Number(ensured.activeVectorCount || 0),
        reason: ensured.source || "seeded",
      };
    }

    const updates = activeVectors.map((entry) => {
      const { embedding, norm, tokenCount } = buildEmbedding(entry.chunkText || "");
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: {
            $set: {
              embedding,
              embeddingNorm: norm,
              tokenCount,
              updatedBy: actorUserId || undefined,
            },
          },
        },
      };
    });

    if (updates.length) {
      await ComplianceGuidelineVector.bulkWrite(updates, { ordered: false });
    }

    return {
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      reindexed: updates.length,
      reason: "Active vectors re-embedded",
    };
  },
};
