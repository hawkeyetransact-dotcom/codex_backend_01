import mongoose from "mongoose";
import KbArticle from "../models/kbArticleModel.js";
import KbChunk from "../models/kbChunkModel.js";
import HawkConversation from "../models/hawkConversationModel.js";
import HawkUnanswered from "../models/hawkUnansweredModel.js";
import AskHawkEvalRun from "../models/askHawkEvalRunModel.js";
import { AuditRequestMaster as AuditRequest } from "../models/auditRequestsMasterModel.js";
import { Capa } from "../models/capaModel.js";
import Evidence from "../models/evidenceModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { sanitizeForLLM } from "../utils/sanitizeForLLM.js";
import {
  calculateRetrievalConfidence,
  composeKnowledgeAnswer,
  getKnowledgeStats,
  LOCAL_KB_SOURCE,
  rerankKnowledgeHits,
  searchApplicationKnowledge,
  syncKnowledgeIndexToTenantKb,
  validateAndNormalizeCitations,
} from "../services/askHawkKnowledgeService.js";
import { AskHawkEmbeddingService } from "../services/askHawkEmbeddingService.js";
import { routeAskHawkIntent } from "../services/askHawkIntentRouterService.js";
import { runAskHawkEvalSuite } from "../services/askHawkEvalService.js";

const normalizeArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

const normalizeRole = (role = "") => String(role || "").trim().toUpperCase();
const tokenize = (text = "") => AskHawkEmbeddingService.tokenize(text);

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

const logConversation = async ({
  tenantId,
  userId,
  role,
  intent,
  messages,
  citations,
  actions,
  cost = 0,
  tags,
  metadata,
}) => {
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
      metadata,
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
  if (!allowed.includes(normalizeRole(ctx.role))) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};

const sanitizeAnswer = async (text, ctx) =>
  sanitizeForLLM(text || "", { tenantId: ctx?.tenantId, role: ctx?.role });

const normalizeText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const CREATE_AUDIT_REQUEST_PATTERNS = [
  /\bcreate\b.*\baudit request\b/i,
  /\brequest\b.*\baudit\b/i,
  /\bhow\b.*\baudit request\b/i,
  /\bnew audit\b/i,
];

const matchesCreateAuditRequestQuestion = (question = "") =>
  CREATE_AUDIT_REQUEST_PATTERNS.some((pattern) => pattern.test(String(question || "")));

const createAuditRequestPlaybook = () => ({
  answer: [
    "You can create an audit request only as a Buyer.",
    "1. Login as Buyer.",
    "2. Option 1 (Supplier Marketplace): open supplier details, select product/site, and click Action (plus icon) to create the request.",
    "3. Option 2 (Request New Audit): open Request New Audit and select Supplier, Product, and Site from dropdowns, then submit.",
    "4. If that supplier-product-site already has an in-progress audit, creation is blocked and Hawkeye prompts you to open the existing request.",
  ].join("\n"),
  citations: [
    "backend/src/routes/buyerRoutes.js:79",
    "backend/src/controllers/buyerController.js:887",
    "frontend/components/supplier/details.tsx:206",
    "frontend/components/audits/newRequest.tsx:148",
  ],
  actions: ["listAuditRequests"],
  followUps: ["Tell me your current screen and I can give exact click-by-click steps."],
  confidence: 0.98,
  grounded: true,
  unsupportedClaims: [],
});

const computeDbChunkScore = ({ queryEmbedding, queryLexical, queryNormText, queryTokens, chunk }) => {
  const semanticScore = AskHawkEmbeddingService.cosineSimilarity(
    queryEmbedding || [],
    Array.isArray(chunk.embedding) ? chunk.embedding : []
  );
  const lexicalScore = AskHawkEmbeddingService.lexicalCosine(
    queryLexical || {},
    AskHawkEmbeddingService.lexicalVector(chunk.content || "")
  );
  const normalizedChunkText = AskHawkEmbeddingService.normalizeText(chunk.content || "");
  let phraseBoost = 0;
  if (queryNormText && normalizedChunkText) {
    if (normalizedChunkText.includes(queryNormText)) {
      phraseBoost = 0.2;
    } else {
      const termHits = queryTokens.filter((token) => normalizedChunkText.includes(token)).length;
      phraseBoost = Math.min(0.12, termHits * 0.02);
    }
  }
  const recencyBoost = chunk.updatedAt ? 0.01 : 0;
  const score = semanticScore * 0.65 + lexicalScore * 0.3 + phraseBoost + recencyBoost;
  return Number(score.toFixed(6));
};

