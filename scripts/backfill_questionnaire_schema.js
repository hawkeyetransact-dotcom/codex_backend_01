import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { AuditQuestions } from "../src/models/auditQuestionsModels.js";
import { buildDocBlocks, normalizeQuestionText } from "../src/services/questionnairePreviewService.js";
import { loadQuestionnairePreview } from "../src/services/questionnairePreviewService.js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const templateId = Number(process.argv[2] || 3);

const buildSchema = (question, docEntry) => {
  const blocks = buildDocBlocks(docEntry.responseLines || []);
  if (!blocks.length) return null;
  const existing = question.responseSchema || {};
  return {
    ...existing,
    type: existing.type || question.answerType || "text",
    layout: {
      ...(existing.layout || {}),
      source: "doc-template",
      blocks,
    },
    subQuestions: existing.subQuestions || [],
  };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const preview = await loadQuestionnairePreview(templateId);
  if (!preview) {
    console.log(`No doc preview available for template ${templateId}`);
    await mongoose.disconnect();
    return;
  }

  const docMap = new Map();
  preview.questions.forEach((q) => {
    docMap.set(normalizeQuestionText(q.question), q);
  });

  const templateQuestions = await TemplateQuestions.find({ templateId }).lean();
  const templateOps = [];
  const templateSchemaMap = new Map();

  templateQuestions.forEach((q) => {
    const key = normalizeQuestionText(q.question || "");
    const docEntry = docMap.get(key);
    if (!docEntry) return;
    const schema = buildSchema(q, docEntry);
    if (!schema) return;
    const hasBlocks = Array.isArray(q.responseSchema?.layout?.blocks) && q.responseSchema.layout.blocks.length > 0;
    if (hasBlocks) {
      templateSchemaMap.set(String(q._id), q.responseSchema);
      return;
    }
    templateOps.push({
      updateOne: {
        filter: { _id: q._id },
        update: { $set: { responseSchema: schema } },
      },
    });
    templateSchemaMap.set(String(q._id), schema);
  });

  if (templateOps.length) {
    await TemplateQuestions.bulkWrite(templateOps);
  }

  const auditQuestions = await AuditQuestions.find({ templateId }).select("_id question_id responseSchema").lean();
  const auditOps = [];
  auditQuestions.forEach((q) => {
    const hasBlocks = Array.isArray(q.responseSchema?.layout?.blocks) && q.responseSchema.layout.blocks.length > 0;
    if (hasBlocks) return;
    const schema = templateSchemaMap.get(String(q.question_id));
    if (!schema) return;
    auditOps.push({
      updateOne: {
        filter: { _id: q._id },
        update: { $set: { responseSchema: schema } },
      },
    });
  });

  if (auditOps.length) {
    await AuditQuestions.bulkWrite(auditOps);
  }

  console.log(
    `Template updates: ${templateOps.length}, Audit question updates: ${auditOps.length}`
  );
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
