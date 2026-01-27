import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { Categories } from "../src/models/categoriesModel.js";
import { AssessmentType } from "../src/models/assessmentTypeModel.js";
import { processQuestionnaireUpload, ensureUploadDir } from "../src/services/questionnaireExtractionService.js";

dotenv.config();

const SAMPLE_FILES = [
  {
    label: "Vendor Registration Form",
    filePath: path.join(process.cwd(), "test", "data", "Annexure_I_Vendor Registration Form.doc"),
    templateType: "VENDOR_REGISTRATION",
    artifactType: null,
    phaseKey: null,
    defaultCategory: "Vendor Registration",
    markDefault: true,
  },
  {
    label: "Vendor Questionnaire (Packaging Materials)",
    filePath: path.join(
      process.cwd(),
      "test",
      "data",
      "Annexure_V_VENDOR QUESTIONNAIRE FOR PACKAGING MATERIALS_QAD 022_09.doc"
    ),
    templateType: "PRE_AUDIT_Q",
    artifactType: "PRE_AUDIT_QUESTIONNAIRE",
    phaseKey: "PREP",
    defaultCategory: "Pre-Audit Questionnaire",
  },
  {
    label: "Audit Agenda Template",
    filePath: path.join(process.cwd(), "test", "data", "Audit_Agenda _Template 19 (1).docx"),
    templateType: "AGENDA",
    artifactType: "AGENDA",
    phaseKey: "PLANNING",
    defaultCategory: "Agenda",
    markDefault: true,
  },
  {
    label: "Intimation Letter",
    filePath: path.join(process.cwd(), "test", "data", "Intimation letter.pdf"),
    templateType: "INTIMATION_LETTER",
    artifactType: "INTIMATION_LETTER",
    phaseKey: "INITIATED",
    defaultCategory: "Intimation Letter",
    markDefault: true,
  },
];

const guessMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".doc") return "application/msword";
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
};

const normalizeQuestionText = (text = "") =>
  text.toLowerCase().replace(/[\W_]+/g, "").trim();

const resolveAssessmentTypeId = async () => {
  const key = "PHARMA_API_CGMP_ICHQ7";
  const doc = await AssessmentType.findOne({ key }).select("_id").lean();
  return doc?._id || null;
};

const getNextTemplateId = async () => {
  const [maxTemplate, maxQuestion] = await Promise.all([
    Template.findOne().sort({ templateId: -1 }).select("templateId").lean(),
    TemplateQuestions.findOne().sort({ templateId: -1 }).select("templateId").lean(),
  ]);
  const maxVal = Math.max(maxTemplate?.templateId || 0, maxQuestion?.templateId || 0);
  return maxVal + 1;
};

const upsertTemplate = async ({ templateId, name, templateType, artifactType, phaseKey, assessmentTypeId, source }) => {
  const payload = {
    name,
    templateType,
    artifactType,
    phaseKey,
    assessmentTypeId,
    sourceFile: source.sourceFile,
    sourceFileName: source.sourceFileName,
    sourceMimeType: source.sourceMimeType,
    status: "PUBLISHED",
    version: 1,
    extractionConfig: source.extractionConfig || {},
  };
  return Template.findOneAndUpdate(
    { templateId },
    { $set: payload },
    { upsert: true, new: true }
  );
};

const ensureCategories = async (categoryNames = []) => {
  const uniqueNames = Array.from(new Set(categoryNames.map((c) => c || "Uncategorized")));
  if (!uniqueNames.length) return new Map();
  const existing = await Categories.find({ name: { $in: uniqueNames } }).lean();
  const map = new Map(existing.map((c) => [c.name, c._id]));
  const toInsert = uniqueNames.filter((name) => !map.has(name)).map((name) => ({ name }));
  if (toInsert.length) {
    const inserted = await Categories.insertMany(toInsert);
    inserted.forEach((c) => map.set(c.name, c._id));
  }
  return map;
};

const upsertQuestions = async ({ templateId, questions, categoryMap }) => {
  if (!questions.length) return 0;
  await TemplateQuestions.deleteMany({ templateId });
  const docs = questions.map((q, idx) => ({
    question: q.question,
    questionCode: q.questionCode,
    categoryName: q.categoryName || "Uncategorized",
    subCategoryName: q.subCategoryName || "",
    templateId,
    categoryId: categoryMap.get(q.categoryName || "Uncategorized"),
    riskcategory: q.riskcategory || "",
    Audittype: q.Audittype || "",
    industry: q.industry || "",
    Physical: "Y",
    normalizedQuestion: q.normalizedQuestion || normalizeQuestionText(q.question || ""),
    responseSchema: q.responseSchema,
    answerType: q.answerType || "text",
    options: q.options || [],
    helperText: q.helperText || "",
    subQuestions: q.subQuestions || [],
    extractionHints: q.extractionHints || {},
    answerMapping: q.answerMapping || {},
    order: Number.isFinite(q.order) ? q.order : idx,
    version: 1,
  }));
  await TemplateQuestions.insertMany(docs);
  return docs.length;
};

const seedOne = async (seed, templateId, assessmentTypeId) => {
  if (!fs.existsSync(seed.filePath)) {
    throw new Error(`Missing sample file: ${seed.filePath}`);
  }
  ensureUploadDir();
  const buffer = fs.readFileSync(seed.filePath);
  const fileName = path.basename(seed.filePath);
  const safeName = `${Date.now()}-${fileName.replace(/\s+/g, "_")}`;
  const destPath = path.join(process.cwd(), "uploads", safeName);
  fs.writeFileSync(destPath, buffer);
  const mimetype = guessMimeType(seed.filePath);
  const file = {
    buffer,
    mimetype,
    originalname: fileName,
    size: buffer.length,
  };
  const extraction = await processQuestionnaireUpload({
    file,
    defaultCategory: seed.defaultCategory,
    templateType: seed.templateType,
  });
  const questions = extraction.questions.map((q) => ({
    ...q,
    normalizedQuestion: normalizeQuestionText(q.question || ""),
  }));
  const categoryMap = await ensureCategories(questions.map((q) => q.categoryName || "Uncategorized"));
  const count = await upsertQuestions({ templateId, questions, categoryMap });
  const extractionConfig = {
    usedOcr: extraction.usedOcr,
    textSource: extraction.textSource,
    characterCount: extraction.meta?.characterCount || 0,
    defaultTemplate: seed.markDefault || false,
  };
  await upsertTemplate({
    templateId,
    name: seed.label,
    templateType: seed.templateType,
    artifactType: seed.artifactType,
    phaseKey: seed.phaseKey,
    assessmentTypeId,
    source: {
      sourceFile: destPath,
      sourceFileName: fileName,
      sourceMimeType: mimetype,
      extractionConfig,
    },
  });
  return { templateId, name: seed.label, questionCount: count };
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment.");
  }
  await mongoose.connect(uri);
  const assessmentTypeId = await resolveAssessmentTypeId();
  let nextId = await getNextTemplateId();
  const results = [];
  for (const seed of SAMPLE_FILES) {
    const existing = await Template.findOne({ name: seed.label }).lean();
    const templateId = existing?.templateId || nextId;
    if (!existing) nextId += 1;
    const result = await seedOne(seed, templateId, assessmentTypeId);
    results.push(result);
  }
  console.log("Seeded templates:", results);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});
