import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { extractOcrTextFromPdf, extractOcrTextFromPdfPages } from "../helpers/aiHelper.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";
import { runComplianceFlowForAudit } from "../services/compliance/complianceFlowService.js";
import { DigiLockerService } from "../services/digilocker/digilockerService.js";
import { readExtractedText } from "../services/digilocker/digilockerStorageService.js";
import { mergeReportTemplate } from "../utils/reportTemplateEngine.js";
import { renderReportHtml } from "../utils/reportHtmlRenderer.js";

const shouldUseLocal = () => {
  if (process.env.AUTO_FILL_MODE === "local") return true;
  return !process.env.LLM_SERVICE_URL;
};

const extractTextFromPdfBuffer = async (buf) => {
  try {
    const parsed = await pdfParse(buf);
    return parsed.text || "";
  } catch {
    return "";
  }
};

const extractPdfPages = async (buf, options = {}) => {
  const forceOcr = Boolean(options.forceOcr);
  const pages = [];
  try {
    const parsed = await pdfParse(buf, {
      pagerender: (pageData) =>
        pageData.getTextContent({ normalizeWhitespace: true }).then((textContent) => {
          const pageText = textContent.items.map((item) => item.str).join(" ");
          const page = pageData.pageIndex + 1;
          pages.push({ page, text: pageText || "" });
          return pageText;
        }),
    });
    let text = parsed.text || "";
    const shouldOcr = forceOcr || (process.env.AUTO_FILL_USE_OCR === "true" && !text.trim());
    if (shouldOcr) {
      const ocrPages = await extractOcrTextFromPdfPages(buf);
      ocrPages.forEach((p) => pages.push({ page: p.page, text: p.text || "" }));
      text = ocrPages.map((p) => p.text).join("\n");
    }
    return { text, pages };
  } catch (err) {
    console.warn("extractPdfPages failed", err.message);
    return { text: "", pages: [] };
  }
};

const extractTextFromFileDetailed = async (filePath, options = {}) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      return await extractPdfPages(buf, options);
    }
    if (ext === ".docx" || ext === ".doc") {
      const text = await extractTextFromDocxBuffer(buf);
      return { text, pages: text ? [{ page: 1, text }] : [] };
    }
    const text = buf.toString("utf-8");
    return { text, pages: text ? [{ page: 1, text }] : [] };
  } catch (err) {
    console.warn("extractTextFromFileDetailed failed", filePath, err.message);
    return { text: "", pages: [] };
  }
};

const extractTextFromBufferDetailed = async (buf, fileName = "", options = {}) => {
  try {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === ".pdf") {
      return await extractPdfPages(buf, options);
    }
    if (ext === ".docx" || ext === ".doc") {
      const text = await extractTextFromDocxBuffer(buf);
      return { text, pages: text ? [{ page: 1, text }] : [] };
    }
    const text = buf.toString("utf-8");
    return { text, pages: text ? [{ page: 1, text }] : [] };
  } catch (err) {
    console.warn("extractTextFromBufferDetailed failed", fileName, err.message);
    return { text: "", pages: [] };
  }
};

const extractTextFromDocxBuffer = async (buf) => {
  try {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || "";
  } catch {
    return "";
  }
};

const extractTextFromFile = async (filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".pdf") {
      const parsed = await extractTextFromPdfBuffer(buf);
      if (parsed.trim()) return parsed;
      if (process.env.AUTO_FILL_USE_OCR === "true") {
        return await extractOcrTextFromPdf(buf);
      }
      return "";
    }
    if (ext === ".docx" || ext === ".doc") {
      return await extractTextFromDocxBuffer(buf);
    }
    return buf.toString("utf-8");
  } catch (err) {
    console.warn("extractTextFromFile failed", filePath, err.message);
    return "";
  }
};

const downloadTextFromUrl = async (url = "") => {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("pdf")) {
      const parsed = await extractTextFromPdfBuffer(buf);
      if (parsed.trim()) return parsed;
      if (process.env.AUTO_FILL_USE_OCR === "true") {
        return await extractOcrTextFromPdf(buf);
      }
      return "";
    }
    if (contentType.startsWith("image/")) {
      if (process.env.AUTO_FILL_USE_OCR === "true") {
        return await extractOcrTextFromPdf(buf);
      }
      return "";
    }
    return buf.toString("utf-8");
  } catch (err) {
    console.warn("downloadTextFromUrl failed", url, err.message);
    return "";
  }
};

const downloadTextFromUrlDetailed = async (url = "", options = {}) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return { text: "", pages: [], name: url.split("/").pop() || url };
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    const name = url.split("/").pop() || url;
    if (contentType.includes("pdf") || /\.pdf(\?|$)/i.test(name)) {
      const detailed = await extractPdfPages(buf, options);
      const pages = (detailed.pages || []).map((p) => ({
        ...p,
        textLower: (p.text || "").toLowerCase(),
      }));
      return { text: detailed.text || "", pages, name };
    }
    if (contentType.includes("word") || /\.docx?(\?|$)/i.test(name)) {
      const text = await extractTextFromDocxBuffer(buf);
      return { text, pages: text ? [{ page: 1, text, textLower: text.toLowerCase() }] : [], name };
    }
    if (contentType.startsWith("image/")) {
      if (process.env.AUTO_FILL_USE_OCR === "true") {
        const text = await extractOcrTextFromPdf(buf);
        return { text, pages: text ? [{ page: 1, text, textLower: text.toLowerCase() }] : [], name };
      }
      return { text: "", pages: [], name };
    }
    const text = buf.toString("utf-8");
    return { text, pages: text ? [{ page: 1, text, textLower: text.toLowerCase() }] : [], name };
  } catch (err) {
    console.warn("downloadTextFromUrlDetailed failed", url, err.message);
    return { text: "", pages: [], name: url.split("/").pop() || url };
  }
};

const normalizeYesNo = (val = "") => {
  const raw = val.trim().toLowerCase();
  if (["yes", "y", "true"].includes(raw)) return "Yes";
  if (["no", "n", "false"].includes(raw)) return "No";
  if (["na", "n/a"].includes(raw)) return "NA";
  return "";
};

