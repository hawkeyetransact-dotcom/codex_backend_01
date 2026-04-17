/**
 * fix-template3-metadata.mjs — One-time fix for Template 3.
 *
 * Template 3 ("Full PSCI SAQ") has 98 questions in templateQuestions but its
 * parent template doc is missing templateType, artifactType, and status fields.
 * This prevents resolveDefaultTemplateId() from auto-binding it to
 * EXECUTION_QUESTIONNAIRE artifacts.
 *
 * This script:
 *   1. Finds Template 3
 *   2. Sets templateType = "EXECUTION_Q"
 *   3. Sets artifactType = "EXECUTION_QUESTIONNAIRE"
 *   4. Sets status = "PUBLISHED"
 *   5. Verifies the fix
 *
 * READ-ONLY until you confirm. Pass --apply to actually update.
 *
 * Usage:
 *   node scripts/fix-template3-metadata.mjs          # dry-run
 *   node scripts/fix-template3-metadata.mjs --apply  # apply fix
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";

const dryRun = !process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI);
console.log("Database:", mongoose.connection.db.databaseName);
console.log("Mode:", dryRun ? "DRY RUN (pass --apply to update)" : "APPLYING CHANGES");

const template = await Template.findOne({ templateId: 3 });
if (!template) {
  console.error("Template 3 not found!");
  await mongoose.disconnect();
  process.exit(1);
}

console.log("\nBefore:");
console.log(`  templateId: ${template.templateId}`);
console.log(`  name: ${template.name}`);
console.log(`  templateType: ${template.templateType || "(null)"}`);
console.log(`  artifactType: ${template.artifactType || "(null)"}`);
console.log(`  status: ${template.status || "(null)"}`);

if (dryRun) {
  console.log("\nWould set:");
  console.log(`  templateType → "EXECUTION_Q"`);
  console.log(`  artifactType → "EXECUTION_QUESTIONNAIRE"`);
  console.log(`  status → "PUBLISHED"`);
  console.log("\nRe-run with --apply to make the change.");
} else {
  template.templateType = "EXECUTION_Q";
  template.artifactType = "EXECUTION_QUESTIONNAIRE";
  template.status = "PUBLISHED";
  await template.save();

  console.log("\nAfter:");
  console.log(`  templateType: ${template.templateType}`);
  console.log(`  artifactType: ${template.artifactType}`);
  console.log(`  status: ${template.status}`);
  console.log("\nTemplate 3 metadata fixed successfully.");
}

await mongoose.disconnect();
