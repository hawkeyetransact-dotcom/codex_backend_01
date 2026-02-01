import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { Categories } from "../src/models/categoriesModel.js";
import {
  extractTextFromBuffer,
  extractHtmlFromBuffer,
  injectInlinePlaceholders,
  buildDocumentTemplateFromText,
  renderDocumentBlocksToHtml,
} from "../src/services/questionnaireExtractionService.js";
import { normalizeDocumentTemplateText } from "../src/services/questionnaireGeminiService.js";

const TEMPLATE_SPECS = [
  {
    name: "Intimation Letter",
    file: "test/data/Intimation letter.pdf",
    templateType: "INTIMATION_LETTER",
    artifactType: "INTIMATION_LETTER",
  },
  {
    name: "Scope & Agenda",
    file: "test/data/Audit_Agenda _Template 19 (1).docx",
    templateType: "SCOPE",
    artifactType: "SCOPE",
  },
];

const resolveMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
};

const computeNextTemplateId = async () => {
  const maxTemplate = await Template.findOne().sort({ templateId: -1 }).select("templateId").lean();
  const maxQuestions = await TemplateQuestions.findOne().sort({ templateId: -1 }).select("templateId").lean();
  const maxVal = Math.max(maxTemplate?.templateId || 0, maxQuestions?.templateId || 0);
  return maxVal + 1;
};

const ensureCategories = async (names = []) => {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (!unique.length) return new Map();
  const existing = await Categories.find({ name: { $in: unique } }).lean();
  const map = new Map(existing.map((c) => [c.name, c._id]));
  const toInsert = unique.filter((name) => !map.has(name)).map((name) => ({ name }));
  if (toInsert.length) {
    const inserted = await Categories.insertMany(toInsert);
    inserted.forEach((c) => map.set(c.name, c._id));
  }
  return map;
};

const upsertTemplateQuestions = async ({ templateId, questions, dryRun }) => {
  if (!questions.length) return;
  const categories = Array.from(new Set(questions.map((q) => q.categoryName || "Document")));
  const catMap = await ensureCategories(categories);

  const docs = questions.map((q, idx) => ({
    question: q.question,
    questionCode: q.questionCode,
    categoryName: q.categoryName || "Document",
    subCategoryName: q.subCategoryName || "",
    templateId,
    categoryId: q.categoryId || catMap.get(q.categoryName || "Document") || new mongoose.Types.ObjectId(),
    riskcategory: q.riskcategory || "",
    Audittype: q.Audittype || "",
    industry: q.industry || "",
    Physical: "Y",
    normalizedQuestion:
      q.normalizedQuestion ||
      String(q.question || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    responseSchema: q.responseSchema || {
      type: q.answerType || "text",
      options: (q.options || []).map((o) => ({ value: o, label: o })),
      helperText: q.helperText || "",
      placeholder: "",
      commentPlaceholder: "",
      required: false,
      validation: {},
      layout: {},
      subQuestions: q.subQuestions || [],
    },
    answerType: q.answerType || "text",
    options: q.options || [],
    helperText: q.helperText || "",
    subQuestions: q.subQuestions || [],
    extractionHints: q.extractionHints || {},
    answerMapping: q.answerMapping || {},
    order: Number.isFinite(q.order) ? q.order : idx,
    version: 1,
  }));

  if (dryRun) return;
  await TemplateQuestions.deleteMany({ templateId });
  if (docs.length) {
    await TemplateQuestions.insertMany(docs);
  }
};

const buildTemplatePayload = async ({ filePath, templateType }) => {
  const buffer = fs.readFileSync(filePath);
  const mimetype = resolveMimeType(filePath);

  const extracted = await extractTextFromBuffer(mimetype, buffer);
  let documentBody = extracted?.text || "";
  try {
    const normalized = await normalizeDocumentTemplateText(documentBody, { templateType });
    documentBody = normalized || documentBody;
  } catch (error) {
    console.warn("Template normalization failed, using raw text.");
  }

  if (documentBody) {
    documentBody = injectInlinePlaceholders(documentBody, { templateType });
  }

  const parsed = buildDocumentTemplateFromText(documentBody || "");
  let documentHtml = "";

  const htmlExtracted = await extractHtmlFromBuffer(mimetype, buffer);
  if (htmlExtracted?.html) {
    documentHtml = htmlExtracted.html;
  } else if (parsed?.blocks?.length) {
    documentHtml = renderDocumentBlocksToHtml(parsed.blocks);
  }

  return {
    documentBody,
    documentHtml,
    documentBlocks: parsed.blocks || [],
    questions: parsed.questions || [],
    categories: parsed.categories || [],
  };
};

const upsertTemplate = async ({ spec, dryRun }) => {
  const existing = await Template.findOne({
    templateType: spec.templateType,
    tenantId: null,
  }).lean();
  const templateId = existing?.templateId || (await computeNextTemplateId());
  const filePath = path.join(process.cwd(), spec.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const payload = await buildTemplatePayload({ filePath, templateType: spec.templateType });

  if (!dryRun) {
    await Template.updateOne(
      { templateId },
      {
        $set: {
          tenantId: null,
          templateId,
          name: spec.name,
          templateType: spec.templateType,
          artifactType: spec.artifactType,
          status: "PUBLISHED",
          version: 1,
          sourceFile: filePath,
          sourceFileName: path.basename(filePath),
          sourceMimeType: resolveMimeType(filePath),
          categories: payload.categories || [],
          documentBody: payload.documentBody || "",
          extractionConfig: {
            defaultTemplate: true,
            documentBlocks: payload.documentBlocks || [],
            documentHtml: payload.documentHtml || "",
          },
          visibility: { tenantOnly: false },
        },
      },
      { upsert: true }
    );
  }

  await upsertTemplateQuestions({
    templateId,
    questions: payload.questions || [],
    dryRun,
  });

  return { templateId, action: existing ? "updated" : "created" };
};

const run = async () => {
  const mongoUri =
    process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("Missing Mongo connection string in env (MONGO_URI / MONGODB_URI).");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(mongoUri);

  for (const spec of TEMPLATE_SPECS) {
    const result = await upsertTemplate({ spec, dryRun });
    console.log(`- ${spec.templateType}: ${result.action} (templateId=${result.templateId})`);
  }

  console.log(`Done. dryRun=${dryRun}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
