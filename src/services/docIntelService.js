import crypto from "crypto";
import fs from "fs";
import fse from "fs-extra";
import path from "path";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { load as loadHtml } from "cheerio";
import EvidenceUpload from "../models/evidenceUploadModel.js";
import EvidencePage from "../models/evidencePageModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";

const STOPWORDS = new Set([
  "with",
  "this",
  "that",
  "have",
  "from",
  "will",
  "they",
  "their",
  "there",
  "which",
  "other",
  "about",
  "shall",
  "should",
  "would",
  "could",
  "these",
  "those",
  "where",
  "been",
  "into",
  "your",
  "such",
  "each",
  "also",
  "some",
  "more",
  "than",
  "within",
  "after",
  "before",
  "when",
  "what",
  "does",
  "because",
  "including",
  "using",
  "upon",
  "through",
  "under",
  "over",
  "must",
  "required",
  "ensure",
  "ensure",
  "please",
  "provide",
  "describe",
  "information",
]);

const normalize = (txt = "") => txt.replace(/\s+/g, " ").trim();

const extractPagesFromPdf = async (buffer) => {
  const pages = [];
  try {
    const options = {
      pagerender: (pageData) =>
        pageData.getTextContent({ normalizeWhitespace: true }).then((textContent) => {
          const strings = textContent.items.map((item) => item.str).join(" ");
          pages.push(strings);
          return strings;
        }),
    };
    const parsed = await pdf(buffer, options);
    if (!pages.length && parsed?.text) {
      const split = parsed.text.split(/\f/g);
      pages.push(...split);
    }
    return { pages, pageCount: parsed?.numpages || pages.length || 0 };
  } catch (err) {
    const fallback = buffer.toString("utf-8");
    return { pages: [fallback], pageCount: 1 };
  }
};

const computeSha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const extractKeywords = (questionText = "", limit = 12) => {
  const tokens = questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  const unique = [];
  tokens.forEach((t) => {
    if (!unique.includes(t)) unique.push(t);
  });
  return unique.slice(0, limit);
};

const scoreText = (text = "", keywords = []) => {
  if (!text || !keywords.length) return 0;
  let score = 0;
  const lower = text.toLowerCase();
  keywords.forEach((kw) => {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(regex);
    if (matches?.length) score += matches.length;
  });
  return score;
};

const makeQuote = (text = "", keywords = []) => {
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 120);
      const end = Math.min(text.length, idx + 120);
      return normalize(text.slice(start, end));
    }
  }
  return normalize(text.slice(0, 180));
};

const confidenceFromScore = (score = 0) => {
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MED";
  if (score >= 1) return "LOW";
  return "NONE";
};

const nearestSection = (table, $) => {
  const prev = $(table)
    .prevAll("p")
    .map((_, el) => normalize($(el).text()))
    .get()
    .find((t) => t);
  return prev || "";
};

const parseQuestionsFromDocx = async (templateDocxPath) => {
  if (!templateDocxPath) throw new Error("templateDocxPath is required");
  if (!fs.existsSync(templateDocxPath)) throw new Error(`Template not found at ${templateDocxPath}`);

  const { value: html } = await mammoth.convertToHtml({ path: templateDocxPath });
  const $ = loadHtml(html);
  const questions = [];

  $("table").each((_, table) => {
    const section = nearestSection(table, $);
    $(table)
      .find("tr")
      .each((__, row) => {
        const cells = $(row)
          .find("td, th")
          .map((i, el) => normalize($(el).text()))
          .get();
        if (!cells.length) return;
        const numMatch = cells[0]?.match(/^(\d{1,3})/);
        if (!numMatch) return;
        const qnum = Number(numMatch[1]);
        const questionText = normalize(cells.slice(1).join(" "));
        if (!questionText) return;
        questions.push({ qnum, section, questionText });
      });
  });

  const seen = new Set();
  return questions
    .filter((q) => {
      if (!q.qnum || seen.has(q.qnum)) return false;
      seen.add(q.qnum);
      return true;
    })
    .sort((a, b) => a.qnum - b.qnum);
};

