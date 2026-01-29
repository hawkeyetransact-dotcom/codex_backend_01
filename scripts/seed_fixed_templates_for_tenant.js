import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { Categories } from "../src/models/categoriesModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import {
  extractTextFromBuffer,
  processQuestionnaireUpload,
  isFormTemplate,
} from "../src/services/questionnaireExtractionService.js";
import { normalizeTemplateText } from "../src/services/questionnaireGeminiService.js";

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
  {
    name: "Vendor Questionnaire - Raw Material (Annexure IV)",
    file: "test/data/Annexure_IV_VENDOR QUESTIONNAIRE RAW FOR MATERIAL_QAD 022_09.doc",
    templateType: "PRE_AUDIT_Q",
    artifactType: "PRE_AUDIT_QUESTIONNAIRE",
  },
  {
    name: "Vendor Questionnaire - Packaging (Annexure V)",
    file: "test/data/Annexure_V_VENDOR QUESTIONNAIRE FOR PACKAGING MATERIALS_QAD 022_09.doc",
    templateType: "PRE_AUDIT_Q",
    artifactType: "PRE_AUDIT_QUESTIONNAIRE",
  },
];

const resolveMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".doc") return "application/msword";
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

const buildQuestions = async ({ filePath, templateType }) => {
  const buffer = fs.readFileSync(filePath);
  const mimetype = resolveMimeType(filePath);
  const file = {
    buffer,
    mimetype,
    originalname: path.basename(filePath),
    size: buffer.length,
  };

  let documentBody = "";
  if (isFormTemplate(templateType)) {
    const extracted = await extractTextFromBuffer(mimetype, buffer);
    documentBody = extracted?.text || "";
    try {
      const normalized = await normalizeTemplateText(documentBody, { templateType });
      documentBody = normalized || documentBody;
    } catch (error) {
      console.warn("Template normalization failed, using raw text.");
    }
  }

  const parsed = await processQuestionnaireUpload({
    file,
    defaultCategory: "",
    templateType,
  });

  const questions = parsed.questions || [];
  if (documentBody) {
    parsed.documentBody = documentBody;
  }
  return {
    questions,
    categories: parsed.categories || [],
    documentBody: parsed.documentBody || "",
  };
};

const seedTemplate = async ({ tenantId, spec }) => {
  const existing = await Template.findOne({
    tenantId,
    templateType: spec.templateType,
    name: spec.name,
  }).lean();
  if (existing) {
    return { templateId: existing.templateId, action: "skipped" };
  }

  const templateId = await computeNextTemplateId();
  const filePath = path.join(process.cwd(), spec.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  const { questions, categories, documentBody } = await buildQuestions({
    filePath,
    templateType: spec.templateType,
  });
  const categoryMap = await ensureCategories(categories);

  const docs = questions.map((q, idx) => ({
    question: q.question,
    questionCode: q.questionCode,
    categoryName: q.categoryName || "Uncategorized",
    subCategoryName: q.subCategoryName || "",
    templateId,
    categoryId: q.categoryId || categoryMap.get(q.categoryName || "Uncategorized") || new mongoose.Types.ObjectId(),
    riskcategory: q.riskcategory || "",
    Audittype: q.Audittype || "",
    industry: q.industry || "",
    Physical: "Y",
    normalizedQuestion: q.normalizedQuestion || q.question?.toLowerCase?.().replace(/[\W_]+/g, "") || "",
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

  if (docs.length) {
    await TemplateQuestions.insertMany(docs);
  }

  await Template.create({
    tenantId,
    templateId,
    name: spec.name,
    templateType: spec.templateType,
    artifactType: spec.artifactType,
    status: "PUBLISHED",
    version: 1,
    sourceFile: filePath,
    sourceFileName: path.basename(filePath),
    sourceMimeType: resolveMimeType(filePath),
    categories,
    documentBody: documentBody || "",
    extractionConfig: { defaultTemplate: true },
  });

  return { templateId, action: "created" };
};

const resolveTenantIds = async ({ tenantId, auditIds }) => {
  if (tenantId) return [tenantId];
  if (!auditIds.length) return [];
  const audits = await AuditRequestMaster.find({
    $or: [{ internalRequestId: { $in: auditIds } }, { supplierRequestId: { $in: auditIds } }],
  })
    .select("tenantOrgId")
    .lean();
  return Array.from(new Set(audits.map((a) => a.tenantOrgId).filter(Boolean)));
};

const run = async () => {
  const args = process.argv.slice(2);
  const tenantArg = args.find((arg) => arg.startsWith("--tenant="));
  const tenantId = tenantArg ? tenantArg.split("=")[1] : "";
  const auditIds = args.filter((arg) => !arg.startsWith("--tenant="));
  const mongoUri =
    process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!mongoUri) {
    console.error("Missing Mongo connection string in env (MONGO_URI / MONGODB_URI).");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  const tenants = await resolveTenantIds({ tenantId, auditIds });
  if (!tenants.length) {
    console.error("No tenantId resolved. Provide --tenant or audit IDs.");
    process.exit(1);
  }
  for (const tid of tenants) {
    console.log(`Seeding templates for tenant ${tid}`);
    for (const spec of TEMPLATE_SPECS) {
      const result = await seedTemplate({ tenantId: tid, spec });
      console.log(` - ${spec.templateType}: ${result.action} (templateId=${result.templateId})`);
    }
  }
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
