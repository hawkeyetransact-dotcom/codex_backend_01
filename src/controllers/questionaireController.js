import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { Template } from "../models/templateModel.js";
import { Categories } from "../models/categoriesModel.js";
import { loadQuestionnairePreview } from "../services/questionnairePreviewService.js";
import { processQuestionnaireUpload } from "../services/questionnaireExtractionService.js";
import {
  coerceQuestionsFromGemini,
  extractQuestionnaireWithGemini,
} from "../services/questionnaireGeminiService.js";

const MIN_PEQ_QUESTIONS = 20;

const inferMimeType = (filename = "") => {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".txt") return "text/plain";
  return "application/octet-stream";
};

const resolveTemplateSourcePath = (template) => {
  if (!template) return "";
  const rawSourcePath = template.sourceFile || template.extractionConfig?.sourceUrl || "";
  const candidates = [];
  if (rawSourcePath) {
    candidates.push(rawSourcePath);
    if (!path.isAbsolute(rawSourcePath)) {
      candidates.push(path.join(process.cwd(), rawSourcePath));
    }
  }
  if (template.sourceFileName) {
    candidates.push(path.join(process.cwd(), "uploads", template.sourceFileName));
    candidates.push(path.join(process.cwd(), "test", "data", template.sourceFileName));
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
};

const rebuildTemplateQuestions = async (template) => {
  const sourcePath = resolveTemplateSourcePath(template);
  if (!sourcePath) return null;
  const buffer = fs.readFileSync(sourcePath);
  const mimetype = template.sourceMimeType || inferMimeType(template.sourceFileName || sourcePath);
  const originalname = template.sourceFileName || path.basename(sourcePath);

  const fallback = await processQuestionnaireUpload({
    file: { buffer, mimetype, originalname, size: buffer.length },
    templateType: template.templateType,
  });

  let questions = fallback.questions || [];
  let categories = fallback.categories || [];
  let subCategories = fallback.subCategories || [];

  if (template.templateType === "PRE_AUDIT_Q" && questions.length < MIN_PEQ_QUESTIONS) {
    const llmSource = fallback.documentBody || "";
    if (llmSource) {
      try {
        const gemini = await extractQuestionnaireWithGemini(llmSource);
        const mapped = gemini ? coerceQuestionsFromGemini(gemini.categories || []) : null;
        if (mapped?.questions?.length) {
          questions = mapped.questions;
          categories = mapped.categories;
          subCategories = mapped.subCategories || [];
        }
      } catch (err) {
        console.warn("Gemini re-extraction failed:", err.message);
      }
    }
  }

  if (!questions.length) return null;

  const categoryNames = Array.from(new Set(categories.length ? categories : questions.map((q) => q.categoryName || "Uncategorized")));
  const existingCats = await Categories.find({ name: { $in: categoryNames } }).lean();
  const catMap = new Map(existingCats.map((c) => [c.name, c._id]));
  const toInsert = categoryNames.filter((name) => !catMap.has(name)).map((name) => ({ name }));
  if (toInsert.length) {
    const inserted = await Categories.insertMany(toInsert);
    inserted.forEach((c) => catMap.set(c.name, c._id));
  }

  const docs = questions.map((q, idx) => {
    const normalizedQuestion = (q.normalizedQuestion || String(q.question || "").trim()).toLowerCase();
    const responseSchema = q.responseSchema || {
      type: q.answerType || "text",
      options: (q.options || []).map((o) => ({ value: o, label: o })),
      helperText: q.helperText || "",
      placeholder: "",
      commentPlaceholder: "",
      required: false,
      validation: {},
      layout: {},
      subQuestions: q.subQuestions || [],
    };
    return {
      question: q.question,
      categoryName: q.categoryName || "Uncategorized",
      subCategoryName: q.subCategoryName || "",
      templateId: template.templateId,
      categoryId: q.categoryId || catMap.get(q.categoryName || "Uncategorized") || new mongoose.Types.ObjectId(),
      riskcategory: q.riskcategory || "",
      Audittype: q.Audittype || "",
      industry: q.industry || "",
      Physical: "Y",
      normalizedQuestion,
      responseSchema,
      answerType: q.answerType || "text",
      options: q.options || [],
      helperText: q.helperText || "",
      subQuestions: q.subQuestions || [],
      extractionHints: q.extractionHints || {},
      answerMapping: q.answerMapping || {},
      order: Number.isFinite(q.order) ? q.order : idx,
      version: 1,
    };
  });

  await TemplateQuestions.deleteMany({ templateId: template.templateId });
  await TemplateQuestions.insertMany(docs);
  await Template.updateOne(
    { templateId: template.templateId },
    {
      $set: {
        "extractionConfig.rebuiltAt": new Date(),
        "extractionConfig.rebuildSource": "auto",
      },
    }
  );

  return { questions: docs, totalRecords: docs.length };
};

export const getQuestionsByTemplateId = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { id } = req.params;

  try {
    const templateId = Number(id);
    if (Number.isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const numericLimit = Number(limit);
    const query = {
      templateId: { $in: [templateId, String(id)] },
    };
    const cursor = TemplateQuestions.find(query)
      .select("question categoryName subCategoryName templateId categoryId riskcategory Audittype industry Physical createdAt docUrls answerType options helperText subQuestions order responseSchema normalizedQuestion questionCode extractionHints answerMapping")
      .sort({ categoryName: 1, order: 1, createdAt: 1 })
      .lean();

    let questions = [];
    let totalRecords = 0;

    if (numericLimit === 0) {
      [questions, totalRecords] = await Promise.all([
        cursor.exec(),
        TemplateQuestions.countDocuments(query),
      ]);
    } else {
      const skip = (Number(page) - 1) * numericLimit;
      [questions, totalRecords] = await Promise.all([
        cursor.limit(numericLimit).skip(skip).exec(),
        TemplateQuestions.countDocuments(query),
      ]);
    }

    const template = await Template.findOne({ templateId }).lean();
    const shouldForceRebuild = String(req.query?.rebuild || "") === "1";
    const allowAutoRebuild =
      template?.templateType === "PRE_AUDIT_Q" &&
      !template?.extractionConfig?.rebuiltAt;
    if ((totalRecords < MIN_PEQ_QUESTIONS || shouldForceRebuild || allowAutoRebuild) && template?.templateType === "PRE_AUDIT_Q") {
      const rebuilt = await rebuildTemplateQuestions(template);
      if (rebuilt?.totalRecords) {
        const refreshedCursor = TemplateQuestions.find(query)
          .select("question categoryName subCategoryName templateId categoryId riskcategory Audittype industry Physical createdAt docUrls answerType options helperText subQuestions order responseSchema normalizedQuestion questionCode extractionHints answerMapping")
          .sort({ categoryName: 1, order: 1, createdAt: 1 })
          .lean();
        questions = numericLimit === 0 ? await refreshedCursor.exec() : await refreshedCursor.limit(numericLimit).skip((Number(page) - 1) * numericLimit).exec();
        totalRecords = await TemplateQuestions.countDocuments(query);
      }
    }

    res.status(200).json({
      questions,
      totalRecords,
      totalPages: numericLimit === 0 ? 1 : Math.ceil(totalRecords / numericLimit),
      currentPage: numericLimit === 0 ? 1 : Number(page),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getQuestionnairePreviewByTemplateId = async (req, res) => {
  const { id } = req.params;
  const templateId = Number(id);
  if (Number.isNaN(templateId)) {
    return res.status(400).json({ error: "Invalid template id" });
  }
  try {
    const preview = await loadQuestionnairePreview(templateId);
    if (!preview) {
      return res.status(404).json({ error: "Preview template not found" });
    }
    return res.status(200).json(preview);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