const searchDbKb = async ({ tenantId, role, productArea, search, limit = 6 }) => {
  if (!tenantId) return [];
  const queryTokens = tokenize(search || "");
  if (!queryTokens.length) return [];
  const normalizedSearch = AskHawkEmbeddingService.normalizeText(search || "");
  const embedded = await AskHawkEmbeddingService.embedText(search || "");
  const queryLexical = AskHawkEmbeddingService.lexicalVector(search || "");
  const filter = { tenantId };
  if (role) {
    const roleVariants = [...new Set([String(role), normalizeRole(role), String(role).toLowerCase()])];
    filter.role = { $in: roleVariants };
  }
  if (productArea) filter.productArea = productArea;
  const chunks = await KbChunk.find(filter)
    .select("articleId chunkOrder content productArea tags embedding metadata updatedAt")
    .limit(600)
    .lean();
  if (!chunks.length) return [];
  const scored = chunks
    .map((chunk) => ({
      chunk,
      score: computeDbChunkScore({
        queryEmbedding: embedded.vector || [],
        queryLexical,
        queryNormText: normalizedSearch,
        queryTokens,
        chunk,
      }),
    }))
    .filter((item) => item.score > 0.11)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (!scored.length) return [];
  const articleIds = scored.map((item) => item.chunk.articleId);
  const articles = await KbArticle.find({ _id: { $in: articleIds } })
    .select("_id title slug")
    .lean();
  const articleById = new Map(articles.map((article) => [String(article._id), article]));
  return scored.map((item) => {
    const article = articleById.get(String(item.chunk.articleId)) || {};
    const metadata = item.chunk.metadata && typeof item.chunk.metadata === "object" ? item.chunk.metadata : {};
    return {
      source: "tenant_kb",
      score: item.score,
      content: item.chunk.content,
      chunkOrder: item.chunk.chunkOrder || 0,
      article: {
        title: article.title,
        slug: article.slug,
      },
      productArea: item.chunk.productArea,
      tags: item.chunk.tags || [],
      citation:
        metadata.citation ||
        `${article.slug || article._id || "article"}#${item.chunk.chunkOrder || 0}`,
      kind: "kb_chunk",
      repo: "tenant_kb",
      filePath: article.slug || "",
      meta: metadata,
    };
  });
};

const mergeKnowledgeHits = (localHits = [], dbHits = [], limit = 8) => {
  const merged = [...localHits, ...dbHits].sort((a, b) => b.score - a.score);
  const dedup = new Map();
  merged.forEach((item) => {
    const key = `${item.source}:${item.citation}:${item.chunkOrder || 0}`;
    if (!dedup.has(key) && dedup.size < limit * 2) dedup.set(key, item);
  });
  return [...dedup.values()].slice(0, limit);
};

const collectAppKnowledge = async ({ tenantId, role, productArea, question, limit = 8 }) => {
  const [localHits, dbHits] = await Promise.all([
    searchApplicationKnowledge({
      query: question,
      productArea,
      limit,
      minScore: 0.1,
    }),
    searchDbKb({ tenantId, role, productArea, search: question, limit }),
  ]);
  const merged = mergeKnowledgeHits(localHits, dbHits, limit * 2);
  return rerankKnowledgeHits(question, merged, { limit });
};

const enforceGroundedResponse = ({
  answer = "",
  citations = [],
  confidence = 0,
  actions = [],
  followUps = [],
  unsupportedClaims = [],
  minimumConfidence = 0.26,
} = {}) => {
  const citationAudit = validateAndNormalizeCitations(citations, { limit: 8 });
  const normalizedConfidence = Number(Number(confidence || 0).toFixed(4));
  const grounded = citationAudit.valid.length > 0 && normalizedConfidence >= Number(minimumConfidence || 0.26);
  const invalidCitationNote = citationAudit.invalid.length
    ? [`Filtered ${citationAudit.invalid.length} malformed citation(s).`]
    : [];
  if (grounded) {
    return {
      answer,
      citations: citationAudit.valid,
      actions: Array.isArray(actions) ? actions : [],
      followUps: Array.isArray(followUps) ? followUps : [],
      confidence: normalizedConfidence,
      grounded: true,
      unsupportedClaims: invalidCitationNote,
    };
  }
  return {
    answer:
      "I could not verify this confidently from current tenant knowledge. Please include role, exact screen path, and API/action context so I can provide a grounded answer.",
    citations: [],
    actions: Array.isArray(actions) ? actions : [],
    followUps: Array.isArray(followUps) && followUps.length
      ? followUps
      : [
          "Which role are you using?",
          "Which page or menu are you on?",
          "What exact action/button/field are you trying to use?",
        ],
    confidence: normalizedConfidence,
    grounded: false,
    unsupportedClaims: [
      ...invalidCitationNote,
      ...normalizeArray(unsupportedClaims),
      "Insufficient grounded evidence in retrieval context.",
    ],
  };
};