const buildEvidenceIndex = (evidenceText, profile, files = []) => {
  const text = (evidenceText || "").toLowerCase();
  const has = (pattern) => pattern.test(text);
  const products = new Set();
  if (has(/\bbcx[\s-]?6494\b/i)) products.add("BCX 6494");
  if (has(/\bbcx[\s-]?7611\b/i)) products.add("BCX 7611");
  const sopTypes = new Set();
  const addSop = (label, pattern) => {
    if (pattern.test(text)) sopTypes.add(label);
  };
  addSop("Corporate SOP Index", /corporate\s+sop/i);
  addSop("Engineering SOP Index", /engineering\s+sop/i);
  addSop("Production SOP Index", /production\s+sop/i);
  addSop("QA SOP Index", /\bqa\s+sop/i);
  addSop("Quality Control SOP Index", /quality\s+control\s+sop/i);
  addSop("General SOP Index", /general\s+sop/i);
  addSop("CSV SOP Index", /\bcsv\s+sop/i);

  files.forEach((file) => {
    if (/corporate sop/i.test(file)) sopTypes.add("Corporate SOP Index");
    if (/engineering sop/i.test(file)) sopTypes.add("Engineering SOP Index");
    if (/production sop/i.test(file)) sopTypes.add("Production SOP Index");
    if (/\bqa sop/i.test(file)) sopTypes.add("QA SOP Index");
    if (/quality control sop/i.test(file)) sopTypes.add("Quality Control SOP Index");
    if (/general sop/i.test(file)) sopTypes.add("General SOP Index");
    if (/\bcsv sop/i.test(file)) sopTypes.add("CSV SOP Index");
  });

  const siteName =
    profile?.site_name ||
    (has(/unit[-\s]?iv/i) ? "Unit-IV" : "") ||
    profile?.companyName ||
    "";

  return {
    companyName: profile?.companyName || (has(/sai life sciences/i) ? "Sai Life Sciences Limited" : ""),
    siteName,
    address: profile?.addressline1 || "",
    city: profile?.city || (has(/\bbidar\b/i) ? "Bidar" : ""),
    state: profile?.state || (has(/\bkarnataka\b/i) ? "Karnataka" : ""),
    country: profile?.country || (has(/\bindia\b/i) ? "India" : ""),
    zipcode: profile?.zipcode || "",
    products: Array.from(products),
    hasSmf: has(/site master file|dsmf|smf/i) || files.some((f) => /site master file/i.test(f)),
    hasSiteLayout: has(/site layout|layout plan|master site layout/i) || files.some((f) => /site layout/i.test(f)),
    hasSopIndex: sopTypes.size > 0,
    sopTypes: Array.from(sopTypes),
    hasPfd: has(/pfd|process flow diagram/i) || files.some((f) => /pfd/i.test(f)),
    hasRos: has(/\bros\b/i) || files.some((f) => /ros/i.test(f)),
    hasEthicsPolicy: has(/code of conduct|ethics policy|anti[-\s]?corruption|privacy/i),
    rawText: evidenceText || "",
  };
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "that",
  "this",
  "have",
  "has",
  "are",
  "was",
  "were",
  "from",
  "your",
  "you",
  "please",
  "provide",
  "facility",
  "company",
  "site",
  "does",
  "how",
  "what",
  "why",
  "which",
  "when",
  "where",
  "yes",
  "no",
  "na",
]);

const tokenize = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));

const buildKeywords = (question) => {
  const tokens = new Set();
  const phrases = new Set();
  const addTokens = (text) => tokenize(text).forEach((t) => tokens.add(t));
  const addPhrase = (text) => {
    const cleaned = String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 6) phrases.add(cleaned);
  };

  addTokens(question.question || "");
  addPhrase(question.question || "");

  const blocks = question.responseSchema?.layout?.blocks || [];
  if (Array.isArray(blocks)) {
    blocks.forEach((block) => {
      if (block.label) {
        addTokens(block.label);
        addPhrase(block.label);
      }
      if (Array.isArray(block.options)) {
        block.options.forEach((opt) => {
          addTokens(opt);
          addPhrase(opt);
        });
      }
    });
  }

  return {
    tokens: Array.from(tokens),
    phrases: Array.from(phrases).sort((a, b) => b.length - a.length),
  };
};

const scoreText = (textLower, keywords) => {
  if (!textLower) return 0;
  let score = 0;
  keywords.phrases.forEach((phrase) => {
    if (textLower.includes(phrase)) score += 3;
  });
  keywords.tokens.forEach((token) => {
    if (textLower.includes(token)) score += 1;
  });
  return score;
};

const findSnippet = (text = "", keywords) => {
  const lower = text.toLowerCase();
  const candidates = [...keywords.phrases, ...keywords.tokens];
  let index = -1;
  for (const term of candidates) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && (index === -1 || pos < index)) {
      index = pos;
    }
  }
  if (index === -1) return "";
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
};

const buildEvidenceReferences = (questions, evidenceDetails = []) => {
  const referenceMap = new Map();
  questions.forEach((q) => {
    const keywords = buildKeywords(q);
    if (!keywords.tokens.length && !keywords.phrases.length) {
      referenceMap.set(String(q._id), { sources: [], contextText: "" });
      return;
    }
    const matches = [];
    evidenceDetails.forEach((file) => {
      const pages = Array.isArray(file.pages) ? file.pages : [];
      let best = null;
      pages.forEach((page) => {
        const textLower = page.textLower || page.text?.toLowerCase() || "";
        const score = scoreText(textLower, keywords);
        if (!best || score > best.score) {
          best = { ...page, score, fileName: file.name };
        }
      });
      if (best && best.score >= 2) {
        const snippet = findSnippet(best.text || "", keywords);
        matches.push({
          score: best.score,
          fileName: best.fileName,
          page: best.page,
          snippet,
          contextText: best.text || "",
        });
      }
    });

    const topMatches = matches.sort((a, b) => b.score - a.score).slice(0, 3);
    const sources = topMatches.map((m) => (m.page ? `${m.fileName} p. ${m.page}` : m.fileName));
    const contextText = topMatches.map((m) => m.contextText || "").join(" ");
    referenceMap.set(String(q._id), { sources, contextText });
  });
  return referenceMap;
};

