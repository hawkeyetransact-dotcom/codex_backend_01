import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { connectDatabase } from "../src/config/database.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import "../src/config/loadEnv.js";

const DEFAULT_PDF_PATH = path.join(
  process.cwd(),
  "test",
  "data",
  "ich-q-7-good-manufacturing-practice-active-pharmaceutical-ingredients-step-5_en.pdf"
);

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","into","such","shall","should","may","can","will","are","was","were","has","have","had",
  "not","all","any","their","there","which","when","where","what","who","how","why","its","also","per","including","within","each","other",
  "use","used","using","appropriate","ensure","ensuring","system","systems","process","processes","products","product","api","apis","intermediate",
  "materials","material","quality","management","records","record","documentation","document","documents","controls","control","control",
  "personnel","facilities","facility","equipment","production","laboratory","validation","change","complaints","recalls","contract","storage",
  "distribution","packaging","labeling","cleaning","testing","audit","audits","review","reviews"
]);

const SECTION_HEADINGS = [
  { code: "1", title: "Introduction" },
  { code: "1.1", title: "Objective" },
  { code: "1.2", title: "Regulatory Applicability" },
  { code: "1.3", title: "Scope" },
  { code: "2", title: "Quality Management" },
  { code: "2.1", title: "Principles" },
  { code: "2.2", title: "Responsibilities of the Quality Unit" },
  { code: "2.3", title: "Responsibility for Production Activities" },
  { code: "2.4", title: "Internal Audits" },
  { code: "2.5", title: "Product Quality Review" },
  { code: "3", title: "Personnel" },
  { code: "3.1", title: "Personnel Qualifications" },
  { code: "3.2", title: "Personnel Hygiene" },
  { code: "3.3", title: "Consultants" },
  { code: "4", title: "Buildings and Facilities" },
  { code: "4.1", title: "Design and Construction" },
  { code: "4.2", title: "Utilities" },
  { code: "4.3", title: "Water" },
  { code: "4.4", title: "Containment" },
  { code: "4.5", title: "Lighting" },
  { code: "4.6", title: "Sewage and Refuse" },
  { code: "4.7", title: "Sanitation and Maintenance" },
  { code: "5", title: "Process Equipment" },
  { code: "5.1", title: "Design and Construction" },
  { code: "5.2", title: "Equipment Maintenance and Cleaning" },
  { code: "5.3", title: "Calibration" },
  { code: "5.4", title: "Computerized Systems" },
  { code: "6", title: "Documentation and Records" },
  { code: "6.1", title: "Documentation System and Specifications" },
  { code: "6.2", title: "Equipment Cleaning and Use Record" },
  { code: "6.3", title: "Records of Raw Materials" },
  { code: "6.4", title: "Master Production Instructions" },
  { code: "6.5", title: "Batch Production Records" },
  { code: "6.6", title: "Laboratory Control Records" },
  { code: "6.7", title: "Batch Production and Control Records Review" },
  { code: "7", title: "Materials Management" },
  { code: "7.1", title: "General Controls" },
  { code: "7.2", title: "Receipt and Quarantine" },
  { code: "7.3", title: "Sampling and Testing of Incoming Materials" },
  { code: "7.4", title: "Storage" },
  { code: "7.5", title: "Re-evaluation" },
  { code: "8", title: "Production and In-Process Controls" },
  { code: "8.1", title: "Production Operations" },
  { code: "8.2", title: "In-Process Sampling and Controls" },
  { code: "8.3", title: "Time Limits" },
  { code: "8.4", title: "In-Process Blending" },
  { code: "8.5", title: "Contamination Control" },
  { code: "9", title: "Packaging and Identification Labeling" },
  { code: "10", title: "Storage and Distribution" },
  { code: "11", title: "Laboratory Controls" },
  { code: "12", title: "Validation" },
  { code: "13", title: "Change Control" },
  { code: "14", title: "Rejection and Re-use of Materials" },
  { code: "15", title: "Complaints and Recalls" },
  { code: "16", title: "Contract Manufacturers" },
  { code: "17", title: "Agents, Brokers, Traders, Distributors, Repackers, and Relabelers" },
  { code: "18", title: "Specific Guidance for APIs Manufactured by Cell Culture/Fermentation" },
];

