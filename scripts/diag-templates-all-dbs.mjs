/**
 * diag-templates-all-dbs.mjs — read-only inspection across all databases
 * on the connected Mongo cluster. Lists every non-system DB and dumps its
 * `templates` collection so we can compare which DB has EXECUTION_Q
 * templates set up correctly.
 *
 * NO writes. Pure read.
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const admin = mongoose.connection.db.admin();
const { databases } = await admin.listDatabases();

const skip = new Set(["admin", "local", "config"]);
const dbs = databases
  .map((d) => d.name)
  .filter((n) => !skip.has(n))
  .sort();

console.log(`Cluster has ${dbs.length} non-system databases:\n  ${dbs.join("\n  ")}`);

for (const dbName of dbs) {
  const db = mongoose.connection.useDb(dbName, { useCache: false });
  const collections = await db.db.listCollections().toArray();
  const hasTemplates = collections.some((c) => c.name === "templates");
  // Mongo is case-sensitive — try several known variants
  const tqColName = collections
    .map((c) => c.name)
    .find((n) => n.toLowerCase() === "templatequestions");
  const hasTemplateQuestions = Boolean(tqColName);

  console.log(`\n=== Database: ${dbName} ===`);
  console.log(`  collections: ${collections.length}`);
  console.log(`  templates collection: ${hasTemplates ? "yes" : "no"}`);
  console.log(`  templatequestions collection: ${hasTemplateQuestions ? "yes" : "no"}`);

  if (hasTemplates) {
    const templates = await db.db
      .collection("templates")
      .find({})
      .project({
        templateId: 1,
        name: 1,
        templateType: 1,
        artifactType: 1,
        status: 1,
        archiveFlag: 1,
      })
      .toArray();
    console.log(`  templates: ${templates.length}`);
    console.log(
      "    " +
        "id".padEnd(6) +
        " | " +
        "type".padEnd(20) +
        " | " +
        "artifact".padEnd(24) +
        " | " +
        "status".padEnd(12) +
        " | name"
    );
    console.log("    " + "-".repeat(110));
    for (const t of templates.sort((a, b) => (a.templateId || 0) - (b.templateId || 0))) {
      console.log(
        "    " +
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
  }

  if (hasTemplateQuestions) {
    const distinctIds = await db.db.collection(tqColName).distinct("templateId");
    console.log(`  ${tqColName} distinct templateIds: ${distinctIds.length}`);
    for (const id of distinctIds.sort((a, b) => (a || 0) - (b || 0))) {
      const count = await db.db.collection(tqColName).countDocuments({ templateId: id });
      console.log(`    templateId=${id}: ${count} questions`);
    }
  }
}

await mongoose.disconnect();
