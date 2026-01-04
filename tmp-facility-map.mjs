import dotenv from "dotenv";
import mongoose from "mongoose";
import { TemplateQuestions } from "./src/models/templateQuestionsModel.js";

dotenv.config();
await mongoose.connect(process.env.MONGO_URI);

const mapping = [
  {
    _id: "693c3d02b7ab274aff06a218",
    code: "FACILITY_TYPE",
    opts: [
      { value: "API (active pharmaceutical ingredient) manufacture", aliases: ["api", "api manufacturing"] },
      { value: "Biological manufacture", aliases: [] },
      { value: "Chemical manufacture", aliases: ["chemical plant", "intermediates", "ksm"] },
      { value: "Contract Research Laboratories", aliases: ["cro", "process r&d", "analytical r&d", "crl"] },
      { value: "Finished Formulations", aliases: [] },
      { value: "Logistics / Warehouse", aliases: ["warehouse", "warehousing"] },
      { value: "Primary Packaging", aliases: [] },
      { value: "Other (please describe)", aliases: ["other"] },
    ],
    keywords: ["facility type", "activities", "manufacturing", "api", "r&d", "warehouse"],
    sections: ["Site Master File", "Activities", "Manufacturing capabilities", "Process/Analytical R&D"],
  },
  {
    _id: "693c3d02b7ab274aff06a220",
    code: "RISK_MANAGEMENT",
    opts: [
      { value: "Formal process to assess programs routinely", aliases: ["formal process"] },
      { value: "Business interruption risks (flood, weather, adjacent operations)", aliases: ["flood", "storm", "weather", "adjacent operations"] },
      { value: "Reputation risks (community impacts, waste discharge, etc.)", aliases: ["community", "waste discharge", "reputation"] },
      { value: "Legal risks (permits, fair wage practices, etc.)", aliases: ["permits", "compliance", "fair wage"] },
    ],
    keywords: ["risk management", "assess programs", "interruption", "reputation", "legal"],
    sections: ["Risk Management"],
  },
];

for (const m of mapping) {
  await TemplateQuestions.findByIdAndUpdate(
    m._id,
    {
      $set: {
        questionCode: m.code,
        answerMapping: { type: "checkbox", options: m.opts, joinChar: "|" },
        extractionHints: {
          keywords: m.keywords,
          sections: m.sections,
          expectedEntities: [],
          confidencePolicy: "require_evidence",
        },
      },
    },
    { new: true }
  );
}

console.log('updated template questions for Facility mapping');
await mongoose.disconnect();