export const retrieve = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const { tenantId = ctx.tenantId, role = ctx.role, productArea, search } = req.body || {};
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    const cacheKey = `retrieve:${tenantId}:${role || ""}:${productArea || ""}:${search || ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      if (Array.isArray(cached)) return res.json({ data: cached });
      return res.json({
        data: cached.hits || [],
        retrieval: {
          confidence: Number(cached.confidence || 0),
          grounded: Boolean(cached.grounded),
        },
      });
    }

    const hits = await collectAppKnowledge({
      tenantId,
      role,
      productArea,
      question: search || "",
      limit: 8,
    });
    const payload = {
      hits,
      confidence: calculateRetrievalConfidence(hits),
      grounded: hits.length > 0,
    };
    cacheSet(cacheKey, payload, 60_000);
    return res.json({ data: hits, retrieval: { confidence: payload.confidence, grounded: payload.grounded } });
  } catch (error) {
    console.error("retrieve error", error);
    return res.status(500).json({ message: error.message || "Retrieve failed" });
  }
};

export const tool_getAuditSummary = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["AUDITOR", "BUYER", "TENANT_ADMIN"]);
    const audits = await AuditRequest.find(tenantFilter(ctx))
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
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
    const audits = await AuditRequest.find(tenantFilter(ctx))
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
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
    const cap = await Capa.find({ ...tenantFilter(ctx), status: { $ne: "CLOSED" } })
      .limit(20)
      .lean();
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
    const audits = await AuditRequest.find(tenantFilter(ctx))
      .select("requestName trackStatus tenantOrgId")
      .limit(20)
      .lean();
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
    const audits = await AuditRequest.find(tenantFilter(ctx))
      .select("requestName responseComplete trackStatus tenantOrgId")
      .limit(20)
      .lean();
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
    const filter = {
      tenantId: ctx.tenantId ? new mongoose.Types.ObjectId(ctx.tenantId) : undefined,
    };
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
    const { intent, question, userId, productArea, tags, screenId } = req.body || {};
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });

    const sanitizedQuestion = await sanitizeForLLM(question || "", { tenantId, role });
    const routed = routeAskHawkIntent({
      intent,
      question: sanitizedQuestion,
      screenId,
      role,
      productArea,
    });
    let mode = routed.mode;

    const faq = [
      "what is hawkeye",
      "how to request audit",
      "how to create audit request",
      "how to generate report",
    ];
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
    const lowerQuestion = normalizeText(sanitizedQuestion);
    const faqHit = faq.find((f) => lowerQuestion.includes(f));
    const genericHit = genericFaqs.find((f) => lowerQuestion.includes(f.key));
    const workflowPlaybook = matchesCreateAuditRequestQuestion(lowerQuestion)
      ? createAuditRequestPlaybook()
      : null;

    const messages = [{ role: "user", content: sanitizedQuestion || "" }];
    let responsePayload = {
      answer: "I could not find a grounded answer.",
      citations: [],
      actions: [],
      followUps: [],
      confidence: 0,
      grounded: false,
      unsupportedClaims: [],
    };
    let retrievalMeta = {
      mode,
      hits: 0,
      topScore: 0,
      productArea: productArea || null,
      routeReason: routed.reason || "unknown",
      routeConfidence: Number(routed.confidence || 0),
    };

    if (workflowPlaybook) {
      responsePayload = {
        answer: await sanitizeAnswer(workflowPlaybook.answer, ctx),
        citations: workflowPlaybook.citations,
        actions: workflowPlaybook.actions,
        followUps: workflowPlaybook.followUps,
        confidence: workflowPlaybook.confidence,
        grounded: workflowPlaybook.grounded,
        unsupportedClaims: workflowPlaybook.unsupportedClaims,
      };
      mode = "faq";
    } else if (genericHit) {
      responsePayload = {
        answer: await sanitizeAnswer(genericHit.ans, ctx),
        citations: ["faq:generic"],
        actions: [],
        followUps: [],
        confidence: 0.96,
        grounded: true,
        unsupportedClaims: [],
      };
      mode = "faq";
    } else if (faqHit) {
      responsePayload = {
        answer: await sanitizeAnswer(
          "Hawkeye lets you request, execute, and close audits end-to-end (request -> questionnaire -> evidence -> observations -> CAPA -> report -> signatures).",
          ctx
        ),
        citations: ["faq:hawkeye-overview"],
        actions: [],
        followUps: [],
        confidence: 0.94,
        grounded: true,
        unsupportedClaims: [],
      };
      mode = "faq";
    } else if (mode === "tool") {
      const cacheKey = `tool:${tenantId}:${role || ""}:${intent || ""}`;
      const cached = cacheGet(cacheKey);
      let toolData = cached;
      if (!toolData) {
        const [audits, capas, milestones] = await Promise.all([
          AuditRequest.find(tenantFilter(ctx)).sort({ createdAt: -1 }).limit(5).lean(),
          Capa.find({ ...tenantFilter(ctx), status: { $ne: "CLOSED" } }).limit(5).lean(),
          WorkflowMilestoneInstance.find(
            ctx.tenantId ? { tenantId: new mongoose.Types.ObjectId(ctx.tenantId) } : {}
          )
            .limit(5)
            .lean(),
        ]);
        toolData = { audits, capas, milestones };
        cacheSet(cacheKey, toolData, 30_000);
      }
      const toolCitations = [
        ...(toolData.audits || []).map((audit) => `audit:${audit._id}`),
        ...(toolData.capas || []).map((capa) => `capa:${capa._id}`),
      ].slice(0, 8);
      responsePayload = {
        answer: await sanitizeAnswer(
          `Status summary: ${toolData.audits?.length || 0} recent audits, ${toolData.capas?.length || 0} open CAPAs, ${
            toolData.milestones?.length || 0
          } milestones tracked.`,
          ctx
        ),
        citations: toolCitations,
        actions: ["listAuditRequests", "listOpenCapas", "getTimelineMilestones"],
        followUps: [],
        confidence: toolCitations.length ? 0.88 : 0.52,
        grounded: toolCitations.length > 0,
        unsupportedClaims: toolCitations.length ? [] : ["Tool summary returned without record citations."],
      };
    } else if (mode === "draft") {
      responsePayload = {
        answer: "Draft created. Please review before sending.",
        citations: ["workflow:draft-mode"],
        actions: [],
        followUps: ["Would you like me to add citations?", "Do you want a shorter summary?"],
        confidence: 0.62,
        grounded: true,
        unsupportedClaims: [],
      };
    } else if (mode === "generic") {
      responsePayload = enforceGroundedResponse({
        answer:
          "I can answer best when the question is tied to Hawkeye workflow context. Share your role, screen path, and the specific action to get an evidence-backed answer.",
        citations: [],
        actions: [],
        followUps: [
          "Which Hawkeye module are you working in?",
          "What exact action are you trying to complete?",
          "Do you want this broken down for buyer, supplier, or auditor role?",
        ],
        confidence: 0.16,
        unsupportedClaims: ["Query did not contain enough workflow context for grounded retrieval."],
      });
      await HawkUnanswered.create({
        tenantId,
        role,
        question: sanitizedQuestion,
        answer: responsePayload.answer,
        confidence: Number(responsePayload.confidence || 0),
        tags: normalizeArray(tags),
      });
    } else {
      const knowledgeHits = await collectAppKnowledge({
        tenantId,
        role,
        productArea,
        question: sanitizedQuestion,
        limit: 8,
      });

      const composed = composeKnowledgeAnswer(sanitizedQuestion, knowledgeHits);
      retrievalMeta = {
        mode: "knowledge",
        hits: knowledgeHits.length,
        topScore: Number(knowledgeHits[0]?.score || 0),
        productArea: productArea || null,
      };
      responsePayload = enforceGroundedResponse({
        answer: await sanitizeAnswer(composed.answer, ctx),
        citations: composed.citations || [],
        actions: composed.actions || [],
        followUps: composed.followUps || [],
        confidence: Number(composed.confidence || calculateRetrievalConfidence(knowledgeHits)),
        unsupportedClaims: composed.unsupportedClaims || [],
      });

      if (!responsePayload.grounded) {
        await HawkUnanswered.create({
          tenantId,
          role,
          question: sanitizedQuestion,
          answer: responsePayload.answer,
          confidence: Number(responsePayload.confidence || 0),
          tags: normalizeArray(tags),
        });
      }
    }

    if (["faq", "tool", "draft"].includes(mode)) {
      responsePayload = enforceGroundedResponse({
        ...responsePayload,
        minimumConfidence: mode === "tool" ? 0.2 : 0.1,
      });
    }

    retrievalMeta.mode = mode;
    retrievalMeta.citations = Number(responsePayload.citations?.length || 0);
    retrievalMeta.grounded = Boolean(responsePayload.grounded);
    retrievalMeta.confidence = Number(responsePayload.confidence || 0);

    await logConversation({
      tenantId,
      userId,
      role,
      intent,
      messages: [...messages, { role: "assistant", content: responsePayload.answer }],
      citations: responsePayload.citations,
      actions: responsePayload.actions,
      tags,
      metadata: {
        confidence: responsePayload.confidence,
        grounded: responsePayload.grounded,
        unsupportedClaims: responsePayload.unsupportedClaims,
        retrieval: retrievalMeta,
      },
    });

    return res.json({
      answer: responsePayload.answer,
      citations: responsePayload.citations,
      actions: responsePayload.actions,
      followUps: responsePayload.followUps,
      confidence: responsePayload.confidence,
      grounded: responsePayload.grounded,
      unsupportedClaims: responsePayload.unsupportedClaims,
      retrieval: retrievalMeta,
    });
  } catch (error) {
    console.error("chat error", error);
    return res.status(500).json({ message: error.message || "Chat failed" });
  }
};

export const telemetry = async (_req, res) => {
  try {
    const [topIntents, costPerTenant, topArticles, unanswered, qualitySummary] = await Promise.all([
      HawkConversation.aggregate([
        { $group: { _id: "$intent", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      HawkConversation.aggregate([
        {
          $group: {
            _id: "$tenantId",
            cost: { $sum: { $ifNull: ["$cost", 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { cost: -1 } },
      ]),
      HawkConversation.aggregate([
        { $unwind: { path: "$citations", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$citations", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      HawkUnanswered.countDocuments({ status: "new" }),
      HawkConversation.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            grounded: {
              $sum: {
                $cond: [{ $eq: ["$metadata.grounded", true] }, 1, 0],
              },
            },
            avgConfidence: { $avg: { $ifNull: ["$metadata.confidence", 0] } },
          },
        },
      ]),
    ]);

    const quality = qualitySummary?.[0] || { total: 0, grounded: 0, avgConfidence: 0 };
    return res.json({
      topIntents,
      costPerTenant,
      topArticles,
      unanswered,
      quality: {
        total: Number(quality.total || 0),
        grounded: Number(quality.grounded || 0),
        groundedRate: Number(
          quality.total ? (Number(quality.grounded || 0) / Number(quality.total || 1)).toFixed(4) : 0
        ),
        avgConfidence: Number(Number(quality.avgConfidence || 0).toFixed(4)),
      },
    });
  } catch (error) {
    console.error("telemetry error", error);
    return res.status(500).json({ message: "Failed to load telemetry" });
  }
};

export const listUnanswered = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const items = await HawkUnanswered.find(
      ctx.tenantId ? { tenantId: ctx.tenantId } : {}
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
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
    const unanswered = await HawkUnanswered.findOne({
      _id: id,
      ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
    });
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
    const embedded = await AskHawkEmbeddingService.embedText(unanswered.question || "");
    await KbChunk.create({
      tenantId: unanswered.tenantId || ctx.tenantId,
      role: unanswered.role || ctx.role,
      productArea: "audit_workflow",
      tags: ["gap", "auto"],
      articleId: article._id,
      chunkOrder: 0,
      content: unanswered.question,
      embedding: embedded.vector || [],
      embeddingNorm: Number(embedded.norm || 0),
      embeddingProvider: embedded.provider || "deterministic_hash",
      embeddingModel: embedded.model || "",
      tokenCount: Number(embedded.tokenCount || 0),
      metadata: {
        source: "unanswered",
        citation: `${slug}#0`,
      },
    });

    unanswered.status = "converted";
    await unanswered.save();
    return res.json({ message: "Converted to KB", articleId: article._id });
  } catch (error) {
    console.error("convertUnansweredToKb error", error);
    return res.status(500).json({ message: "Failed to convert" });
  }
};

