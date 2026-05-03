import multer from "multer";
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
import Tenant from "../models/tenantModel.js";
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
import {
  ALLOWED_ASKHAWK_INGEST_MIME_TYPES,
  ingestAskHawkFileToKb,
} from "../services/askHawkDocumentIngestService.js";

const normalizeArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);
const parseTagArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return parseTagArray(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const askHawkIngestUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ASKHAWK_INGEST_MIME_TYPES.has(file.mimetype || "")) {
      return cb(new Error("Only PDF, DOCX, and TXT files are allowed"), false);
    }
    return cb(null, true);
  },
});

export const askHawkIngestUpload = (req, res, next) =>
  askHawkIngestUploadMiddleware.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Invalid upload" });
    }
    return next();
  });

const normalizeRole = (role = "") => String(role || "").trim().toUpperCase();
const tokenize = (text = "") => AskHawkEmbeddingService.tokenize(text);
const PLATFORM_TENANT_ID = "__platform__";
const isPlatformAdminContext = (ctx = {}) =>
  Boolean(ctx?.isPlatformAdmin) || String(ctx?.adminScope || "").toUpperCase() === "PLATFORM";
const isScopedTenantContext = (ctx = {}) =>
  Boolean(ctx?.tenantId) && String(ctx.tenantId) !== PLATFORM_TENANT_ID;
const getTenantScopeForStringModels = (ctx = {}) =>
  isScopedTenantContext(ctx) ? String(ctx.tenantId) : null;
