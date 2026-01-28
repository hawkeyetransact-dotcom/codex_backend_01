const GEMINI_MODEL = process.env.GEMINI_TEMPLATE_MODEL || process.env.GEMINI_PREFILL_MODEL || "gemini-1.5-pro-latest";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

const PLACEHOLDER_REGEX = /\[([^\]]+)\]|\{([^}]+)\}|<([^>]+)>/g;

const extractJson = (text = "") => {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

const callGemini = async ({ prompt, maxOutputTokens = 1400, temperature = 0.2 }) => {
  if (!GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? String(text).trim() : null;
};

const mapResponseType = (responseType = "") => {
  const rt = String(responseType || "").toLowerCase();
  if (rt === "yes_no") return { answerType: "radio", options: ["Yes", "No"], mapType: "yesno" };
  if (rt === "yes_no_na") return { answerType: "radio", options: ["Yes", "No", "NA"], mapType: "yesno" };
  if (rt === "single_select") return { answerType: "radio", options: [], mapType: "select" };
  if (rt === "multi_select") return { answerType: "checkbox", options: [], mapType: "checkbox" };
  if (rt === "attachment") return { answerType: "attachment", options: [], mapType: "attachment" };
  return { answerType: "text", options: [], mapType: "text" };
};

export const coerceQuestionsFromGemini = (categories = []) => {
  const questions = [];
  const categoryNames = [];
  const subCategories = [];

  const pushQuestion = (catName, subName, questionObj) => {
    const text = typeof questionObj === "string" ? questionObj : questionObj?.text || questionObj?.question || "";
    if (!text) return;
    const responseType = questionObj?.response_type || questionObj?.responseType || questionObj?.answerType || "";
    const mapped = mapResponseType(responseType);
    const options = Array.isArray(questionObj?.options) && questionObj.options.length ? questionObj.options : mapped.options;
    const responseSchema = {
      type: mapped.answerType,
      options: (options || []).map((o) => ({ value: o, label: o })),
      helperText: "",
      required: false,
      validation: {},
      layout: {},
      subQuestions: [],
    };
    const answerMapping = {
      type: mapped.mapType,
      options: (options || []).map((o) => ({ value: o, aliases: [] })),
      joinChar: "|",
    };
    questions.push({
      question: text,
      categoryName: catName || "Uncategorized",
      subCategoryName: subName || "",
      answerType: mapped.answerType,
      options,
      responseSchema,
      answerMapping,
      extractionHints: {
        keywords: [catName, subName].filter(Boolean),
        sections: [catName, subName].filter(Boolean),
        expectedEntities: [],
        confidencePolicy: "require_evidence",
      },
    });
  };

  (categories || []).forEach((cat) => {
    const catName = cat?.name || cat?.category || cat?.title || "Uncategorized";
    if (!categoryNames.includes(catName)) categoryNames.push(catName);
    const subs = Array.isArray(cat?.subcategories) ? cat.subcategories : [];
    if (subs.length) {
      subs.forEach((sub) => {
        const subName = sub?.name || sub?.title || "General";
        if (subName && !subCategories.includes(subName)) subCategories.push(subName);
        const qs = Array.isArray(sub?.questions) ? sub.questions : [];
        qs.forEach((q) => pushQuestion(catName, subName, q));
      });
      return;
    }
    const qs = Array.isArray(cat?.questions) ? cat.questions : [];
    qs.forEach((q) => pushQuestion(catName, "", q));
  });

  return { questions, categories: categoryNames, subCategories };
};

export const extractQuestionnaireWithGemini = async (rawText = "") => {
  if (!GEMINI_API_KEY || !rawText) return null;
  const text = rawText.length > 12000 ? rawText.slice(0, 12000) : rawText;
  const prompt = [
    "Extract a questionnaire structure from the text below.",
    "Return JSON only. No markdown.",
    "Schema:",
    "{\"categories\":[{\"name\":\"Category\",\"subcategories\":[{\"name\":\"Subcategory\",\"questions\":[{\"text\":\"Question text\",\"response_type\":\"yes_no|yes_no_na|text|single_select|multi_select|attachment\",\"options\":[\"A\",\"B\"]}]}]}]}",
    "Use response_type best guess. Keep question text verbatim.",
    "Text:",
    text,
  ].join("\n\n");

  const raw = await callGemini({ prompt, maxOutputTokens: 1800, temperature: 0.1 });
  const parsed = extractJson(raw || "");
  if (!parsed?.categories || !Array.isArray(parsed.categories)) return null;
  return parsed;
};

export const normalizeTemplateText = async (rawText = "", { templateType } = {}) => {
  if (!GEMINI_API_KEY || !rawText) return null;
  const normalizedType = String(templateType || "").toUpperCase();
  if (!["SCOPE", "AGENDA"].includes(normalizedType)) return null;
  if (PLACEHOLDER_REGEX.test(rawText)) return rawText;
  const text = rawText.length > 12000 ? rawText.slice(0, 12000) : rawText;
  const prompt = [
    "You are normalizing a template for audit Scope/Agenda.",
    "Rewrite the document into a reusable template by replacing specific names, addresses, product names, and dates with placeholders in square brackets.",
    "Keep the original structure, headings, numbering, bullets, and line breaks.",
    "Only output the rewritten template text. No JSON, no markdown.",
    "Use placeholders like [Supplier Company], [Supplier Address], [Product Name], [Audit Date], [Buyer Name], [Site Address].",
    "Document:",
    text,
  ].join("\n\n");

  const raw = await callGemini({ prompt, maxOutputTokens: 1400, temperature: 0.2 });
  if (!raw) return null;
  const cleaned = String(raw).trim();
  return cleaned || null;
};

