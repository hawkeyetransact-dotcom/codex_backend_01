import mongoose from "mongoose";
import dotenv from "dotenv";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { QuestionnaireUpload } from "../src/models/questionnaireUploadModel.js";

dotenv.config();

const uri = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGO_URI is not configured. Aborting.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to delete templates in production.");
  process.exit(1);
}

const dbName = process.env.MONGO_DB_NAME || undefined;

const run = async () => {
  await mongoose.connect(uri, dbName ? { dbName } : undefined);
  const filter = { templateId: { $gte: 4 } };
  const [tpls, q, uploads] = await Promise.all([
    Template.deleteMany(filter),
    TemplateQuestions.deleteMany(filter),
    QuestionnaireUpload.deleteMany(filter),
  ]);
  console.log(`Templates deleted: ${tpls.deletedCount}`);
  console.log(`Template questions deleted: ${q.deletedCount}`);
  console.log(`Questionnaire uploads deleted: ${uploads.deletedCount}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Delete templates failed:", err);
  process.exit(1);
});
