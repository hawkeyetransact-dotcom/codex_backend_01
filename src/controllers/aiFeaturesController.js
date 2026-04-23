/**
 * AI Features Controller — Wave 1 endpoints.
 *
 * Provides HTTP surface for:
 *   POST /api/ai/capa/draft-rca               — draft RCA for a CAPA
 *   POST /api/ai/deviation/scaffold-five-why  — scaffold 5-why for a deviation
 *   POST /api/ai/decisions/:id/outcome        — record user's disposition of an AI draft
 *
 * All endpoints are authenticated + tenant-scoped. Returns the AI draft
 * plus an auditRecord. The client does NOT save the draft — it's shown
 * in the UI for human review + edit + e-sig. When the user disposes (accept
 * / edit / reject), the client calls /outcome to close the audit loop.
 */
import { draftCapaRca } from "../services/ai/features/capa/capaRcaDrafter.js";
import { scaffoldFiveWhy } from "../services/ai/features/deviation/deviationFiveWhyScaffolder.js";
import { recordAiOutcome } from "../services/ai/audit/aiAuditTrail.js";

function getTenantContext(req, extra = {}) {
  return {
    tenantId: req.user?.tenant_id || req.user?.tenantId,
    userId: req.user?._id,
    userRole: req.user?.role,
    ...extra,
  };
}

function getTenantLlmConfig(_req) {
  // Wave-2 hook: fetch tenant-level LLM preferences from SystemSetting or
  // tenant.aiConfig. For Wave 1 we return undefined, so the platform defaults
  // (LLM_DEFAULT_PROVIDER, LLM_ANTHROPIC_MODEL, etc.) apply.
  return undefined;
}

/**
 * POST /api/ai/capa/draft-rca
 * Body: {
 *   capaId?: string,              // optional — linked CAPA record
 *   deviationId?: string,         // optional — linked deviation
 *   deviationNarrative: string,
 *   questionnaireContext?: Array,
 *   retrievalSet?: Array,          // SOP/prior-CAPA/FDA chunks (caller pre-retrieves)
 *   batchInfo?: string,
 *   productInfo?: string,
 *   auditId?: string,
 * }
 */
export const postCapaDraftRca = async (req, res) => {
  try {
    const body = req.body || {};
    const tenantContext = getTenantContext(req, {
      auditId: body.auditId,
      linkedEntityType: "capa",
      linkedEntityId: body.capaId || body.deviationId || null,
    });
    if (!tenantContext.tenantId) {
      return res.status(400).json({ error: "tenant not resolved from session" });
    }
    if (!body.deviationNarrative) {
      return res.status(400).json({ error: "deviationNarrative is required" });
    }

    const result = await draftCapaRca({
      deviationNarrative: body.deviationNarrative,
      questionnaireContext: body.questionnaireContext,
      retrievalSet: body.retrievalSet,
      batchInfo: body.batchInfo,
      productInfo: body.productInfo,
      tenantContext,
      llmConfig: getTenantLlmConfig(req),
    });

    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        reason: result.reason,
        message: result.fallbackMessage,
        auditRecord: result.auditRecord,
      });
    }

    return res.status(200).json({
      ok: true,
      draft: result.draft,
      meta: result.meta,
    });
  } catch (err) {
    console.error("[aiFeaturesController] capa draft-rca error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/ai/deviation/scaffold-five-why
 * Body: {
 *   deviationId?: string,
 *   deviationTitle?: string,
 *   deviationDescription: string,
 *   detectionSource?: string,
 *   immediateAction?: string,
 *   retrievalSet?: Array,
 *   auditId?: string,
 * }
 */
export const postDeviationScaffoldFiveWhy = async (req, res) => {
  try {
    const body = req.body || {};
    const tenantContext = getTenantContext(req, {
      auditId: body.auditId,
      linkedEntityType: "deviation",
      linkedEntityId: body.deviationId || null,
    });
    if (!tenantContext.tenantId) {
      return res.status(400).json({ error: "tenant not resolved from session" });
    }
    if (!body.deviationDescription) {
      return res.status(400).json({ error: "deviationDescription is required" });
    }

    const result = await scaffoldFiveWhy({
      deviationTitle: body.deviationTitle,
      deviationDescription: body.deviationDescription,
      detectionSource: body.detectionSource,
      immediateAction: body.immediateAction,
      retrievalSet: body.retrievalSet,
      tenantContext,
      llmConfig: getTenantLlmConfig(req),
    });

    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        reason: result.reason,
        message: result.fallbackMessage,
        auditRecord: result.auditRecord,
      });
    }

    return res.status(200).json({
      ok: true,
      scaffold: result.scaffold,
      meta: result.meta,
    });
  } catch (err) {
    console.error("[aiFeaturesController] deviation scaffold-five-why error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/ai/decisions/outcome
 * Records how the user disposed of a prior AI draft — closes the audit loop
 * and feeds the active-learning pipeline (Wave 2).
 *
 * Body: {
 *   feature: "capa.draft_rca" | "deviation.scaffold_five_why",
 *   linkedEntityType, linkedEntityId, auditId?,
 *   outcome: "USER_ACCEPTED" | "USER_EDITED" | "USER_REJECTED" | "SUPERSEDED",
 *   feedback?: string,
 *   originalOutputPreview?: string,
 *   finalOutputPreview?: string,
 * }
 */
export const postAiDecisionOutcome = async (req, res) => {
  try {
    const body = req.body || {};
    const tenantContext = getTenantContext(req, { auditId: body.auditId });
    if (!tenantContext.tenantId) {
      return res.status(400).json({ error: "tenant not resolved from session" });
    }
    if (!body.feature || !body.outcome) {
      return res.status(400).json({ error: "feature and outcome are required" });
    }
    await recordAiOutcome({
      tenantId: tenantContext.tenantId,
      auditId: tenantContext.auditId,
      actorId: tenantContext.userId,
      actorRole: tenantContext.userRole,
      feature: body.feature,
      linkedEntityType: body.linkedEntityType,
      linkedEntityId: body.linkedEntityId,
      outcome: body.outcome,
      feedback: body.feedback,
      originalOutputPreview: body.originalOutputPreview,
      finalOutputPreview: body.finalOutputPreview,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[aiFeaturesController] outcome error:", err);
    return res.status(500).json({ error: err.message });
  }
};