export const runQualityEval = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["TENANT_ADMIN", "ADMIN", "SUPERADMIN"]);
    const thresholdRaw = Number(req.body?.threshold);
    const threshold = Number.isFinite(thresholdRaw) ? Math.min(1, Math.max(0, thresholdRaw)) : 0.85;
    const includeChecks = req.body?.includeChecks !== false;
    const suite = await runAskHawkEvalSuite({ includeChecks });
    const status = Number(suite.score || 0) >= threshold ? "PASS" : "FAIL";

    const saved = await AskHawkEvalRun.create({
      tenantId: ctx.tenantId,
      runType: "manual",
      suite: suite.suite,
      version: suite.version,
      score: suite.score,
      passRate: suite.passRate,
      total: suite.total,
      passed: suite.passed,
      failed: suite.failed,
      threshold,
      status,
      checks: suite.checks || [],
      metadata: {
        executedAt: suite.executedAt,
      },
      createdBy: String(req.user?._id || ""),
    });

    return res.json({
      data: {
        ...suite,
        threshold,
        status,
        runId: String(saved?._id || ""),
      },
    });
  } catch (error) {
    console.error("runQualityEval error", error);
    return res.status(500).json({ message: error.message || "Failed to run AskHawk quality eval" });
  }
};

export const listQualityEvals = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["TENANT_ADMIN", "ADMIN", "SUPERADMIN"]);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
    const rows = await AskHawkEvalRun.find(ctx.tenantId ? { tenantId: ctx.tenantId } : {})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return res.json({
      data: rows.map((row) => ({
        id: String(row?._id || ""),
        suite: row?.suite || "",
        version: row?.version || "",
        runType: row?.runType || "",
        score: Number(row?.score || 0),
        passRate: Number(row?.passRate || 0),
        total: Number(row?.total || 0),
        passed: Number(row?.passed || 0),
        failed: Number(row?.failed || 0),
        threshold: Number(row?.threshold || 0.85),
        status: row?.status || "FAIL",
        createdAt: row?.createdAt || null,
        createdBy: row?.createdBy || "",
      })),
    });
  } catch (error) {
    console.error("listQualityEvals error", error);
    return res.status(500).json({ message: error.message || "Failed to load AskHawk quality evals" });
  }
};

