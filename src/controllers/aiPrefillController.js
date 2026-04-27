import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { TemplateQuestions } from "../models/templateQuestionsModel.js";
import { callLlmService, LLM_MODEL } from "../services/llmServiceClient.js";

const CONFIDENCE_THRESHOLD = 0.8;

const normalize = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const normalizeText = (value) => normalize(value).toLowerCase();
const resolveTodayDateInput = () => new Date().toISOString().slice(0, 10);
const buildArtifactTenantFilter = (tenantId) => {
  if (tenantId === null || tenantId === undefined || tenantId === "") {
    return {};
  }
  return { tenantId: { $in: [tenantId, null] } };
};

const resolveLatestAuditDate = (audit) => {
  const candidates = [];
  const proposedDates = Array.isArray(audit?.supplierProposedDates) ? audit.supplierProposedDates : [];
  proposedDates.forEach((value) => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) candidates.push(parsed);
  });
  [audit?.auditETA, audit?.complianceDate].forEach((value) => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) candidates.push(parsed);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[candidates.length - 1];
};

const buildContext = (audit) => {
  const buyer = audit?.create_by_buyer_id || {};
  const supplier = audit?.supplier_id || {};
  const auditor = audit?.auditor_id || {};
  const site = audit?.site_id || {};
  const product = audit?.supplier_product_id || {};
  const buyerProfile = buyer?.profile || {};
  const supplierProfile = supplier?.profile || {};
  const auditorProfile = auditor?.profile || {};
  const requestId =
    audit?.hawkeyeRequestId ||
    audit?.internalRequestId ||
    audit?.supplierRequestId ||
    audit?._id?.toString() ||
    "";

  return {
    requestId,
    auditETA: resolveLatestAuditDate(audit),
    buyer: {
      name: normalize(buyerProfile?.companyName || `${buyerProfile?.firstName || ""} ${buyerProfile?.lastName || ""}`.trim() || buyer?.email),
      email: buyer?.email || "",
      phone: buyerProfile?.phone ? String(buyerProfile.phone) : "",
      address: normalize(
        [
          buyerProfile?.addressline1,
          buyerProfile?.addressline2,
          buyerProfile?.addressline3,
          buyerProfile?.city,
          buyerProfile?.state,
          buyerProfile?.country,
          buyerProfile?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    supplier: {
      name: normalize(supplierProfile?.companyName || `${supplierProfile?.firstName || ""} ${supplierProfile?.lastName || ""}`.trim() || supplier?.email),
      email: supplier?.email || "",
      phone: supplierProfile?.phone ? String(supplierProfile.phone) : "",
      address: normalize(
        [
          supplierProfile?.addressline1,
          supplierProfile?.addressline2,
          supplierProfile?.addressline3,
          supplierProfile?.city,
          supplierProfile?.state,
          supplierProfile?.country,
          supplierProfile?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    auditor: {
      name: normalize(`${auditorProfile?.firstName || ""} ${auditorProfile?.lastName || ""}`.trim() || auditor?.email || ""),
      email: auditor?.email || "",
    },
    site: {
      name: normalize(site?.site_name || site?.plant_id || ""),
      address: normalize(
        [
          site?.address_line1,
          site?.address_line2,
          site?.address_line3,
          site?.city,
          site?.state,
          site?.country,
          site?.zipcode,
        ]
          .filter(Boolean)
          .join(", ")
      ),
    },
    product: {
      name: normalize(product?.name || product?.description || ""),
      dosage: normalize(product?.dosageForm || ""),
      casNumber: normalize(product?.casNumber || ""),
      apiTechnology: normalize(product?.apiTechnology || ""),
    },
  };
};

const resolveDeterministicPrefill = ({ label, context }) => {
  const text = normalizeText(label);
  if (!text) return "";

  const mentionsBuyer = /\b(buyer|from|issuer|sender|our)\b/.test(text);
  const mentionsSupplier = /\b(supplier|vendor|recipient|auditee|their)\b/.test(text);
  const looksLikeName = /\b(name|contact person|name of contact|printed name|company)\b/.test(text);
  const looksLikeEmail = /\b(email|e mail)\b/.test(text);
  const looksLikeAddress = /\b(address|location|facility)\b/.test(text);
  const looksLikePhone = /\b(phone|mobile|tel|telephone)\b/.test(text);
  const looksLikeDate = /\b(date|signed on|signed date|signature date)\b/.test(text);

  if (/\b(audit id|request id|reference|vendor code)\b/.test(text)) {
    return context?.requestId || "";
  }

  if (looksLikeDate && /\b(sign|signature|signed)\b/.test(text)) {
    return resolveTodayDateInput();
  }

  if (/\blead auditor\b/.test(text)) {
    return context?.auditor?.name || "TBD";
  }

  if (/\b(co auditor|co-auditor|technical expert)\b/.test(text)) {
    return context?.auditor?.name || "TBD";
  }

  if (looksLikeName) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.name || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.name || "";
    if (/^to\b/.test(text) || /\bdear\b/.test(text)) return context?.supplier?.name || "";
    if (/^from\b/.test(text)) return context?.buyer?.name || "";
    if (/\bauditor\b/.test(text)) return context?.auditor?.name || "TBD";
  }

  if (looksLikeEmail) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.email || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.email || "";
    if (/\bauditor\b/.test(text)) return context?.auditor?.email || "";
  }

  if (looksLikeAddress) {
    if (/\b(site|plant|facility)\b/.test(text)) return context?.site?.address || context?.supplier?.address || "";
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.address || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.address || "";
    if (/^to\b/.test(text)) return context?.supplier?.address || "";
  }

  if (looksLikePhone) {
    if (mentionsBuyer && !mentionsSupplier) return context?.buyer?.phone || "";
    if (mentionsSupplier && !mentionsBuyer) return context?.supplier?.phone || "";
  }

  if (/\b(product|material)\b/.test(text)) return context?.product?.name || "";
  if (/\bdosage\b/.test(text)) return context?.product?.dosage || "";
  if (/\bcas\b/.test(text)) return context?.product?.casNumber || "";
  if (/\b(api|technology)\b/.test(text)) return context?.product?.apiTechnology || "";
  if (/\b(site|plant)\b/.test(text)) return context?.site?.name || "";

  return "";
};

const buildPrompt = ({ context, fields }) => {
  const instructions = [
    "You are a pharma audit assistant. Use the provided audit context to prefill document template fields.",
    "Return JSON only. Do not include markdown.",
    "Only include fields you are confident about (confidence >= 0.8).",
    "If unsure, omit the field.",
    "Schema: {\"fields\":[{\"questionId\":\"string\",\"value\":\"string\",\"confidence\":0-1}]}",
  ].join("\n");

  return [
    instructions,
    "Audit Context:",
    JSON.stringify(context, null, 2),
    "Template Fields:",
    JSON.stringify(
      fields.map((f) => ({
        questionId: f._id,
        label: f.question,
      })),
      null,
      2
    ),
  ].join("\n\n");
};

const extractJson = (text) => {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    return null;
  }
};

const callLLM = async ({ prompt }) => {
  if (!prompt) return null;
  return callLlmService({ prompt, model: LLM_MODEL, maxTokens: 800, temperature: 0.1 });
};

// Governance hooks — same primitives groundedGenerate uses, applied here
// because aiPrefillController predates the grounded runtime and uses callLlmService directly.
import { authorizeAgentCall } from "../services/ai/governance/agentPermissionService.js";
import { recordUsage, recordBlocked } from "../services/ai/governance/agentUsageService.js";

export const prefillArtifact = async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?._id;
  const userRole = req.user?.role;
  const AGENT_KEY = "audit.preaudit.prefill";

  try {
    const { auditId, artifactId } = req.body || {};
    if (!auditId || !artifactId) {
      return res.status(400).json({ error: "auditId and artifactId are required" });
    }

    const audit = await AuditRequestMaster.findById(auditId)
      .populate("create_by_buyer_id")
      .populate("supplier_id")
      .populate("auditor_id")
      .populate("supplier_product_id")
      .populate("site_id");
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const tenantId = audit.tenantOrgId || req.tenantId || null;

    // ── Permission + quota gate ──
    if (tenantId) {
      try {
        const auth = await authorizeAgentCall({ tenantId, userId, userRole, agentKey: AGENT_KEY });
        if (!auth.allowed) {
          await recordBlocked({ tenantId, userId, userRole, agentKey: AGENT_KEY, blockedBy: auth.blockedBy, detail: auth.detail });
          return res.status(auth.blockedBy === "permission" ? 403 : 429).json({
            success: false,
            reason: auth.blockedBy === "permission" ? "blocked_by_permission" : "blocked_by_quota",
            message: auth.blockedBy === "permission"
              ? "Your role is not permitted to invoke this AI agent."
              : "AI agent quota exhausted for this period.",
            governance: auth.detail,
          });
        }
      } catch (gErr) { console.warn("[aiPrefill] permission check failed:", gErr?.message); }
    }
    const artifact = await AuditArtifact.findOne({
      ...buildArtifactTenantFilter(tenantId),
      auditId: audit._id,
      _id: artifactId,
    }).lean();
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    if (!artifact.templateId) {
      return res.json({ success: true, data: { fields: [], message: "No template linked" } });
    }

    const questions = await TemplateQuestions.find({ templateId: artifact.templateId })
      .select("_id question")
      .lean();
    if (!questions.length) {
      return res.json({ success: true, data: { fields: [], message: "No template fields found" } });
    }

    const context = buildContext(audit);
    const prompt = buildPrompt({ context, fields: questions });
    let raw = null;
    try {
      raw = await callLLM({ prompt });
    } catch (err) {
      console.warn("LLM prefill failed:", err?.message || err);
    }
    const parsed = extractJson(raw);

    const fields = Array.isArray(parsed?.fields) ? parsed.fields : [];
    const llmFields = fields
      .filter((f) => f?.questionId && typeof f?.value === "string")
      .map((f) => ({
        questionId: String(f.questionId),
        value: String(f.value),
        confidence: Number(f.confidence || 0),
      }))
      .filter((f) => Number.isFinite(f.confidence) && f.confidence >= CONFIDENCE_THRESHOLD);

    const deterministicFields = questions
      .map((question) => {
        const value = resolveDeterministicPrefill({
          label: question?.question,
          context,
        });
        if (!value) return null;
        return {
          questionId: String(question._id),
          value: String(value),
          confidence: 0.99,
        };
      })
      .filter(Boolean);

    const mergedByQuestionId = new Map(
      deterministicFields.map((field) => [field.questionId, field])
    );
    llmFields.forEach((field) => {
      mergedByQuestionId.set(field.questionId, field);
    });
    const filtered = Array.from(mergedByQuestionId.values());

    // ── Write usage event (fire-and-forget) ──
    if (tenantId) {
      const ok = !!raw;
      recordUsage({
        tenantId, userId, userRole,
        agentKey: AGENT_KEY, agentVersion: "audit.preaudit@legacy-1.0.0",
        provider: "legacy", model: LLM_MODEL,
        inputTokens: 0, outputTokens: 0,        // legacy callLlmService does not return token counts
        durationMs: Date.now() - startedAt,
        outcome: ok ? "success" : "llm_error",
        confidence: filtered[0]?.confidence ?? null,
        groundedCitations: 0,
        linkedEntityType: "audit-requests-master",
        linkedEntityId: audit._id,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      data: { fields: filtered, model: LLM_MODEL, message: raw ? undefined : "LLM prefill unavailable" },
    });
  } catch (error) {
    console.error("prefillArtifact error", error);
    return res.json({ success: true, data: { fields: [], message: "LLM prefill unavailable" } });
  }
};
