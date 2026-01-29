import "dotenv/config";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { Categories } from "../src/models/categoriesModel.js";
import {
  injectInlinePlaceholders,
  buildDocumentTemplateFromText,
} from "../src/services/questionnaireExtractionService.js";
import { normalizeDocumentTemplateText } from "../src/services/questionnaireGeminiService.js";

const DOC_TEMPLATE_TYPES = new Set([
  "INTIMATION_LETTER",
  "RFQ",
  "SCOPE",
  "AGENDA",
  "PRE_AUDIT_Q",
  "FINAL_REPORT",
  "CAPA_NOTICE",
]);

const normalizeQuestionText = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ensureCategories = async (names = []) => {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (!unique.length) return new Map();
  const existing = await Categories.find({ name: { $in: unique } }).lean();
  const map = new Map(existing.map((c) => [c.name, c._id]));
  const missing = unique.filter((name) => !map.has(name));
  if (missing.length) {
    const created = await Categories.insertMany(missing.map((name) => ({ name })));
    created.forEach((c) => map.set(c.name, c._id));
  }
  return map;
};

const upsertTemplateQuestions = async ({ templateId, questions, dryRun }) => {
  if (!questions.length) return;
  const categories = Array.from(new Set(questions.map((q) => q.categoryName || "Uncategorized")));
  const catMap = await ensureCategories(categories);

  const docs = questions.map((q, idx) => ({
    question: q.question,
    questionCode: q.questionCode,
    categoryName: q.categoryName || "Uncategorized",
    subCategoryName: q.subCategoryName || "",
    templateId,
    categoryId: q.categoryId || catMap.get(q.categoryName || "Uncategorized") || new mongoose.Types.ObjectId(),
    riskcategory: q.riskcategory || "",
    Audittype: q.Audittype || "",
    industry: q.industry || "",
    Physical: "Y",
    normalizedQuestion: q.normalizedQuestion || normalizeQuestionText(q.question || ""),
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

const main = async () => {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("Missing Mongo connection string in env (MONGO_URI / MONGODB_URI).");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(mongoUri);

  const templates = await Template.find({
    templateType: { $in: Array.from(DOC_TEMPLATE_TYPES) },
  }).lean();

  let processed = 0;
  let skipped = 0;

  for (const template of templates) {
    const templateType = String(template.templateType || "").toUpperCase();
    if (!DOC_TEMPLATE_TYPES.has(templateType)) {
      skipped += 1;
      continue;
    }
    const rawBody = template.documentBody || "";
    if (!rawBody) {
      skipped += 1;
      continue;
    }
    let normalized = null;
    try {
      normalized = await normalizeDocumentTemplateText(rawBody, { templateType });
    } catch (err) {
      console.warn(`LLM normalize failed for template ${template.templateId}:`, err?.message || err);
    }
    const withPlaceholders = injectInlinePlaceholders(normalized || rawBody, { templateType });
    const parsed = buildDocumentTemplateFromText(withPlaceholders || rawBody);

    if (!dryRun) {
      await Template.updateOne(
        { templateId: template.templateId },
        {
          $set: {
            documentBody: withPlaceholders,
            categories: parsed.categories || [],
            extractionConfig: {
              ...(template.extractionConfig || {}),
              documentBlocks: parsed.blocks || [],
            },
          },
        }
      );
    }

    await upsertTemplateQuestions({
      templateId: template.templateId,
      questions: parsed.questions || [],
      dryRun,
    });
    processed += 1;
    console.log(`Backfilled template #${template.templateId} (${templateType})`);
  }

  console.log(`Done. processed=${processed} skipped=${skipped} dryRun=${dryRun}`);
  await mongoose.connection.close();
};

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