const refineResponseDetails = (details = {}, blocks = [], contextText = "") => {
  const refined = { ...details };
  if (!Array.isArray(blocks)) return refined;
  if (!contextText) {
    blocks.forEach((block) => {
      if (block.type === "checkboxes" && block.key) delete refined[block.key];
    });
    return refined;
  }
  const lower = contextText.toLowerCase();
  blocks.forEach((block) => {
    if (block.type === "checkboxes" && block.key) {
      const selected = (block.options || []).filter((opt) => lower.includes(String(opt).toLowerCase()));
      if (selected.length) refined[block.key] = selected;
      else delete refined[block.key];
    }
  });
  return refined;
};

const buildResponseDetailsFromBlocks = (blocks, evidence, baseAnswer, freeText) => {
  if (!Array.isArray(blocks) || !blocks.length) return {};
  const details = {};
  let usedYesNo = false;
  blocks.forEach((block) => {
    if (!block?.key) return;
    if (block.type === "yesno") {
      if (!usedYesNo) {
        details[block.key] = baseAnswer || "";
        usedYesNo = true;
      }
    }
    if (block.type === "checkboxes") {
      const selected = (block.options || []).filter((opt) => {
        const lc = String(opt).toLowerCase();
        return evidence.rawText.toLowerCase().includes(lc);
      });
      if (selected.length) details[block.key] = selected;
    }
    if (block.type === "text") {
      if (/web link/i.test(block.label || "")) {
        details[block.key] = "";
      } else if (/comment|explain/i.test(block.label || "")) {
        details[block.key] = freeText || "";
      } else {
        details[block.key] = freeText || "";
      }
    }
  });
  return details;
};

const extractAnswersLocally = (questions, evidenceText, profile, files = []) => {
  const evidence = buildEvidenceIndex(evidenceText, profile, files);
  const matchFiles = (patterns = []) => {
    if (!files.length || !patterns.length) return [];
    return files.filter((name) => patterns.some((re) => re.test(name)));
  };
  return questions.map((q) => {
    const questionText = (q.question || "").toLowerCase();
    let yesNo = "";
    let freeText = "";
    let responseDetails = {};
    const sources = [];
    const notes = [];
    const addSources = (label, patterns = []) => {
      const matched = matchFiles(patterns);
      if (matched.length) {
        matched.forEach((name) => sources.push(`${label}: ${name}`));
      } else {
        sources.push(label);
      }
    };

    if (/(site master file|smf|dsmf)/i.test(questionText) && evidence.hasSmf) {
      yesNo = "Yes";
      freeText = "Site Master File (DSMF-01) provided.";
      notes.push("Matched site master file keywords in evidence text.");
      addSources("Site Master File", [/site master file|dsmf|smf/i]);
    } else if (/(site layout|layout plan)/i.test(questionText) && evidence.hasSiteLayout) {
      yesNo = "Yes";
      freeText = "Site layout plan provided (DDRG01-37).";
      notes.push("Matched site layout keywords in evidence text.");
      addSources("Site Layout", [/site layout|master site layout|ddrg/i]);
    } else if (/(sop|standard operating procedure)/i.test(questionText) && evidence.hasSopIndex) {
      yesNo = "Yes";
      freeText = evidence.sopTypes.length
        ? `SOP index documentation provided (${evidence.sopTypes.join(", ")}).`
        : "";
      notes.push("Matched SOP index keywords in evidence text.");
      addSources("SOP Index", [/sop index/i]);
    } else if (/(product|api|intermediate)/i.test(questionText) && evidence.products.length) {
      yesNo = "Yes";
      freeText = evidence.products.length
        ? `Products handled include ${evidence.products.join(", ")}.`
        : "Products handled include BCX 6494 and BCX 7611.";
      notes.push("Matched product keywords in evidence text.");
      addSources("Process Flow Diagram", [/pfd|bcx/i]);
    } else if (/(facility|site|unit)/i.test(questionText) && (evidence.siteName || evidence.city || evidence.state)) {
      yesNo = "Yes";
      freeText = `Facility: ${evidence.companyName || "Sai Life Sciences Limited"}${evidence.siteName ? `, ${evidence.siteName}` : ""}${evidence.city ? `, ${evidence.city}` : ""}${evidence.state ? ` (${evidence.state})` : ""}.`;
      notes.push("Matched facility details from supplier profile and evidence text.");
      addSources("Supplier profile");
    } else if (/(company name|facility name)/i.test(questionText) && (evidence.companyName || evidence.siteName)) {
      yesNo = "Yes";
      freeText = evidence.companyName || evidence.siteName;
      notes.push("Matched company/site name from supplier profile.");
      addSources("Supplier profile");
    } else if (/(city|state|country|postal|zip)/i.test(questionText)) {
      freeText = `${evidence.city || ""}${evidence.state ? `, ${evidence.state}` : ""}${evidence.country ? `, ${evidence.country}` : ""}${evidence.zipcode ? ` - ${evidence.zipcode}` : ""}`.trim();
      if (freeText) {
        notes.push("Matched location details from supplier profile.");
        addSources("Supplier profile");
      }
    } else if (/(process flow diagram|pfd)/i.test(questionText) && evidence.hasPfd) {
      yesNo = "Yes";
      freeText = "";
      notes.push("Matched PFD keywords in evidence text.");
      addSources("Process Flow Diagram", [/pfd|bcx/i]);
    } else if (/(ethics|code of conduct|anti[-\s]?corruption|privacy)/i.test(questionText) && evidence.hasEthicsPolicy) {
      yesNo = "Yes";
      freeText = "";
      notes.push("Matched ethics/code of conduct keywords in evidence text.");
      addSources("Ethics policy evidence", [/ethics|code of conduct|privacy|anti[-\s]?corruption/i]);
    }

    const blocks = q.responseSchema?.layout?.blocks || [];
    if (Array.isArray(blocks) && blocks.length) {
      const base = yesNo || (freeText ? "Yes" : "");
      responseDetails = buildResponseDetailsFromBlocks(blocks, evidence, base, freeText);
    }
    if (!sources.length && responseDetails && Object.keys(responseDetails).length) {
      notes.push("Matched option keywords in evidence text.");
      sources.push("Evidence text keyword match");
    }

    return {
      id: String(q._id || q.question_id || q.question),
      yesNo,
      freeText,
      responseDetails,
      meta: {
        sources,
        note: notes.join(" "),
      },
    };
  });
};