const writeArtifacts = async (results = []) => {
  const outDir = path.join(process.cwd(), "out");
  await fse.ensureDir(outDir);
  await fse.writeFile(path.join(outDir, "question_coverage.json"), JSON.stringify(results, null, 2));

  const header = ["qnum", "section", "confidence", "bestScore", "fileName", "pageNumber", "quote"];
  const rows = [header.join(",")];
  results.forEach((r) => {
    const ev = r.evidence?.[0] || {};
    const row = [
      r.qnum ?? "",
      (r.section || "").replace(/"/g, '""'),
      r.confidence || "",
      r.bestScore ?? "",
      ev.fileName ? ev.fileName.replace(/"/g, '""') : "",
      ev.pageNumber ?? "",
      ev.quote ? ev.quote.replace(/"/g, '""') : "",
    ]
      .map((v) => `"${v}"`)
      .join(",");
    rows.push(row);
  });
  await fse.writeFile(path.join(outDir, "question_coverage.csv"), rows.join("\n"));
};

export const DocIntelService = {
  async ingestPdf({ file, tenantId, uploaderId, auditRequestId = null }) {
    if (!file) throw new Error("File missing");
    if (!tenantId) throw new Error("tenantId is required");
    if (!uploaderId) throw new Error("uploaderId is required");
    const mime = file.mimetype || file.type || "application/octet-stream";
    if (!mime.includes("pdf")) throw new Error("Only PDF evidence is supported for ingestion");

    const fileSha256 = computeSha256(file.buffer);
    const upload = await EvidenceUpload.create({
      tenantId,
      uploaderId,
      fileName: file.originalname || "evidence.pdf",
      fileSha256,
      mime,
      size: file.size || file.buffer?.length || 0,
      status: "processing",
      auditRequestId,
    });

    try {
      const { pages, pageCount } = await extractPagesFromPdf(file.buffer);
      const docs = pages.map((text, idx) => ({
        tenantId,
        uploadId: upload._id,
        auditRequestId,
        fileName: file.originalname || "evidence.pdf",
        fileSha256,
        mime,
        pageNumber: idx + 1,
        text: normalize(text || ""),
      }));

      if (docs.length) {
        await EvidencePage.insertMany(docs, { ordered: false });
      }

      upload.pageCount = pageCount || docs.length;
      upload.status = "ready";
      await upload.save();

      return { upload, pagesStored: docs.length };
    } catch (err) {
      upload.status = "failed";
      upload.error = err.message;
      await upload.save();
      throw err;
    }
  },

  async parseSaqQuestions(templateDocxPath) {
    return parseQuestionsFromDocx(templateDocxPath);
  },

  async coverageWithTemplate({ tenantId, templateDocxPath, topN = 3 }) {
    const questions = await parseQuestionsFromDocx(templateDocxPath);
    return this.computeCoverage({ tenantId, questions, topN });
  },

  async coverageForAudit({ tenantId, auditRequestId, topN = 3 }) {
    if (!auditRequestId) throw new Error("auditRequestId is required");
    const questions = await AuditQuestions.find({ auditRequestId }).lean();
    if (!questions.length) throw new Error("No questions found for audit");
    const mapped = questions.map((q) => ({
      qnum: q.questionCode || q.question_id || undefined,
      section: q.category || q.section || "",
      questionText: q.question || q.textResponse || "",
    }));
    return this.computeCoverage({ tenantId, questions: mapped, topN, auditRequestId });
  },

  async computeCoverage({ tenantId, questions = [], topN = 3, auditRequestId = null }) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!questions.length) throw new Error("No questions provided");

    const uploadFilter = auditRequestId
      ? { tenantId, status: "ready", auditRequestId }
      : { tenantId, status: "ready" };
    const uploads = await EvidenceUpload.find(uploadFilter).lean();
    if (!uploads.length) return questions.map((q) => ({ ...q, confidence: "NONE", bestScore: 0, evidence: [] }));

    const uploadIds = uploads.map((u) => u._id);
    const uploadMap = new Map(uploads.map((u) => [String(u._id), u]));
    const pageFilter = auditRequestId
      ? { tenantId, uploadId: { $in: uploadIds }, auditRequestId }
      : { tenantId, uploadId: { $in: uploadIds } };
    const pages = await EvidencePage.find(pageFilter).lean();
    const results = [];

    for (const q of questions) {
      const keywords = extractKeywords(q.questionText || "");
      const scored = pages
        .map((p) => {
          const score = scoreText(p.text || "", keywords);
          return { score, page: p };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topN);

      const evidence = scored.map((s) => ({
        fileName: s.page.fileName,
        pageNumber: s.page.pageNumber,
        uploadId: s.page.uploadId,
        score: s.score,
        quote: makeQuote(s.page.text || "", keywords),
      }));
      const bestScore = evidence[0]?.score || 0;

      results.push({
        qnum: q.qnum,
        section: q.section,
        questionText: q.questionText,
        confidence: confidenceFromScore(bestScore),
        bestScore,
        evidence,
      });
    }

    await writeArtifacts(results);
    return results;
  },
};