export const kbStats = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["TENANT_ADMIN", "ADMIN", "SUPERADMIN"]);
    const [indexStats, articleCount, chunkCount] = await Promise.all([
      getKnowledgeStats(),
      KbArticle.countDocuments({ tenantId: ctx.tenantId, source: LOCAL_KB_SOURCE }),
      KbChunk.countDocuments({ tenantId: ctx.tenantId }),
    ]);
    return res.json({
      data: {
        ...indexStats,
        tenantId: ctx.tenantId,
        tenantArticlesFromCodeSync: articleCount,
        tenantChunksTotal: chunkCount,
      },
    });
  } catch (error) {
    console.error("kbStats error", error);
    return res.status(500).json({ message: error.message || "Failed to load AskHawk KB stats" });
  }
};

export const syncCodeKb = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["TENANT_ADMIN", "ADMIN", "SUPERADMIN"]);
    const { roles = [], productArea, maxArticles, maxChunksPerArticle } = req.body || {};
    const normalizedRoles = normalizeArray(roles)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const targetRoles = normalizedRoles.length ? normalizedRoles : [ctx.role || "AUDITOR"];
    const results = [];
    for (const role of targetRoles) {
      const result = await syncKnowledgeIndexToTenantKb({
        tenantId: ctx.tenantId,
        role,
        productArea,
        maxArticles: Number(maxArticles || 280),
        maxChunksPerArticle: Number(maxChunksPerArticle || 6),
      });
      results.push(result);
    }
    return res.json({
      message: "AskHawk KB synced from local code knowledge",
      source: LOCAL_KB_SOURCE,
      data: results,
    });
  } catch (error) {
    console.error("syncCodeKb error", error);
    return res.status(500).json({ message: error.message || "Failed to sync AskHawk KB" });
  }
};