const normalizeText = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text = "") =>
  normalizeText(text)
    .split(" ")
    .filter((token) => token && token.length > 2 && !STOPWORDS.has(token));

const buildHeadingRegex = (code, title) => {
  const escapedTitle = title.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\n\\s*${code.replace(".", "\\.")}\\s+${escapedTitle}`, "gi");
};

const findLastIndex = (text, regex) => {
  let last = -1;
  const matches = text.matchAll(regex);
  for (const match of matches) {
    if (typeof match.index === "number") last = match.index;
  }
  return last;
};

const extractSections = (text) => {
  const indices = SECTION_HEADINGS.map((heading) => {
    const regex = buildHeadingRegex(heading.code, heading.title);
    const idx = findLastIndex(text, regex);
    return { ...heading, index: idx };
  }).filter((entry) => entry.index >= 0);

  const sorted = indices.sort((a, b) => a.index - b.index);
  return sorted.map((entry, i) => {
    const start = entry.index;
    const end = i < sorted.length - 1 ? sorted[i + 1].index : text.length;
    const content = text.slice(start, end);
    return { ...entry, content };
  });
};

const buildKeywordMap = (content, title) => {
  const tokens = tokenize(`${title} ${content}`);
  const freq = new Map();
  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));
  return freq;
};

const scoreQuestion = (questionTokens, freqMap) =>
  questionTokens.reduce((acc, token) => acc + (freqMap.get(token) || 0), 0);

const mapQuestionsToSections = (questions, sections) => {
  const sectionModels = sections.map((section) => ({
    ...section,
    freq: buildKeywordMap(section.content, section.title),
  }));

  return questions.map((q) => {
    const questionText = `${q.question || ""} ${q.categoryName || ""} ${q.subCategoryName || ""}`;
    const tokens = tokenize(questionText);
    let best = null;
    let bestScore = 0;
    sectionModels.forEach((section) => {
      const score = scoreQuestion(tokens, section.freq);
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
    });
    if (!best || bestScore === 0) {
      return { questionId: q._id, reference: null, confidence: 0 };
    }
    const confidence = Math.min(1, bestScore / Math.max(tokens.length, 1));
    const reference = `ICH Q7 ${best.code} ${best.title}`;
    return { questionId: q._id, reference, section: best.code, title: best.title, confidence };
  });
};

const run = async () => {
  const templateId = Number(process.env.TEMPLATE_ID || process.argv[2] || 3);
  const pdfPath = process.env.ICH_Q7_PDF || DEFAULT_PDF_PATH;

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`ICH Q7 PDF not found at ${pdfPath}`);
  }

  await connectDatabase();

  const pdfBuffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(pdfBuffer);
  const text = parsed.text || "";
  const sections = extractSections(text);
  if (!sections.length) {
    console.warn("No ICH Q7 sections detected; mapping may be empty.");
  }

  const questions = await TemplateQuestions.find({ templateId }).lean();
  if (!questions.length) {
    console.warn(`No questions found for templateId=${templateId}`);
    return;
  }

  const mapped = mapQuestionsToSections(questions, sections);
  const ops = mapped.map((entry) => {
    if (!entry.reference) {
      return {
        updateOne: {
          filter: { _id: entry.questionId },
          update: { $unset: { cfrReference: "", regulatoryReferences: "" } },
        },
      };
    }
    return {
      updateOne: {
        filter: { _id: entry.questionId },
        update: {
          $set: {
            cfrReference: entry.reference,
            regulatoryReferences: [
              {
                standard: "ICH Q7",
                section: entry.section,
                title: entry.title,
                confidence: entry.confidence,
                source: "ICH_Q7_PDF",
              },
            ],
          },
        },
      },
    };
  });

  const result = await TemplateQuestions.bulkWrite(ops, { ordered: false });
  console.log(`Mapped ${mapped.length} questions. Updated: ${result.modifiedCount}`);
};

run()
  .then(() => {
    console.log("ICH Q7 mapping completed.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
