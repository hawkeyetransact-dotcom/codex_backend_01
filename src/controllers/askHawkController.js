import KbArticle from "../models/kbArticleModel.js";
import KbChunk from "../models/kbChunkModel.js";
import HawkConversation from "../models/hawkConversationModel.js";
import { AuditRequestMaster as AuditRequest } from "../models/auditRequestsMasterModel.js";
import { Capa } from "../models/capaModel.js";
import Evidence from "../models/evidenceModel.js";
import mongoose from "mongoose";
import { sanitizeForLLM } from "../utils/sanitizeForLLM.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import HawkUnanswered from "../models/hawkUnansweredModel.js";

const normalizeArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const featureTerms = new Set([
  "hawkeye",
  "audit",
  "request",
  "questionnaire",
  "milestone",
  "timeline",
  "schedule",
  "supplier",
  "buyer",
  "auditor",
  "capa",
  "evidence",
  "digilocker",
  "api",
  "library",
  "rfq",
  "workspace",
  "notification",
  "followup",
  "report",
  "template",
  "assignment",
]);

const isFeatureQuery = (text) => {
  const tokens = tokenize(text);
  return tokens.some((t) => featureTerms.has(t));
};

const callGemini = async ({ question, mode = "generic" }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  const guardrail = [
    "You are AskHawk, a pharma auditing assistant.",
    "Provide high-level, non-technical guidance within pharma auditing and GMP context.",
    "Do not claim access to internal systems or tenant data.",
    "Do not provide legal or medical advice.",
    "If unsure, say what information is needed next.",
  ].join(" ");
  const modeHint =
    mode === "feature"
      ? "Focus on audit workflow and role-based responsibilities in Hawkeye, without referencing internal data."
      : "Answer as a general pharma auditing guidance question.";
  const prompt = `${guardrail}\n${modeHint}\nQuestion: ${question}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return candidate ? String(candidate).trim() : null;
};

const vectorize = (text) => {
  const counts = {};
  tokenize(text).forEach((t) => {
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
};

const cosine = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  keys.forEach((k) => {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  });
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
};

const scoreChunk = (chunk, queryTokens) => {
  const queryVec = queryTokens.reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const chunkVec = vectorize(chunk.content);
  const keyword = cosine(queryVec, chunkVec);
  return keyword;
};

export const enforceTenant = (docTenant, reqTenant) => {
  if (!docTenant || !reqTenant) return false;
  return String(docTenant) === String(reqTenant);
};

export const checkTenantOrThrow = (docTenant, ctxTenant) => {
  if (!enforceTenant(docTenant, ctxTenant)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const ensureAuditAccess = async (auditRequestId, ctx) => {
  if (!auditRequestId || !mongoose.isValidObjectId(auditRequestId)) return null;
  const audit = await AuditRequest.findById(auditRequestId).lean();
  if (!audit) throw new Error("Audit not found");
  if (!enforceTenant(audit.tenantOrgId, ctx?.tenantId)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  return audit;
};

const cache = new Map();
const cacheGet = (key) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  return null;
};
const cacheSet = (key, value, ttlMs = 60_000) => {
  cache.set(key, { value, expires: Date.now() + ttlMs });
};

export const retrieve = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const { tenantId = ctx.tenantId, role = ctx.role, productArea, search } = req.body || {};
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });
    const queryTokens = tokenize(search || "");
    const filter = { tenantId };
    if (role) filter.role = role;
    if (productArea) filter.productArea = productArea;
    const cacheKey = `retrieve:${tenantId}:${role || ""}:${productArea || ""}:${search || ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ data: cached });
    const chunks = await KbChunk.find(filter).limit(300).lean();
    const scored = chunks
      .map((c) => ({ chunk: c, score: scoreChunk(c, queryTokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const articleIds = scored.map((s) => s.chunk.articleId);
    const articles = await KbArticle.find({ _id: { $in: articleIds } }).lean();
    const articleMap = Object.fromEntries(articles.map((a) => [String(a._id), a]));
    const results = scored.map((s) => {
      const art = articleMap[String(s.chunk.articleId)] || {};
      return {
        content: s.chunk.content,
        chunkOrder: s.chunk.chunkOrder,
        score: s.score,
        article: { title: art.title, slug: art.slug },
      };
    });
    cacheSet(cacheKey, results, 60_000);
    return res.json({ data: results });
  } catch (error) {
    console.error("retrieve error", error);
    return res.status(500).json({ message: error.message || "Retrieve failed" });
  }
};

const logConversation = async ({ tenantId, userId, role, intent, messages, citations, actions, cost = 0, tags }) => {
  try {
    await HawkConversation.create({
      tenantId,
      userId,
      role,
      intent,
      messages,
      citations,
      actions,
      cost,
      tags,
    });
  } catch (err) {
    console.error("logConversation error", err);
  }
};

const tenantFilter = (ctx) => (ctx?.tenantId ? { tenantOrgId: ctx.tenantId } : {});
const enforceRole = (ctx, allowed) => {
  if (!allowed || !allowed.length) return;
  if (!ctx?.role) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  if (!allowed.includes(ctx.role.toUpperCase())) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const sanitizeAnswer = async (text, ctx) => sanitizeForLLM(text || "", { tenantId: ctx?.tenantId, role: ctx?.role });

export const tool_getAuditSummary = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const audits = await AuditRequest.find(tenantFilter(ctx)).sort({ createdAt: -1 }).limit(5).lean();
    return res.json({ data: audits });
  } catch (error) {
    console.error("tool_getAuditSummary error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_listAuditRequests = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const audits = await AuditRequest.find(tenantFilter(ctx)).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ data: audits });
  } catch (error) {
    console.error("tool_listAuditRequests error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_listOpenCapas = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const cap = await Capa.find({ ...tenantFilter(ctx), status: { $ne: "CLOSED" } }).limit(20).lean();
    return res.json({ data: cap });
  } catch (error) {
    console.error("tool_listOpenCapas error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_getQuestionnaireStatus = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const audits = await AuditRequest.find(tenantFilter(ctx)).select("requestName trackStatus tenantOrgId").limit(20).lean();
    return res.json({ data: audits });
  } catch (error) {
    console.error("tool_getQuestionnaireStatus error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_getEvidenceList = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const evid = await Evidence.find(tenantFilter(ctx)).limit(50).lean();
    return res.json({ data: evid });
  } catch (error) {
    console.error("tool_getEvidenceList error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_getQuestionnaireProgress = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const audits = await AuditRequest.find(tenantFilter(ctx)).select("requestName responseComplete trackStatus tenantOrgId").limit(20).lean();
    return res.json({ data: audits });
  } catch (error) {
    console.error("tool_getQuestionnaireProgress error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const tool_getTimelineMilestones = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const { entityId } = req.query;
    const filter = { tenantId: ctx.tenantId ? new mongoose.Types.ObjectId(ctx.tenantId) : undefined };
    if (entityId && mongoose.isValidObjectId(entityId)) {
      await ensureAuditAccess(entityId, ctx);
      filter.workflowEntityId = new mongoose.Types.ObjectId(entityId);
    }
    const milestones = await WorkflowMilestoneInstance.find(filter).limit(50).lean();
    return res.json({ data: milestones });
  } catch (error) {
    console.error("tool_getTimelineMilestones error", error);
    return res.status(500).json({ message: "Failed" });
  }
};

export const chat = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const tenantId = ctx.tenantId || req.body?.tenantId;
    const role = ctx.role || req.body?.role;
    const { intent, question, userId, productArea, tags } = req.body || {};
    const sanitizedQuestion = await sanitizeForLLM(question || "", { tenantId, role });

    const lowerIntent = (intent || "").toLowerCase();
    let mode = "rag";
    if (["status", "progress", "overdue", "metrics"].some((k) => lowerIntent.includes(k))) mode = "tool";
    if (["draft", "summarize"].some((k) => lowerIntent.includes(k))) mode = "draft";
    const featureQuery = isFeatureQuery(sanitizedQuestion);

    const faq = ["what is hawkeye", "how to request audit", "how to generate report"];
    const genericFaqs = [
      {
        key: "what is sop",
        ans: "SOP stands for Standard Operating Procedure. In pharma audits, SOPs define controlled, repeatable steps for GMP compliance.",
      },
      {
        key: "ich q7",
        ans: "ICH Q7 is the GMP guideline for active pharmaceutical ingredients (APIs); auditors map findings to ICH Q7 clauses.",
      },
      {
        key: "what is capa",
        ans: "CAPA is Corrective and Preventive Action. It documents root cause, correction, verification, and effectiveness for audit findings.",
      },
    ];
    const lowerQuestion = sanitizedQuestion.toLowerCase();
    const faqHit = faq.find((f) => lowerQuestion.includes(f));
    const genericHit = genericFaqs.find((f) => lowerQuestion.includes(f.key));

    const messages = [{ role: "user", content: sanitizedQuestion || "" }];
    let answer = "I could not find an answer.";
    let nextCitations = [];
    let actions = [];
    let followUps = [];

    if (genericHit) {
      answer = await sanitizeAnswer(genericHit.ans, ctx);
      nextCitations = ["generic"];
      mode = "faq";
    } else if (faqHit) {
      answer = await sanitizeAnswer(
        "Hawkeye lets you request, execute, and close audits end-to-end (request → questionnaire → evidence → observations → CAPA → report → signatures).",
        ctx
      );
      nextCitations = ["faq"];
      mode = "faq";
    } else if (mode === "tool") {
      const cacheKey = `tool:${tenantId}:${role}:${intent}`;
      const cached = cacheGet(cacheKey);
      let toolData = cached;
      if (!toolData) {
        const [audits, capas, milestones] = await Promise.all([
          AuditRequest.find(tenantFilter(ctx)).sort({ createdAt: -1 }).limit(5).lean(),
          Capa.find({ ...tenantFilter(ctx), status: { $ne: "CLOSED" } }).limit(5).lean(),
          WorkflowMilestoneInstance.find(ctx.tenantId ? { tenantId: new mongoose.Types.ObjectId(ctx.tenantId) } : {}).limit(5).lean(),
        ]);
        toolData = { audits, capas, milestones };
        cacheSet(cacheKey, toolData, 30_000);
      }
      answer = `Status summary: ${toolData.audits?.length || 0} recent audits, ${toolData.capas?.length || 0} open CAPAs, ${toolData.milestones?.length || 0} milestones tracked.`;
      nextCitations = [
        ...(toolData.audits || []).map((a) => `audit:${a._id}`),
        ...(toolData.capas || []).map((c) => `capa:${c._id}`),
      ].slice(0, 6);
      actions = ["listAuditRequests", "listOpenCapas", "getTimelineMilestones"];
      answer = await sanitizeAnswer(answer, ctx);
    } else if (mode === "draft") {
      answer = "Draft created. Please review before sending.";
      followUps = ["Would you like me to add citations?", "Do you want a shorter summary?"];
    } else if (!featureQuery) {
      const geminiAnswer = await callGemini({ question: sanitizedQuestion, mode: "generic" });
      if (geminiAnswer) {
        answer = await sanitizeAnswer(geminiAnswer, ctx);
        mode = "generic";
      } else {
        answer = await sanitizeAnswer("I can help with general pharma audit guidance. Please share more details.", ctx);
      }
    } else {
      const chunkFilter = { tenantId };
      if (role) chunkFilter.role = role;
      const queryTokens = tokenize(sanitizedQuestion);
      const chunks = await KbChunk.find(chunkFilter).limit(300).lean();
      const scored = chunks
        .map((c) => ({ chunk: c, score: scoreChunk(c, queryTokens) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      const picked = scored.map((s) => s.chunk);
      nextCitations = picked.map((c) => `${c.articleId || ""}#${c.chunkOrder}`);
      if (picked.length) {
        answer = `Here are steps based on the knowledge base:\n${picked.map((c) => `- ${c.content}`).join("\n")}`;
        answer = await sanitizeAnswer(answer, ctx);
      } else {
        const geminiAnswer = await callGemini({ question: sanitizedQuestion, mode: "feature" });
        answer = await sanitizeAnswer(
          geminiAnswer || "I could not find a specific knowledge base entry yet. Please describe the workflow you need help with.",
          ctx
        );
        await HawkUnanswered.create({ tenantId, role, question: sanitizedQuestion, confidence: 0.1 });
      }
    }

    await logConversation({
      tenantId,
      userId,
      role,
      intent,
      messages: [...messages, { role: "assistant", content: answer }],
      citations: nextCitations,
      actions,
      tags,
    });

    return res.json({ answer, citations: nextCitations, actions, followUps });
  } catch (error) {
    console.error("chat error", error);
    return res.status(500).json({ message: error.message || "Chat failed" });
  }
};

export const telemetry = async (_req, res) => {
  try {
    const topIntents = await HawkConversation.aggregate([
      { $group: { _id: "$intent", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const costPerTenant = await HawkConversation.aggregate([
      { $group: { _id: "$tenantId", cost: { $sum: { $ifNull: ["$cost", 0] } }, count: { $sum: 1 } } },
      { $sort: { cost: -1 } },
    ]);

    const topArticles = await HawkConversation.aggregate([
      { $unwind: { path: "$citations", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$citations", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const unanswered = await HawkConversation.countDocuments({ "messages.role": "assistant", "messages.content": /could not find|No knowledge base/i });

    return res.json({ topIntents, costPerTenant, topArticles, unanswered });
  } catch (error) {
    console.error("telemetry error", error);
    return res.status(500).json({ message: "Failed to load telemetry" });
  }
};

export const listUnanswered = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const items = await HawkUnanswered.find(ctx.tenantId ? { tenantId: ctx.tenantId } : {}).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ data: items });
  } catch (error) {
    console.error("listUnanswered error", error);
    return res.status(500).json({ message: "Failed to load unanswered" });
  }
};

export const convertUnansweredToKb = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const { id } = req.body || {};
    const unanswered = await HawkUnanswered.findOne({ _id: id, ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}) });
    if (!unanswered) return res.status(404).json({ message: "Not found" });

    const slug = `gap-${id}`;
    const article = await KbArticle.create({
      tenantId: unanswered.tenantId || ctx.tenantId,
      role: unanswered.role || ctx.role,
      productArea: "audit_workflow",
      tags: ["gap", "auto"],
      title: unanswered.question.slice(0, 60),
      slug,
      summary: "Converted from unanswered queue",
      source: "unanswered",
    });
    await KbChunk.create({
      tenantId: unanswered.tenantId || ctx.tenantId,
      role: unanswered.role || ctx.role,
      productArea: "audit_workflow",
      tags: ["gap", "auto"],
      articleId: article._id,
      chunkOrder: 0,
      content: unanswered.question,
      embedding: [],
    });

    unanswered.status = "converted";
    await unanswered.save();
    return res.json({ message: "Converted to KB", articleId: article._id });
  } catch (error) {
    console.error("convertUnansweredToKb error", error);
    return res.status(500).json({ message: "Failed to convert" });
  }
};
