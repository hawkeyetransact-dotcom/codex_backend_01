/**
 * diag-templates.mjs — read-only inspection of templates and template-questions
 *
 * Lists what templates exist (templateId, type, name, status, tenantId) and how
 * many TemplateQuestions belong to each. Used to diagnose why
 * EXECUTION_QUESTIONNAIRE artifacts have templateId=null after auto-bootstrap.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";

await mongoose.connect(process.env.MONGO_URI);
console.log("Database:", mongoose.connection.db.databaseName);

const templates = await Template.find({})
  .select("templateId name templateType artifactType status tenantId archiveFlag extractionConfig")
  .lean();
console.log(`\nTotal Templates: ${templates.length}`);
console.log(
  "id".padEnd(6) +
    " | " +
    "type".padEnd(20) +
    " | " +
    "artifact".padEnd(24) +
    " | " +
    "status".padEnd(12) +
    " | " +
    "name"
);
console.log("-".repeat(110));
for (const t of templates.sort((a, b) => (a.templateId || 0) - (b.templateId || 0))) {
  console.log(
    String(t.templateId ?? "?").padEnd(6) +
      " | " +
      String(t.templateType || "-").padEnd(20) +
      " | " +
      String(t.artifactType || "-").padEnd(24) +
      " | " +
      String(t.status || "-").padEnd(12) +
      " | " +
      String(t.name || "-").slice(0, 50)
  );
}

// Distinct templateIds in the question library
const distinctIds = await TemplateQuestions.distinct("templateId");
console.log(`\nDistinct templateIds in TemplateQuestions: ${distinctIds.length}`);
for (const id of distinctIds.sort((a, b) => (a || 0) - (b || 0))) {
  const count = await TemplateQuestions.countDocuments({ templateId: id });
  console.log(`  templateId=${id}: ${count} questions`);
}

await mongoose.disconnect();