const buildPrompt = (questions) => {
  const list = questions.map((q) => {
    const opts = (q.options || q.responseSchema?.options || []).map((o) =>
      typeof o === "string" ? o : o?.label || o?.value || ""
    ).filter(Boolean);
    return {
      id: String(q._id || q.question_id || q.question),
      question: q.question,
      answerType: q.answerType || q.responseSchema?.type || "text",
      options: opts,
      questionCode: q.questionCode || "",
      extractionHints: q.extractionHints || {},
    };
  });
  return `You are an assistant that reads audit evidence and answers audit questions concisely.
Return JSON array like:
[
  { "id": "<questionId>", "yesNo": "Yes|No|NA", "selectedOptions": ["opt1","opt2"], "freeText": "text" }
]
Rules:
- Use yesNo only for binary questions.
- Use selectedOptions values exactly from the provided options array when applicable (checkbox/select).
- Use freeText for descriptive fields.
- If unknown, leave fields empty.
Questions:
${JSON.stringify(list, null, 2)}
`;
};

const extractAnswers = async (questions, evidenceText, profile, files = []) => {
  if (!questions.length || !evidenceText.trim()) return [];
  if (shouldUseLocal()) {
    return extractAnswersLocally(questions, evidenceText, profile, files);
  }
  const prompt = buildPrompt(questions) + `\nEvidence:\n${evidenceText.slice(0, 12000)}`;
  try {
    let text = await callLlmService({
      prompt,
      model: process.env.AUTOFILL_MODEL || LLM_MODEL,
      maxTokens: 1500,
      temperature: 0.2,
    });
    text = text || "[]";
    text = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("extractAnswers failed", err.message);
    return [];
  }
};

const PREVIEW_FILES = [
  "DSMF-01 Site master file.pdf.pdf",
  "DDRG01-37- Master Site layout.pdf",
  "Corporate SOP Index.pdf",
  "Engineering SOP Index.pdf",
  "Production SOP Index.pdf",
  "QA SOP Index.pdf",
  "Quality Control SOP Index.pdf",
  "General SOP Index.pdf",
  "CSV SOP Index.pdf",
  "BCX-6494 (BCA) PFDs.pdf",
  "BCX-7611 (BCB) PFD.pdf",
  "ROS.pdf",
];

const REPORT_EVIDENCE_FILES = [...PREVIEW_FILES];

const REPORT_PREVIEW_TEMPLATE = {
  name: "Sai-Style Vendor Audit Report Preview",
  blocks: [
    { id: "title", type: "title", content: "Audit Report" },
    {
      id: "meta-audit",
      type: "meta",
      heading: "Audit Overview",
      fields: [
        { label: "Audited facility", placeholderPath: "auditee.name" },
        { label: "Location and contact information", placeholderPath: "auditee.address" },
        { label: "Products", placeholderPath: "productSummary" },
        { label: "Auditor", placeholderPath: "auditor.name" },
        { label: "Date of audit", placeholderPath: "audit.startDate" },
      ],
    },
    {
      id: "summary",
      type: "richText",
      heading: "Summary of key findings",
      content: "{{sections.summary}}",
    },
    {
      id: "introduction",
      type: "richText",
      heading: "Introduction",
      content: "{{sections.introduction}}",
    },
    {
      id: "company",
      type: "richText",
      heading: "Company information",
      content: "{{sections.companyInfo}}",
    },
    {
      id: "facility",
      type: "richText",
      heading: "Facility",
      content: "{{sections.facility}}",
    },
    {
      id: "tour",
      type: "richText",
      heading: "Tour of the facility",
      content: "{{sections.tour}}",
    },
    {
      id: "warehouses",
      type: "richText",
      heading: "Warehouses",
      content: "{{sections.warehouses}}",
    },
    {
      id: "manufacturing",
      type: "richText",
      heading: "Manufacturing",
      content: "{{sections.manufacturing}}",
    },
    {
      id: "qc",
      type: "richText",
      heading: "Quality Control",
      content: "{{sections.qcLab}}",
    },
    {
      id: "systems",
      type: "richText",
      heading: "Quality Assurance / Systems",
      content: "{{sections.systems}}",
    },
    {
      id: "documents",
      type: "bullets",
      heading: "Documents reviewed",
      listPlaceholderPath: "documentsReviewed",
    },
    {
      id: "products",
      type: "table",
      heading: "Products in scope",
      rowsPath: "products",
      columns: [
        { label: "Product", placeholderPath: "name" },
        { label: "CAS Number", placeholderPath: "casNumber" },
        { label: "Dosage Form", placeholderPath: "dosageForm" },
        { label: "API Technology", placeholderPath: "apiTechnology" },
      ],
    },
    {
      id: "observations",
      type: "observations",
      heading: "Observations",
      listPlaceholderPath: "observations",
      observationMapping: {
        listPath: "observations",
        fields: {
          no: "no",
          severity: "severity",
          reference: "reference",
          description: "description",
          evidence: "evidence",
          recommendation: "recommendation",
        },
      },
    },
    {
      id: "conclusion",
      type: "richText",
      heading: "Conclusion",
      content: "{{sections.conclusion}}",
    },
    {
      id: "signoff",
      type: "signoff",
      heading: "Auditor Sign-off",
      content: "{{signoff.auditorName}} - {{signoff.date}}",
    },
  ],
};

const REPORT_STYLE_FILES = [
  "Vendor Audit Report - Galpha.pdf",
  "Vendor Audit Report_Vasudha Pharma.pdf",
];

const REPORT_LLM_MODEL = process.env.REPORT_LLM_MODEL || LLM_MODEL;

const shouldSkipAuditReport = (name = "") => /audit report/i.test(name);

const loadLocalEvidence = async () => {
  const baseDir = path.join(process.cwd(), "test");
  const files = PREVIEW_FILES.map((name) => ({
    name,
    path: path.join(baseDir, name),
  })).filter((f) => fs.existsSync(f.path));
  let text = "";
  const details = [];
  for (const file of files) {
    if (shouldSkipAuditReport(file.name)) continue;
    const content = await extractTextFromFile(file.path);
    if (content) text += `\n${content}`;
    const detailed = await extractTextFromFileDetailed(file.path);
    const pages = (detailed.pages || []).map((p) => ({
      ...p,
      textLower: (p.text || "").toLowerCase(),
    }));
    details.push({ name: file.name, pages, text: detailed.text || content || "" });
  }
  return { text, files: files.map((f) => f.name), details };
};

