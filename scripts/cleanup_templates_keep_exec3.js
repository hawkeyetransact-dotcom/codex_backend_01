import "dotenv/config";
import mongoose from "mongoose";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";

const KEEP_TEMPLATE_IDS = new Set([3]);

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

  const templates = await Template.find({}).select("templateId name templateType").lean();
  const toDelete = templates.filter((t) => !KEEP_TEMPLATE_IDS.has(t.templateId));

  console.log(`Found ${templates.length} templates. Keeping ${Array.from(KEEP_TEMPLATE_IDS).join(", ")}`);
  console.log(`Deleting ${toDelete.length} templates.`);

  if (!dryRun) {
    const deleteIds = toDelete.map((t) => t.templateId);
    await Template.deleteMany({ templateId: { $in: deleteIds } });
    await TemplateQuestions.deleteMany({ templateId: { $in: deleteIds } });
  }

  await mongoose.connection.close();
  console.log(`Done. dryRun=${dryRun}`);
};

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
