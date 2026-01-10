import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { connectDatabase } from "../src/config/database.js";
import { ReportTemplate } from "../src/models/reportTemplateModel.js";

dotenv.config();

const seed = async () => {
  await connectDatabase();
  const filePath = path.join(process.cwd(), "seed", "reportTemplates.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const templates = JSON.parse(raw);

  for (const template of templates) {
    await ReportTemplate.findOneAndUpdate(
      { name: template.name },
      {
        ...template,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  console.log(`Seeded ${templates.length} report templates.`);
  process.exit(0);
};

seed().catch((err) => {
  console.error("Report template seed failed:", err);
  process.exit(1);
});