const loadUploadedEvidence = async (uploads = [], options = {}) => {
  let text = "";
  const details = [];
  const fileNames = [];
  for (const file of uploads) {
    const name = file?.originalname || file?.filename || "upload";
    fileNames.push(name);
    if (shouldSkipAuditReport(name)) continue;
    const detailed = await extractTextFromBufferDetailed(file.buffer, name, options);
    if (detailed.text) {
      text += `\n${detailed.text}`;
    }
    const pages = (detailed.pages || []).map((p) => ({
      ...p,
      textLower: (p.text || "").toLowerCase(),
    }));
    details.push({ name, pages, text: detailed.text || "" });
  }
  return { text, files: fileNames, details };
};

const loadEvidenceDetails = async (fileNames = [], options = {}) => {
  const baseDir = path.join(process.cwd(), "test");
  const files = fileNames.map((name) => ({
    name,
    path: path.join(baseDir, name),
  })).filter((f) => fs.existsSync(f.path));
  let text = "";
  const details = [];
  for (const file of files) {
    if (shouldSkipAuditReport(file.name)) continue;
    const detailed = await extractTextFromFileDetailed(file.path, options);
    if (detailed.text) {
      text += `\n${detailed.text}`;
    }
    const pages = (detailed.pages || []).map((p) => ({
      ...p,
      textLower: (p.text || "").toLowerCase(),
    }));
    details.push({ name: file.name, pages, text: detailed.text || "" });
  }
  return { text, files: files.map((f) => f.name), details };
};

const loadDigiLockerEvidence = async ({
  tenantId,
  supplierOrgId,
  siteId,
  productId,
  maxDocuments = 60,
} = {}) => {
  if (!tenantId || !supplierOrgId) {
    return { text: "", files: [], details: [], scanned: 0 };
  }

  try {
    const response = await DigiLockerService.listDocuments({
      tenantId,
      supplierOrgId,
      filters: {
        ...(siteId ? { siteId } : {}),
        ...(productId ? { productId } : {}),
      },
      pagination: { page: 1, pageSize: maxDocuments },
    });

    const items = Array.isArray(response?.items) ? response.items : [];
    let text = "";
    const files = [];
    const details = [];
    let scanned = 0;

    for (const doc of items) {
      const extractedTextRef = doc?.currentVersion?.extractedTextRef;
      if (!extractedTextRef) continue;
      scanned += 1;
      const extracted = await readExtractedText(extractedTextRef).catch(() => null);
      const extractedText = String(extracted?.text || "").trim();
      if (!extractedText) continue;
      const name = `DigiLocker: ${doc?.title || doc?._id || "document"}`;
      files.push(name);
      text += `\n${extractedText}`;
      const pages = (Array.isArray(extracted?.pages) ? extracted.pages : []).map((page) => ({
        page: page.page || 1,
        text: page.text || "",
        textLower: String(page.text || "").toLowerCase(),
      }));
      details.push({ name, pages, text: extractedText });
      if (text.length > 60000) break;
    }

    return { text, files, details, scanned };
  } catch (error) {
    console.warn("loadDigiLockerEvidence failed", error?.message || error);
    return { text: "", files: [], details: [], scanned: 0 };
  }
};

const selectPreviewQuestions = (questions, limit = 10) => {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const scored = questions.map((q) => {
    const meta = q.autoFillMeta || {};
    const hasAny = Boolean(meta.hasAny);
    const isFull = Boolean(meta.full);
    const sourcesCount = Array.isArray(meta.sources) ? meta.sources.length : 0;
    const score = (isFull ? 2 : hasAny ? 1 : 0) + (sourcesCount ? 0.5 : 0);
    return { question: q, score, hasAny };
  });
  const answerable = scored.filter((q) => q.hasAny || q.score > 0);
  const target = answerable.length ? answerable : scored;
  const ordered = target.sort((a, b) => b.score - a.score);
  const seed = Math.floor(Date.now() / 86400000);
  const offset = ordered.length ? seed % ordered.length : 0;
  const rotated = ordered.slice(offset).concat(ordered.slice(0, offset));
  return rotated.slice(0, Math.max(1, limit)).map((item) => item.question);
};

const buildProfileEvidenceText = (profile) => {
  if (!profile) return "";
  const parts = [
    profile.companyName,
    profile.addressline1,
    profile.addressline2,
    profile.addressline3,
    profile.city,
    profile.state,
    profile.country,
    profile.zipcode,
  ]
    .filter(Boolean)
    .join(" ");
  return parts ? `Supplier profile: ${parts}` : "";
};

