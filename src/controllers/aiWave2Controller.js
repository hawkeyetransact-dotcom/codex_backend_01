/**
 * AI Wave 2 Controller — HTTP surface for Wave 2 features.
 * Mounted at /api/ai (shares namespace with Wave 1 controller).
 */
import { createPlan, approvePlan, executePlan, getPlan } from "../services/ai/wave2/multiStepAgent.js";
import {
  compileSupplierRiskDossier,
  getLatestDossierForSupplier,
} from "../services/ai/wave2/crossCompanyAudit/supplierRiskDossier.js";
import { draftObservation } from "../services/ai/wave2/crossCompanyAudit/observationDrafter.js";
import { suggestFollowups } from "../services/ai/wave2/crossCompanyAudit/realTimeFollowupSuggester.js";
import {
  ingestFeedbackWindow,
  proposePromptVariant,
} from "../services/ai/wave2/activeLearningLoop.js";
import { listTools } from "../services/ai/wave2/toolCallingRuntime.js";

function tc(req) {
  return {
    tenantId: req.user?.tenant_id || req.user?.tenantId,
    userId: req.user?._id,
    userRole: req.user?.role,
  };
}

// ── Agent ────────────────────────────────────────────────────────────────

export const postCreateAgentPlan = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant not resolved" });
    const { goal, context, budget } = req.body || {};
    if (!goal) return res.status(400).json({ error: "goal is required" });
    const plan = await createPlan({
      goal,
      context,
      budget,
      tenantContext: t,
      roleForToolFilter: t.userRole,
    });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    console.error("[ai.wave2] createPlan error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

export const postApproveAgentPlan = async (req, res) => {
  try {
    const t = tc(req);
    const plan = await approvePlan({
      planId: req.params.planId,
      editedSteps: req.body?.editedSteps,
      actorId: t.userId,
      actorRole: t.userRole,
    });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

export const postExecuteAgentPlan = async (req, res) => {
  try {
    const t = tc(req);
    const plan = await executePlan({
      planId: req.params.planId,
      tenantContext: t,
      approvedByESig: Boolean(req.body?.approvedByESig),
      eSigTicket: req.body?.eSigTicket,
    });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

export const getAgentPlanById = async (req, res) => {
  try {
    const plan = await getPlan(req.params.planId);
    if (!plan) return res.status(404).json({ error: "plan not found" });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getAgentTools = async (req, res) => {
  const t = tc(req);
  const tools = listTools({ role: t.userRole, sideEffect: req.query.sideEffect });
  return res.status(200).json({ ok: true, tools });
};

// ── Supplier risk dossier ────────────────────────────────────────────────

export const postCompileSupplierDossier = async (req, res) => {
  try {
    const t = tc(req);
    const { supplierId, supplierName } = req.body || {};
    if (!supplierId) return res.status(400).json({ error: "supplierId required" });
    const { dossier } = await compileSupplierRiskDossier({
      tenantId: t.tenantId,
      supplierId,
      supplierName,
      tenantContext: t,
    });
    return res.status(200).json({ ok: true, dossier });
  } catch (err) {
    console.error("[ai.wave2] compile dossier error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

export const getSupplierDossier = async (req, res) => {
  try {
    const t = tc(req);
    const dossier = await getLatestDossierForSupplier({ tenantId: t.tenantId, supplierId: req.params.supplierId });
    return res.status(200).json({ ok: true, dossier });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Cross-Company Audit observation + followups ──────────────────────────

export const postDraftObservation = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.auditId) return res.status(400).json({ error: "auditId required" });
    const result = await draftObservation({
      auditId: body.auditId,
      auditContext: body.auditContext,
      interviewExcerpts: body.interviewExcerpts,
      evidenceIds: body.evidenceIds,
      responseIds: body.responseIds,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const postSuggestFollowups = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.auditId) return res.status(400).json({ error: "auditId required" });
    const currentResponse = {
      questionId: body.questionId,
      questionText: body.questionText,
      responseText: body.responseText,
      respondentRole: body.respondentRole,
    };
    const result = await suggestFollowups({
      auditId: body.auditId,
      currentResponse,
      priorQuestionsAnswered: body.priorQuestionsAnswered,
      supplierRiskBand: body.supplierRiskBand,
      supplierDossierExcerpt: body.supplierDossierExcerpt,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Active learning ──────────────────────────────────────────────────────

export const postIngestFeedback = async (req, res) => {
  try {
    const t = tc(req);
    const { since, until } = req.body || {};
    if (!since) return res.status(400).json({ error: "since (ISO date) required" });
    const reports = await ingestFeedbackWindow({ since, until, tenantId: t.tenantId });
    return res.status(200).json({ ok: true, reports });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const postProposePromptVariant = async (req, res) => {
  try {
    const t = tc(req);
    const { report, currentPromptExcerpt } = req.body || {};
    if (!report) return res.status(400).json({ error: "report required" });
    const result = await proposePromptVariant({
      report,
      currentPromptExcerpt,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