const getTenantObjectIdFilter = (ctx = {}, field = "tenantId") => {
  const scopedTenantId = getTenantScopeForStringModels(ctx);
  if (!scopedTenantId) return {};
  if (!mongoose.isValidObjectId(scopedTenantId)) {
    const err = new Error("Invalid tenant context");
    err.status = 400;
    throw err;
  }
  return { [field]: new mongoose.Types.ObjectId(scopedTenantId) };
};
const listActiveTenantIds = async () => {
  const tenants = await Tenant.find({ status: "ACTIVE" }).select("_id").lean();
  return tenants.map((tenant) => String(tenant?._id || "")).filter(Boolean);
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
  if (isPlatformAdminContext(ctx) && !isScopedTenantContext(ctx)) {
    return audit;
  }
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

const tenantFilter = (ctx) =>
  isScopedTenantContext(ctx) ? { tenantOrgId: String(ctx.tenantId) } : {};

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

const searchDbKb = async ({ tenantId, role, productArea, search, limit = 6, includePlatform = false, minScore = 0.11 }) => {
  if (!tenantId) return [];
  const queryTokens = tokenize(search || "");
  if (!queryTokens.length) return [];
  const normalizedSearch = AskHawkEmbeddingService.normalizeText(search || "");
  const embedded = await AskHawkEmbeddingService.embedText(search || "");
  const queryLexical = AskHawkEmbeddingService.lexicalVector(search || "");
  // Optionally also search the cross-tenant "__platform__" corpus (e.g. the
  // seeded regulatory corpus from regulatory-corpus.json).
  const filter = includePlatform
    ? { tenantId: { $in: [tenantId, "__platform__"] } }
    : { tenantId };
  if (role) {
    const roleVariants = [
      ...new Set([
        String(role),
        normalizeRole(role),
        String(role).toLowerCase(),
        "ALL",
        "all",
      ]),
    ];
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
    .filter((item) => item.score > minScore)
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
        metadata.citationLabel ||
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

export const ingest = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    const tenantId = ctx.tenantId || req.tenantId;
    if (!tenantId) return res.status(400).json({ message: "tenantId required" });
    const file = req.file;
    if (!file?.buffer) return res.status(400).json({ message: "file is required" });

    const role = req.body?.role || ctx.role || "ALL";
    const productArea = req.body?.productArea || undefined;
    const tags = parseTagArray(req.body?.tags);
    const title = req.body?.title || undefined;

    const result = await ingestAskHawkFileToKb({
      tenantId,
      role,
      file,
      productArea,
      tags,
      title,
    });

    return res.json({
      message: "Ingested",
      data: result,
    });
  } catch (error) {
    console.error("askhawk ingest error", error);
    const status = Number(error?.status || 500);
    return res.status(status).json({ message: error.message || "Failed to ingest document" });
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
    const filter = { ...getTenantObjectIdFilter(ctx) };
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
        key: "what is capa",
        ans: "CAPA is Corrective and Preventive Action. It documents root cause, correction, verification, and effectiveness for audit findings.",
      },
      // NOTE: 'ich q7', 'ich q9' etc. are intentionally NOT in this short-circuit list
      // — those are routed to the regulatory mode for full clause text + citation.
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
          WorkflowMilestoneInstance.find(getTenantObjectIdFilter(ctx)).limit(5).lean(),
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
    } else if (mode === "workflow_guide") {
      // Persona-aware step-by-step playbook retrieval. Filters by the user's
      // role first, falls back to "all" so cross-persona playbooks still
      // surface. Lower minScore — these are paraphrased "how do I" questions.
      const roleMatch = String(role || "").toLowerCase();
      const wfHits = await searchDbKb({
        tenantId,
        role: roleMatch || undefined,
        productArea: "workflow_guide",
        search: sanitizedQuestion,
        limit: 4,
        includePlatform: true,
        minScore: 0.05,
      });
      retrievalMeta = {
        mode: "workflow_guide",
        hits: wfHits.length,
        topScore: Number(wfHits[0]?.score || 0),
        productArea: "workflow_guide",
        routeReason: routed.reason || "workflow_guide",
        routeConfidence: Number(routed.confidence || 0),
      };
      if (!wfHits.length) {
        responsePayload = enforceGroundedResponse({
          answer:
            "I don't have a specific playbook for that workflow yet. Try one of the example questions in the rotating prompt, " +
            "or be more specific (e.g. \"as an auditor, how do I draft an observation?\").",
          citations: [],
          followUps: [
            "As a buyer, how do I create an audit?",
            "As a supplier QA, how do I respond to an observation?",
            "As a QA Coordinator, how do I submit a deviation?",
          ],
          confidence: 0.2,
          unsupportedClaims: [],
        });
      } else {
        const top = wfHits[0];
        const meta = top.meta || {};
        const links = (meta.deepLinks || []).map((l) => `→ ${l.label}: ${l.href}`).join("\n");
        const regs = (meta.regulatoryAnchors || []).join(" · ");
        const composedAnswer =
          `**${meta.persona || "Playbook"} — ${meta.title || ""}**\n\n` +
          String(top.content || "").replace(/^[^\n]+\n[^\n]+\n\n/, "") + // strip our seeded title block
          (links ? `\n\n${links}` : "") +
          (regs ? `\n\n_Regulatory: ${regs}_` : "");
        responsePayload = enforceGroundedResponse({
          answer: await sanitizeAnswer(composedAnswer, ctx),
          citations: [meta.citationLabel || top.citation].filter(Boolean),
          actions: (meta.deepLinks || []).map((l) => ({ label: l.label, href: l.href })),
          followUps: wfHits.slice(1, 4).map((h) => `${h.meta?.persona || ""}: ${h.meta?.title || ""}`).filter(Boolean),
          confidence: Math.min(0.97, top.score + 0.25),
          unsupportedClaims: [],
        });
      }
    } else if (mode === "sop") {
      // SOP / template help — search SOP corpus, fall back to regulatory if
      // no SOP match (so "how do I write an SOP for calibration" still gets
      // a useful answer from the underlying 21 CFR 211.68 clause).
      const sopHits = await searchDbKb({
        tenantId,
        role,
        productArea: "sop_templates",
        search: sanitizedQuestion,
        limit: 5,
        includePlatform: true,
        minScore: 0.05,
      });
      retrievalMeta = {
        mode: "sop",
        hits: sopHits.length,
        topScore: Number(sopHits[0]?.score || 0),
        productArea: "sop_templates",
        routeReason: routed.reason || "sop",
        routeConfidence: Number(routed.confidence || 0),
      };
      if (!sopHits.length) {
        responsePayload = enforceGroundedResponse({
          answer:
            "I don't have an SOP template that matches that exactly. The starter library covers: equipment calibration, deviation investigation, " +
            "supplier qualification, change control, training effectiveness, annual product review. Tenant admins can upload more SOPs via " +
            "the AskHawk ingest endpoint.",
          citations: [],
          followUps: [
            "Show me the SOP for deviation investigation",
            "What's in the change control SOP?",
            "Help me draft an SOP for equipment calibration",
          ],
          confidence: 0.2,
          unsupportedClaims: [],
        });
      } else {
        const top = sopHits[0];
        const cluster = sopHits.slice(0, 3);
        const meta = top.meta || {};
        const sectionLines = cluster.map((h) => {
          const m = h.meta || {};
          const body = String(h.content || "").replace(/^[^\n]+\n\n/, "").trim();
          return `**${m.citationLabel || h.citation}** — ${m.sopTitle || ""}\n${body}`;
        });
        const regs = (meta.regulatoryAnchors || []).join(" · ");
        const composedAnswer =
          sectionLines.join("\n\n") +
          (regs ? `\n\n_Regulatory anchors: ${regs}_` : "");
        responsePayload = enforceGroundedResponse({
          answer: await sanitizeAnswer(composedAnswer, ctx),
          citations: cluster.map((h) => h.meta?.citationLabel || h.citation).filter(Boolean),
          actions: [],
          followUps: [
            `Show me the regulatory anchors for ${meta.sopKey || "this SOP"}`,
            `Draft a ${meta.sopTitle || "SOP"} for my tenant`,
          ],
          confidence: Math.min(0.97, top.score + 0.25),
          unsupportedClaims: [],
        });
      }
    } else if (mode === "regulatory") {
      // Regulatory Q&A: search the seeded standards corpus (productArea
      // "compliance", cross-tenant "__platform__" or tenant-uploaded).
      // Returns clause text with proper standard + clause-ref citations.
      // Regulatory queries are paraphrased a lot ("section 13" vs "§13",
      // "summarise" vs the verbatim clause text). Use a lower minScore
      // floor than codebase searches so partial-vocab matches still surface.
      const regHits = await searchDbKb({
        tenantId,
        role,
        productArea: "compliance",
        search: sanitizedQuestion,
        limit: 5,
        includePlatform: true,
        minScore: 0.05,
      });
      retrievalMeta = {
        mode: "regulatory",
        hits: regHits.length,
        topScore: Number(regHits[0]?.score || 0),
        productArea: "compliance",
        routeReason: routed.reason || "regulatory",
        routeConfidence: Number(routed.confidence || 0),
      };
      if (!regHits.length) {
        responsePayload = enforceGroundedResponse({
          answer:
            "I couldn't find a matching clause in the regulatory corpus for that question. " +
            "Try a more specific reference (e.g. '21 CFR 211.192', 'ICH Q7 §13', 'EU GMP Annex 11 §9'), " +
            "or ask the tenant admin to upload more standards via the AskHawk ingest tool.",
          citations: [],
          actions: [],
          followUps: [
            "What does 21 CFR Part 11 require for audit trails?",
            "Summarise ICH Q7 §13 — change control.",
            "What does EU GMP Annex 11 say about electronic signatures?",
          ],
          confidence: 0.2,
          unsupportedClaims: ["No regulatory clause matched the query."],
        });
      } else {
        const top = regHits[0];
        const cluster = regHits.slice(0, 3);
        const answerLines = cluster.map((h) => {
          const meta = h.meta || {};
          const label = meta.citationLabel || h.citation;
          // Strip the "label — title\n\n" prefix from the chunk content for cleaner display.
          const body = String(h.content || "").replace(/^[^\n]+\n\n/, "").trim();
          return `**${label}** — ${meta.clauseTitle || ""}\n${body}`;
        });
        const composedAnswer =
          answerLines.join("\n\n") +
          (top?.meta?.standardKey
            ? `\n\n_Source: ${top.meta.standardKey}${top.meta.version ? ` (${top.meta.version})` : ""}_`
            : "");
        responsePayload = enforceGroundedResponse({
          answer: await sanitizeAnswer(composedAnswer, ctx),
          citations: cluster.map((h) => h.meta?.citationLabel || h.citation).filter(Boolean),
          actions: [],
          followUps: cluster.length > 1
            ? [
                `Compare ${cluster[0].meta?.citationLabel} with ${cluster[1].meta?.citationLabel}`,
                `What does Hawkeye do to satisfy ${cluster[0].meta?.standardKey}?`,
              ]
            : [`What does Hawkeye do to satisfy ${top.meta?.standardKey}?`],
          confidence: Math.min(0.98, top.score + 0.2),
          unsupportedClaims: [],
        });
      }
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

export const telemetry = async (req, res) => {
  try {
    const ctx = req.askContext || {};
    enforceRole(ctx, ["TENANT_ADMIN", "ADMIN", "SUPERADMIN"]);
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const conversationMatch = scopedTenantId ? { tenantId: scopedTenantId } : null;
    const unansweredMatch = scopedTenantId ? { tenantId: scopedTenantId, status: "new" } : { status: "new" };
    const withConversationScope = (pipeline = []) =>
      conversationMatch ? [{ $match: conversationMatch }, ...pipeline] : pipeline;

    const [topIntents, costPerTenant, topArticles, unanswered, qualitySummary] = await Promise.all([
      HawkConversation.aggregate(withConversationScope([
        { $group: { _id: "$intent", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])),
      HawkConversation.aggregate(withConversationScope([
        {
          $group: {
            _id: "$tenantId",
            cost: { $sum: { $ifNull: ["$cost", 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { cost: -1 } },
      ])),
      HawkConversation.aggregate(withConversationScope([
        { $unwind: { path: "$citations", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$citations", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])),
      HawkUnanswered.countDocuments(unansweredMatch),
      HawkConversation.aggregate(withConversationScope([
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
      ])),
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const items = await HawkUnanswered.find(scopedTenantId ? { tenantId: scopedTenantId } : {})
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const { id } = req.body || {};
    const unanswered = await HawkUnanswered.findOne({
      _id: id,
      ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
    });
    if (!unanswered) return res.status(404).json({ message: "Not found" });

    const slug = `gap-${id}`;
    const article = await KbArticle.create({
      tenantId: unanswered.tenantId || scopedTenantId || ctx.tenantId,
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
      tenantId: unanswered.tenantId || scopedTenantId || ctx.tenantId,
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const thresholdRaw = Number(req.body?.threshold);
    const threshold = Number.isFinite(thresholdRaw) ? Math.min(1, Math.max(0, thresholdRaw)) : 0.85;
    const includeChecks = req.body?.includeChecks !== false;
    const suite = await runAskHawkEvalSuite({ includeChecks });
    const status = Number(suite.score || 0) >= threshold ? "PASS" : "FAIL";

    const saved = await AskHawkEvalRun.create({
      tenantId: scopedTenantId || ctx.tenantId || PLATFORM_TENANT_ID,
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 10;
    const rows = await AskHawkEvalRun.find(scopedTenantId ? { tenantId: scopedTenantId } : {})
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const isPlatformScope = isPlatformAdminContext(ctx) && !scopedTenantId;
    const [indexStats, articleCount, chunkCount, activeTenantCount] = await Promise.all([
      getKnowledgeStats(),
      isPlatformScope
        ? KbArticle.countDocuments({ source: LOCAL_KB_SOURCE, tenantId: { $ne: PLATFORM_TENANT_ID } })
        : KbArticle.countDocuments({ tenantId: scopedTenantId || ctx.tenantId, source: LOCAL_KB_SOURCE }),
      isPlatformScope
        ? KbChunk.countDocuments({ tenantId: { $ne: PLATFORM_TENANT_ID } })
        : KbChunk.countDocuments({ tenantId: scopedTenantId || ctx.tenantId }),
      isPlatformScope ? Tenant.countDocuments({ status: "ACTIVE" }) : Promise.resolve(1),
    ]);
    return res.json({
      data: {
        ...indexStats,
        tenantId: scopedTenantId || ctx.tenantId || PLATFORM_TENANT_ID,
        scope: isPlatformScope ? "platform" : "tenant",
        activeTenantCount: Number(activeTenantCount || 0),
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
    const scopedTenantId = getTenantScopeForStringModels(ctx);
    const isPlatformScope = isPlatformAdminContext(ctx) && !scopedTenantId;
    const { roles = [], productArea, maxArticles, maxChunksPerArticle, tenantIds = [] } = req.body || {};
    const normalizedRoles = normalizeArray(roles)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const targetRoles = normalizedRoles.length ? normalizedRoles : ["ALL"];
    let targetTenantIds = scopedTenantId ? [scopedTenantId] : [];
    if (isPlatformScope) {
      const activeTenantIds = await listActiveTenantIds();
      const requestedTenantIds = normalizeArray(tenantIds)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const activeSet = new Set(activeTenantIds);
      targetTenantIds = requestedTenantIds.length
        ? requestedTenantIds.filter((tenantId) => activeSet.has(tenantId))
        : activeTenantIds;
      targetTenantIds = [...new Set([PLATFORM_TENANT_ID, ...targetTenantIds])];
    }
    if (!targetTenantIds.length) {
      return res.status(400).json({ message: "No tenant available for KB sync" });
    }

    const results = [];
    for (const tenantId of targetTenantIds) {
      for (const role of targetRoles) {
        const result = await syncKnowledgeIndexToTenantKb({
          tenantId,
          role,
          productArea,
          maxArticles: Number(maxArticles || 280),
          maxChunksPerArticle: Number(maxChunksPerArticle || 6),
        });
        results.push(result);
      }
    }
    return res.json({
      message: "AskHawk KB synced from local code knowledge",
      source: LOCAL_KB_SOURCE,
      scope: isPlatformScope ? "platform" : "tenant",
      targetTenants: targetTenantIds.length,
      targetRoles,
      data: results,
    });
  } catch (error) {
    console.error("syncCodeKb error", error);
    return res.status(500).json({ message: error.message || "Failed to sync AskHawk KB" });
  }
};