const buildAddress = (source = {}) => {
  const parts = [
    source.addressline1,
    source.addressline2,
    source.addressline3,
    source.city,
    source.state,
    source.country,
    source.zipcode,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.join(", ");
};

const buildStrengths = (evidence) => {
  const items = [];
  if (evidence.hasSmf) items.push("Site Master File documentation provided.");
  if (evidence.hasSiteLayout) items.push("Master site layout documentation provided.");
  if (evidence.hasSopIndex) {
    const suffix = evidence.sopTypes?.length ? ` (${evidence.sopTypes.join(", ")})` : "";
    items.push(`SOP index documentation available${suffix}.`);
  }
  if (evidence.hasPfd) items.push("Process flow diagrams available for products in scope.");
  if (evidence.hasRos) items.push("Regulatory/organizational systems documentation provided.");
  return items;
};

const buildGaps = (evidence) => {
  const items = [];
  if (!evidence.hasEthicsPolicy) {
    items.push("No explicit ethics / code of conduct documentation identified in provided evidence.");
  }
  if (!evidence.hasSopIndex) {
    items.push("SOP index evidence not located in provided attachments.");
  }
  if (!evidence.hasSiteLayout) {
    items.push("Site layout evidence not located in provided attachments.");
  }
  return items;
};

const buildObservations = (questions, answersMap, evidenceRefs) => {
  const observations = [];
  questions.forEach((q) => {
    if (observations.length >= 5) return;
    const answer = answersMap.get(String(q._id));
    const completion = computeCompletion(q, answer || {});
    if (answer?.yesNo === "No" || !completion.hasAny) {
      const ref = evidenceRefs.get(String(q._id)) || { sources: [] };
      observations.push({
        no: observations.length + 1,
        severity: answer?.yesNo === "No" ? "Major" : "Minor",
        reference: q.questionCode || q.categoryName || "Questionnaire",
        description: q.question,
        evidence: ref.sources?.[0] || "No supporting evidence located in provided attachments.",
        recommendation: "Provide supporting documentation or clarification.",
      });
    }
  });
  if (!observations.length) {
    observations.push({
      no: 1,
      severity: "Info",
      reference: "Questionnaire",
      description: "No critical observations identified based on provided evidence.",
      evidence: "Evidence aligns with questionnaire responses.",
      recommendation: "Continue maintaining documented controls.",
    });
  }
  return observations;
};

const buildReportPreviewData = ({
  evidence,
  profile,
  questions,
  answersMap,
  summary,
  evidenceRefs,
  files,
  auditorName,
}) => {
  const companyName = evidence.companyName || "Sai Life Sciences Limited";
  const siteName = evidence.siteName || "Unit-IV";
  const address = buildAddress({
    addressline1: profile?.addressline1 || evidence.address,
    city: evidence.city,
    state: evidence.state,
    country: evidence.country,
    zipcode: evidence.zipcode,
  });

  const products = (evidence.products || []).map((name) => ({
    name,
    casNumber: "N/A",
    dosageForm: "API",
    apiTechnology: "Synthetic",
  }));
  const productSummary = evidence.products?.length ? evidence.products.join(", ") : "";

  const strengths = buildStrengths(evidence);
  const gaps = buildGaps(evidence);
  const overview = `This preview report summarizes the self-assessment questionnaire and supporting evidence for ${companyName}. A total of ${summary.answerable} out of ${summary.total} questionnaire items were matched to evidence (full/partial).`;
  const scope = "Document review of supplier-provided questionnaire responses, site master file, SOP indices, process flow diagrams, and supporting evidence documents.";
  const conclusion = gaps.length
    ? "Based on available evidence, the supplier appears broadly aligned with expectations, with several items requiring follow-up evidence."
    : "Based on available evidence, the supplier appears aligned with expectations, with no critical gaps identified.";

  const documentsReviewed = files.map((name) => name);

  return {
    auditee: {
      name: companyName,
      siteName,
      address,
    },
    productSummary,
    auditor: {
      name: auditorName || "Auditor",
    },
    audit: {
      startDate: new Date(),
      type: "Document Review (Preview)",
      scope,
    },
    products,
    documentsReviewed,
    summary: {
      overview,
      scope,
      strengths: strengths.length ? strengths : ["No notable strengths identified from evidence."],
      gaps: gaps.length ? gaps : ["No potential gaps identified from evidence."],
      conclusion,
    },
    sections: {
      summary: overview,
      introduction: "",
      companyInfo: "",
      facility: "",
      tour: "",
      warehouses: "",
      manufacturing: "",
      qcLab: "",
      systems: "",
      conclusion,
    },
    observations: buildObservations(questions, answersMap, evidenceRefs),
    signoff: {
      auditorName: auditorName || "Auditor",
      date: new Date(),
    },
  };
};

const loadStyleExcerpts = async () => {
  const { details } = await loadEvidenceDetails(REPORT_STYLE_FILES, { forceOcr: true });
  const excerpts = details
    .map((file) => {
      const text = (file.text || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      return `Report Style Source: ${file.name}\n${text.slice(0, 5000)}`;
    })
    .filter(Boolean);
  return excerpts.join("\n\n");
};

const parseLlmJson = (raw = "") => {
  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const generateReportNarrative = async (context) => {
  if (!process.env.LLM_SERVICE_URL) return null;
  const styleExcerpt = await loadStyleExcerpts();
  const prompt = `
You are an audit report writer. Use the STYLE EXCERPTS for tone/structure, but DO NOT copy any company-specific data.
Generate concise, professional narrative sections based only on the EVIDENCE CONTEXT.
If evidence is insufficient, return an empty string for that field.

Return JSON with:
{
  "sections": {
    "summary": "",
    "introduction": "",
    "companyInfo": "",
    "facility": "",
    "tour": "",
    "warehouses": "",
    "manufacturing": "",
    "qcLab": "",
    "systems": "",
    "conclusion": ""
  }
}

STYLE EXCERPTS:
${styleExcerpt}

EVIDENCE CONTEXT:
${JSON.stringify(context, null, 2)}
`;

  try {
    const text = await callLlmService({
      prompt,
      model: REPORT_LLM_MODEL || LLM_MODEL,
      maxTokens: 1200,
      temperature: 0.2,
    });
    return parseLlmJson(text || "");
  } catch (err) {
    console.warn("generateReportNarrative failed", err.message);
    return null;
  }
};

const hasValue = (val) => {
  if (Array.isArray(val)) return val.length > 0;
  if (val && typeof val === "object") return Object.keys(val).length > 0;
  return typeof val === "string" ? val.trim().length > 0 : Boolean(val);
};

const computeCompletion = (question, answer) => {
  const details = answer?.responseDetails || {};
  const blocks = question.responseSchema?.layout?.blocks || [];
  const answerableBlocks = Array.isArray(blocks)
    ? blocks.filter((b) => ["yesno", "checkboxes", "text"].includes(b.type))
    : [];
  const filledBlocks = answerableBlocks.filter((b) => hasValue(details[b.key]));

  const baseFilled = hasValue(answer?.yesNo) || hasValue(answer?.freeText);
  const hasAny = baseFilled || filledBlocks.length > 0;
  const full =
    answerableBlocks.length > 0
      ? filledBlocks.length === answerableBlocks.length
      : baseFilled;
  return { hasAny, full };
};

const computeSummary = (questions, answersMap) => {
  let full = 0;
  let partial = 0;
  questions.forEach((q) => {
    const answer = answersMap.get(String(q._id));
    if (!answer) return;
    const { hasAny, full: isFull } = computeCompletion(q, answer);
    if (!hasAny) return;
    if (isFull) full += 1;
    else partial += 1;
  });
  return {
    total: questions.length,
    full,
    partial,
    answerable: full + partial,
  };
};

export const autoFillPreviewTemplate = async (req, res) => {
  try {
    const templateId = 3;
    const maxQuestionsRaw = Number(req.body?.maxQuestions || 10);
    const maxQuestions = Number.isFinite(maxQuestionsRaw)
      ? Math.min(Math.max(maxQuestionsRaw, 1), 10)
      : 10;

    const questions = await TemplateQuestions.find({ templateId }).lean();
    if (!questions.length) {
      return res.status(404).json({ status: false, error: "No questions found for template" });
    }

    const profile = await SupplierProfile.findOne({ user_id: req.user._id }).lean();
    const uploads = Array.isArray(req.files) ? req.files : [];
    const evidencePayload = uploads.length
      ? await loadUploadedEvidence(uploads, { forceOcr: true })
      : await loadLocalEvidence();
    const { text: evidenceText, files, details } = evidencePayload;
    const profileText = buildProfileEvidenceText(profile);
    const combinedEvidence = `${evidenceText}\n${profileText}`.trim();

    const answers = extractAnswersLocally(questions, combinedEvidence, profile, files);
    const answersMap = new Map(answers.map((a) => [String(a.id), a]));
    const evidenceRefs = buildEvidenceReferences(questions, details);
    const enriched = questions.map((q) => {
      const a = answersMap.get(String(q._id));
      const ref = evidenceRefs.get(String(q._id)) || { sources: [], contextText: "" };
      const blocks = q.responseSchema?.layout?.blocks || [];
      const refinedDetails = refineResponseDetails(a?.responseDetails || {}, blocks, ref.contextText || "");
      const answerWithDetails = {
        yesNo: a?.yesNo,
        freeText: a?.freeText,
        responseDetails: refinedDetails,
      };
      const completion = computeCompletion(q, answerWithDetails);
      const sources = ref.sources?.length ? ref.sources : [];
      const note = "";
      return {
        ...q,
        YesNoAnswers: a?.yesNo || "",
        textResponse: a?.freeText || "",
        responseDetails: refinedDetails,
        autoFillMeta: {
          sources,
          note,
          ...completion,
        },
      };
    });
    const summary = computeSummary(
      questions,
      new Map(
        enriched.map((q) => [
          String(q._id),
          {
            yesNo: q.YesNoAnswers,
            freeText: q.textResponse,
            responseDetails: q.responseDetails || {},
          },
        ])
      )
    );
    const previewQuestions = selectPreviewQuestions(enriched, maxQuestions);
    const sampleInfo = {
      totalQuestions: questions.length,
      displayed: previewQuestions.length,
      usingUploads: uploads.length > 0,
    };

    return res.status(200).json({
      status: true,
      data: {
        templateId,
        summary,
        evidenceFiles: files,
        sampleInfo,
        questions: previewQuestions,
      },
    });
  } catch (err) {
    console.error("autoFillPreviewTemplate error", err);
    return res.status(500).json({ status: false, error: err.message });
  }
};

export const reportPreviewTemplate = async (req, res) => {
  try {
    const templateId = 3;

    const questions = await TemplateQuestions.find({ templateId }).lean();
    if (!questions.length) {
      return res.status(404).json({ status: false, error: "No questions found for template" });
    }

    const uploads = Array.isArray(req.files) ? req.files : [];
    const evidencePayload = uploads.length
      ? await loadUploadedEvidence(uploads, { forceOcr: true })
      : await loadEvidenceDetails(REPORT_EVIDENCE_FILES, { forceOcr: true });
    const { text: evidenceText, files, details } = evidencePayload;
    const profile = await SupplierProfile.findOne({ companyName: /sai life/i }).lean();
    const profileText = buildProfileEvidenceText(profile);
    const combinedEvidence = `${evidenceText}\n${profileText}`.trim();

    const answers = extractAnswersLocally(questions, combinedEvidence, profile, files);
    const answersMap = new Map(
      answers.map((a) => [
        String(a.id),
        { yesNo: a.yesNo, freeText: a.freeText, responseDetails: a.responseDetails || {} },
      ])
    );
    const evidenceRefs = buildEvidenceReferences(questions, details);
    const summary = computeSummary(questions, answersMap);

    const evidence = buildEvidenceIndex(combinedEvidence, profile, files);
    const auditorName = req.user?.email || req.user?.name || "Auditor";
    const reportData = buildReportPreviewData({
      evidence,
      profile,
      questions,
      answersMap,
      summary,
      evidenceRefs,
      files,
      auditorName,
    });

    const llmContext = {
      supplier: reportData.auditee,
      products: reportData.products,
      auditOverview: {
        auditType: reportData.audit.type,
        auditScope: reportData.audit.scope,
        auditDate: reportData.audit.startDate,
      },
      documentsReviewed: reportData.documentsReviewed,
      questionnaireSummary: summary,
      evidenceSignals: {
        hasSmf: evidence.hasSmf,
        hasSiteLayout: evidence.hasSiteLayout,
        hasSopIndex: evidence.hasSopIndex,
        sopTypes: evidence.sopTypes,
        hasPfd: evidence.hasPfd,
        hasRos: evidence.hasRos,
        hasEthicsPolicy: evidence.hasEthicsPolicy,
      },
    };
    const narrative = await generateReportNarrative(llmContext);
    if (narrative?.sections) {
      reportData.sections = {
        ...reportData.sections,
        ...narrative.sections,
      };
    }

    const merged = mergeReportTemplate(REPORT_PREVIEW_TEMPLATE, reportData);
    const html = renderReportHtml({ renderedBlocks: merged.renderedBlocks });

    return res.status(200).json({
      status: true,
      data: {
        templateName: REPORT_PREVIEW_TEMPLATE.name,
        generatedAt: new Date(),
        evidenceFiles: files,
        summary,
        html,
        reportData,
      },
    });
  } catch (err) {
    console.error("reportPreviewTemplate error", err);
    return res.status(500).json({ status: false, error: err.message });
  }
};

export const autoFillAuditQuestions = async (req, res) => {
  try {
    const { auditRequestId } = req.params;
    if (!auditRequestId) return res.status(400).json({ status: false, error: "auditRequestId is required" });

    const audit = await AuditRequestMaster.findById(auditRequestId)
      .select("tenantOrgId supplier_id site_id supplier_product_id")
      .lean();
    if (!audit) return res.status(404).json({ status: false, error: "Audit not found" });
    if (audit?.tenantOrgId && req.tenantId && String(audit.tenantOrgId) !== String(req.tenantId)) {
      return res.status(404).json({ status: false, error: "Not Found" });
    }

    const questions = await AuditQuestions.find({ auditRequestId }).lean();
    if (!questions.length) return res.status(404).json({ status: false, error: "No questions found for audit" });

    const docUrls = Array.from(
      new Set(
        questions
          .flatMap((q) => String(q.docUrls || "").split("|").map((s) => s.trim()))
          .filter(Boolean)
      )
    ).filter((url) => {
      const fileName = url.split("/").pop() || "";
      return !shouldSkipAuditReport(fileName);
    });
    let evidenceText = "";
    const evidenceDetails = [];
    for (const url of docUrls) {
      const detailed = await downloadTextFromUrlDetailed(url);
      if (detailed.text) {
        evidenceText += `\n${detailed.text}`;
      }
      evidenceDetails.push({ name: detailed.name, pages: detailed.pages || [], text: detailed.text || "" });
      if (evidenceText.length > 12000) break;
    }

    const digilockerEvidence = await loadDigiLockerEvidence({
      tenantId: req.tenantId || audit?.tenantOrgId || null,
      supplierOrgId: audit?.supplier_id || null,
      siteId: audit?.site_id || null,
      productId: audit?.supplier_product_id || null,
      maxDocuments: 60,
    });
    if (digilockerEvidence.text) {
      evidenceText += `\n${digilockerEvidence.text}`;
      evidenceDetails.push(...digilockerEvidence.details);
    }

    const profile =
      (await SupplierProfile.findOne({ user_id: audit?.supplier_id || req.user?._id }).lean()) ||
      (await SupplierProfile.findOne({ user_id: req.user?._id }).lean()) ||
      null;
    const fileNames = [
      ...docUrls.map((url) => url.split("/").pop() || url),
      ...(digilockerEvidence.files || []),
    ];
    const answers = await extractAnswers(questions, evidenceText, profile, fileNames);
    const updates = [];
    const resultPayload = [];

    const questionMap = new Map(questions.map((q) => [String(q._id), q]));
    const evidenceRefs = buildEvidenceReferences(questions, evidenceDetails);

    answers.forEach((a) => {
      const qid = String(a.id || "");
      const q = questionMap.get(qid);
      if (!q) return;

      const yesNo = normalizeYesNo(a.yesNo || a.answer || "");
      const freeText = (a.freeText || a.answer || "").toString().trim();
      const ref = evidenceRefs.get(String(q._id)) || { sources: [], contextText: "" };
      const blocks = q.responseSchema?.layout?.blocks || [];
      const refinedDetails = refineResponseDetails(a.responseDetails || {}, blocks, ref.contextText || "");
      const choices = Array.isArray(a.selectedOptions || a.choices)
        ? (a.selectedOptions || a.choices).map((c) => String(c))
        : [];

      const answerType = q.answerType || q.responseSchema?.type || "text";
      const optionList =
        q.options ||
        q.responseSchema?.options?.map((o) => (typeof o === "string" ? o : o.value || o.label)) ||
        [];
      const aliases =
        q.answerMapping?.options?.map((o) => ({
          value: o.value,
          aliases: (o.aliases || []).map((a) => a.toLowerCase()),
        })) || [];

      let textResponse = freeText;
      if (answerType === "checkbox" && choices.length) {
        const matched = choices
          .map((c) => {
            const lc = c.toLowerCase();
            const direct = optionList.find((opt) => opt.toLowerCase() === lc);
            if (direct) return direct;
            const aliasHit = aliases.find(
              (o) => o.aliases?.some((a) => lc.includes(a) || a.includes(lc)) || lc.includes(o.value.toLowerCase())
            );
            if (aliasHit) return aliasHit.value;
            const partial = optionList.find((opt) => opt.toLowerCase().includes(lc) || lc.includes(opt.toLowerCase()));
            return partial || null;
          })
          .filter(Boolean);
        if (matched.length) {
          textResponse = matched.join("|");
        }
      }

      const updateFields = {};
      if (yesNo) updateFields.YesNoAnswers = yesNo;
      if (textResponse) updateFields.textResponse = textResponse;

      if (Object.keys(refinedDetails || {}).length) {
        updateFields.responseDetails = refinedDetails;
      }

      const completion = computeCompletion(q, {
        yesNo,
        freeText: textResponse,
        responseDetails: refinedDetails,
      });
      const sources = ref.sources?.length ? ref.sources : [];
      if (sources.length || completion.hasAny) {
        updateFields.autoFillMeta = {
          sources,
          note: "",
          ...completion,
        };
      }

      if (Object.keys(updateFields).length) {
        updates.push({
          updateOne: {
            filter: { _id: q._id },
            update: { $set: updateFields },
          },
        });
        resultPayload.push({ questionId: qid, yesNo, textResponse, responseDetails: refinedDetails, autoFillMeta: updateFields.autoFillMeta });
      }
    });

    if (updates.length) {
      await AuditQuestions.bulkWrite(updates);
    }

    let compliance = null;
    try {
      if (req.tenantId || audit?.tenantOrgId) {
        const complianceRun = await runComplianceFlowForAudit({
          tenantId: req.tenantId || audit.tenantOrgId,
          auditId: auditRequestId,
          actorUserId: req.user?._id,
          standardKey: req.body?.standardKey,
          standardVersion: req.body?.standardVersion,
          includeQuestionResults: false,
          hydrateEvidenceSuggestions: false,
        });
        compliance = {
          runId: complianceRun?.run?._id || null,
          standard: complianceRun?.standard || null,
          summary: complianceRun?.summary || null,
        };
      }
    } catch (error) {
      console.warn("autoFillAuditQuestions compliance run failed", error?.message || error);
    }

    return res.status(200).json({
      status: true,
      data: {
        updated: updates.length,
        total: questions.length,
        answers: resultPayload,
        evidenceSources: {
          questionAttachments: docUrls.length,
          digilockerDocumentsScanned: digilockerEvidence.scanned || 0,
        },
        compliance,
      },
    });
  } catch (err) {
    console.error("autoFillAuditQuestions error", err);
    return res.status(500).json({ status: false, error: err.message });
  }
};
