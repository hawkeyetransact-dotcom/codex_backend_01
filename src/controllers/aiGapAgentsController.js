/**
 * AI Gap-Agents Controller — the 4 features that were flagged as ⚠️/⏭
 * in the EQMS test plan. Now real implementations.
 */
import { classifyChangeImpact } from "../services/ai/wave2/changeControl/regulatoryImpactClassifier.js";
import { brainstormRiskScenarios } from "../services/ai/wave2/risk/riskScenarioBrainstormer.js";
import { populateMrmInputs } from "../services/ai/wave2/mrm/mrmInputPopulator.js";
import { autoAssignOnSopRevision } from "../services/ai/wave2/training/trainingAutoAssignAgent.js";
import { computeRetrievalAdjustments } from "../services/ai/wave2/activeLearningLoop.js";
import { triageComplaint } from "../services/ai/wave3/complaintTriageService.js";

function tc(req) {
  return {
    tenantId: req.user?.tenant_id || req.user?.tenantId,
    userId: req.user?._id,
    userRole: req.user?.role,
  };
}

export const postClassifyChangeImpact = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.description) return res.status(400).json({ error: "description required" });
    const r = await classifyChangeImpact({
      tenantId: t.tenantId,
      changeControlId: body.changeControlId,
      changeType: body.changeType,
      description: body.description,
      riskLevel: body.riskLevel,
      affectedProducts: body.affectedProducts,
      affectedMarkets: body.affectedMarkets,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postBrainstormRiskScenarios = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.processDescription) return res.status(400).json({ error: "processDescription required" });
    const r = await brainstormRiskScenarios({
      tenantId: t.tenantId,
      processName: body.processName,
      processDescription: body.processDescription,
      productClass: body.productClass,
      equipmentInvolved: body.equipmentInvolved,
      relatedFindings: body.relatedFindings,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postPopulateMrm = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    const r = await populateMrmInputs({
      tenantId: t.tenantId,
      reviewType: body.reviewType,
      windowDays: body.windowDays,
      tenantContext: t,
    });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postTrainingAutoAssign = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.sopId) return res.status(400).json({ error: "sopId required" });
    const r = await autoAssignOnSopRevision({
      tenantId: t.tenantId,
      sopId: body.sopId,
      sopNumber: body.sopNumber,
      sopTitle: body.sopTitle,
      sopVersion: body.sopVersion,
      affectedRoles: body.affectedRoles,
      affectedDepartments: body.affectedDepartments,
      gracePeriodDays: body.gracePeriodDays,
      drafterUserId: t.userId,
      generateKnowledgeCheck: body.generateKnowledgeCheck !== false,
      sopDiffSummary: body.sopDiffSummary,
      tenantContext: t,
    });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postComplaintTriage = async (req, res) => {
  try {
    const t = tc(req);
    const body = req.body || {};
    if (!body.description) return res.status(400).json({ error: "description required" });
    const r = await triageComplaint({
      tenantId: t.tenantId,
      complaintId: body.complaintId,
      title: body.title,
      description: body.description,
      complaintType: body.complaintType,
      source: body.source,
      productName: body.productName,
      isMedicalDevice: body.isMedicalDevice,
      retrievalSet: body.retrievalSet,
      tenantContext: t,
    });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postActiveLearningAdjustments = async (req, res) => {
  try {
    const t = tc(req);
    const { since, until } = req.body || {};
    if (!since) return res.status(400).json({ error: "since (ISO date) required" });
    const r = await computeRetrievalAdjustments({ tenantId: t.tenantId, since, until });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
