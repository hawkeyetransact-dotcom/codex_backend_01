import fetch from "node-fetch";
import OpenAI from "openai";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { extractOcrTextFromPdf } from "../helpers/aiHelper.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || "",
});

const downloadTextFromUrl = async (url = "") => {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("pdf")) {
      return await extractOcrTextFromPdf(buf);
    }
    if (contentType.startsWith("image/")) {
      return await extractOcrTextFromPdf(buf);
    }
    return buf.toString("utf-8");
  } catch (err) {
    console.warn("downloadTextFromUrl failed", url, err.message);
    return "";
  }
};

const normalizeYesNo = (val = "") => {
  const raw = val.trim().toLowerCase();
  if (["yes", "y", "true"].includes(raw)) return "Yes";
  if (["no", "n", "false"].includes(raw)) return "No";
  if (["na", "n/a"].includes(raw)) return "NA";
  return "";
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

const extractAnswers = async (questions, evidenceText) => {
  if (!questions.length || !evidenceText.trim()) return [];
  const prompt = buildPrompt(questions) + `\nEvidence:\n${evidenceText.slice(0, 12000)}`;
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.2,
    });
    let text = resp.choices?.[0]?.message?.content || "[]";
    text = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("extractAnswers failed", err.message);
    return [];
  }
};

export const autoFillAuditQuestions = async (req, res) => {
  try {
    const { auditRequestId } = req.params;
    if (!auditRequestId) return res.status(400).json({ status: false, error: "auditRequestId is required" });

    const questions = await AuditQuestions.find({ auditRequestId }).lean();
    if (!questions.length) return res.status(404).json({ status: false, error: "No questions found for audit" });

    const docUrls = Array.from(new Set(questions.map((q) => q.docUrls).filter(Boolean)));
    let evidenceText = "";
    for (const url of docUrls) {
      const text = await downloadTextFromUrl(url);
      evidenceText += `\n${text}`;
      if (evidenceText.length > 12000) break;
    }

    const answers = await extractAnswers(questions, evidenceText);
    const updates = [];
    const resultPayload = [];

    const questionMap = new Map(questions.map((q) => [String(q._id), q]));

    answers.forEach((a) => {
      const qid = String(a.id || "");
      const q = questionMap.get(qid);
      if (!q) return;

      const yesNo = normalizeYesNo(a.yesNo || a.answer || "");
      const freeText = (a.freeText || a.answer || "").toString().trim();
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

      if (Object.keys(updateFields).length) {
        updates.push({
          updateOne: {
            filter: { _id: q._id },
            update: { $set: updateFields },
          },
        });
        resultPayload.push({ questionId: qid, yesNo, textResponse });
      }
    });

    if (updates.length) {
      await AuditQuestions.bulkWrite(updates);
    }

    return res.status(200).json({ status: true, data: { updated: updates.length, total: questions.length, answers: resultPayload } });
  } catch (err) {
    console.error("autoFillAuditQuestions error", err);
    return res.status(500).json({ status: false, error: err.message });
  }
};
