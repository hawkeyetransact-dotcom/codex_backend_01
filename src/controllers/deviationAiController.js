/**
 * deviationAiController.js
 *
 * Wires the 5 new Deviation AI agents to HTTP endpoints. Pattern matches
 * aiFeaturesController.js (capa.draft_rca etc.).
 */
import { Deviation } from "../models/DeviationModel.js";
import { Capa } from "../models/capaModel.js";
import { classifyDeviationIntake } from "../services/ai/features/deviation/deviationIntakeClassifier.js";
import { findSimilarDeviations } from "../services/ai/features/deviation/deviationSimilarFinder.js";
import { draftDeviationDisposition } from "../services/ai/features/deviation/deviationDispositionDrafter.js";
import { recommendCapaFromDeviation } from "../services/ai/features/deviation/deviationCapaRecommender.js";
import { detectDeviationTrends } from "../services/ai/features/deviation/deviationTrendAlerter.js";

const tc = (req) => ({
  tenantId: String(req.tenantId || req.user?.tenant_id || ""),
  userId: String(req.user?._id || ""),
  userRole: req.user?.role,
});

const llmConfigFor = (req) => ({ tenantConfig: req.tenantLlmConfig || {} });

/** POST /api/ai/deviation/classify-intake  — body { title, description, area, processStep, productName, batchNumbers } */
export const postClassifyIntake = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant required" });
    const { title, description, area, processStep, productName, batchNumbers } = req.body || {};
    if (!description) return res.status(400).json({ error: "description is required" });
    const r = await classifyDeviationIntake({
      title, description, area, processStep, productName, batchNumbers,
      tenantContext: t,
      llmConfig: llmConfigFor(req),
    });
    return res.json(r);
  } catch (err) {
    console.error("postClassifyIntake error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/ai/deviation/:id/find-similar */
export const postFindSimilar = async (req, res) => {
  try {
    const t = tc(req);
    const current = await Deviation.findOne({ _id: req.params.id, tenantId: t.tenantId }).lean();
    if (!current) return res.status(404).json({ error: "Deviation not found" });
    const r = await findSimilarDeviations({
      current,
      lookbackDays: Number(req.query.lookbackDays) || 365,
      max: Number(req.query.max) || 5,
      tenantContext: t,
      llmConfig: llmConfigFor(req),
    });
    return res.json(r);
  } catch (err) {
    console.error("postFindSimilar error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/ai/deviation/:id/draft-disposition  — body { citedStandards? } */
export const postDraftDisposition = async (req, res) => {
  try {
    const t = tc(req);
    const deviation = await Deviation.findOne({ _id: req.params.id, tenantId: t.tenantId }).lean();
    if (!deviation) return res.status(404).json({ error: "Deviation not found" });
    const r = await draftDeviationDisposition({
      deviation,
      citedStandards: Array.isArray(req.body?.citedStandards) ? req.body.citedStandards : undefined,
      tenantContext: t,
      llmConfig: llmConfigFor(req),
    });
    return res.json(r);
  } catch (err) {
    console.error("postDraftDisposition error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/ai/deviation/:id/recommend-capa */
export const postRecommendCapa = async (req, res) => {
  try {
    const t = tc(req);
    const deviation = await Deviation.findOne({ _id: req.params.id, tenantId: t.tenantId }).lean();
    if (!deviation) return res.status(404).json({ error: "Deviation not found" });
    // Pull a few recent same-category CAPAs as similar past CAPAs.
    const similarPastCapas = await Capa.find({
      tenantOrgId: t.tenantId,
      ...(deviation.category ? { "tags.category": deviation.category } : {}),
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("_id title description actions")
      .lean();
    const r = await recommendCapaFromDeviation({
      deviation,
      similarPastCapas,
      tenantContext: t,
      llmConfig: llmConfigFor(req),
    });
    return res.json(r);
  } catch (err) {
    console.error("postRecommendCapa error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/ai/deviation/trends?withNarrative=true */
export const getTrends = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant required" });
    const r = await detectDeviationTrends({
      tenantContext: t,
      withNarrative: String(req.query.withNarrative || "").toLowerCase() === "true",
      llmConfig: llmConfigFor(req),
    });
    return res.json(r);
  } catch (err) {
    console.error("getTrends error:", err);
    return res.status(500).json({ error: err.message });
  }
};
