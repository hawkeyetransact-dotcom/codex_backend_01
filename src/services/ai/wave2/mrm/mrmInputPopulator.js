/**
 * Management Review Input Populator — Wave 2.
 *
 * Auto-populates inputs for a quarterly Management Review by pulling
 * aggregates from every relevant module (CAPA, Deviation, Audit, Training,
 * Supplier Quality, Asset). Output is a structured inputSections array
 * that the VP can paste into the MRM record.
 *
 * This is a DETERMINISTIC aggregator (no LLM) for the raw numbers, then a
 * grounded-gen call produces the executive narrative on top. Numbers are
 * facts; prose is AI with citations.
 */
import mongoose from "mongoose";
import { groundedGenerate } from "../../grounded/groundedGenerationService.js";

const PROMPT_VERSION = "mrm.input_populator@1.0.0";

function modelByName(name) { try { return mongoose.model(name); } catch { return null; } }

/**
 * Fetch structured aggregates across modules. All fields include both the
 * count and a small sample of the most relevant records so the LLM has
 * grounding for its narrative.
 */
async function gatherAggregates({ tenantId, windowDays = 90 }) {
  const since = new Date(Date.now() - windowDays * 86400000);
  const out = {};

  const Capa = modelByName("Capa") || modelByName("capas");
  if (Capa) {
    const open = await Capa.countDocuments({ tenantId, status: { $ne: "CLOSED" } }).catch(() => 0);
    const overdue = await Capa.countDocuments({ tenantId, status: { $ne: "CLOSED" }, dueDate: { $lt: new Date() } }).catch(() => 0);
    const closedInWindow = await Capa.countDocuments({ tenantId, status: "CLOSED", updatedAt: { $gte: since } }).catch(() => 0);
    const recent = await Capa.find({ tenantId }).sort({ createdAt: -1 }).limit(5).select("capaNumber severity status dueDate").lean().catch(() => []);
    out.capa = { open, overdue, closedInWindow, recent };
  }

  const Deviation = modelByName("deviations") || modelByName("Deviation");
  if (Deviation) {
    const openDev = await Deviation.countDocuments({ tenantId, status: { $ne: "CLOSED" } }).catch(() => 0);
    const inWindow = await Deviation.countDocuments({ tenantId, createdAt: { $gte: since } }).catch(() => 0);
    const recent = await Deviation.find({ tenantId }).sort({ createdAt: -1 }).limit(5).select("deviationNumber title status batchDisposition createdAt").lean().catch(() => []);
    out.deviation = { open: openDev, inWindow, recent };
  }

  const AuditRequest = modelByName("audit-requests-master");
  if (AuditRequest) {
    const tenantFilter = { $or: [{ tenantId }, { tenant_id: tenantId }] };
    const activeAudits = await AuditRequest.countDocuments({ ...tenantFilter, trackStatus: { $not: /closed|complete/i } }).catch(() => 0);
    const closedInWindow = await AuditRequest.countDocuments({ ...tenantFilter, updatedAt: { $gte: since }, trackStatus: /closed|complete/i }).catch(() => 0);
    const recent = await AuditRequest.find(tenantFilter).sort({ createdAt: -1 }).limit(5).select("internalRequestId trackStatus").lean().catch(() => []);
    out.audit = { active: activeAudits, closedInWindow, recent };
  }

  const Training = modelByName("training-records") || modelByName("TrainingRecord");
  if (Training) {
    const total = await Training.countDocuments({ tenantId }).catch(() => 0);
    const completed = await Training.countDocuments({ tenantId, status: "COMPLETED" }).catch(() => 0);
    const overdue = await Training.countDocuments({ tenantId, status: { $ne: "COMPLETED" }, nextRecurrenceDue: { $lt: new Date() } }).catch(() => 0);
    const compliancePct = total ? Math.round((completed / total) * 100) : null;
    out.training = { total, completed, overdue, compliancePct };
  }

  const SupplierRiskDossier = modelByName("supplier-risk-dossiers") || modelByName("SupplierRiskDossier");
  if (SupplierRiskDossier) {
    const highRisk = await SupplierRiskDossier.countDocuments({ tenantId, riskBand: { $in: ["HIGH", "CRITICAL"] } }).catch(() => 0);
    const recent = await SupplierRiskDossier.find({ tenantId }).sort({ dossierDate: -1 }).limit(5).select("supplierName riskBand riskScore dossierDate").lean().catch(() => []);
    out.supplier = { highRisk, recent };
  }

  const Equipment = modelByName("equipment") || modelByName("Equipment");
  if (Equipment) {
    const total = await Equipment.countDocuments({ tenantId }).catch(() => 0);
    const overdueCal = await Equipment.countDocuments({ tenantId, calibrationStatus: "OVERDUE" }).catch(() => 0);
    const dueSoon = await Equipment.countDocuments({ tenantId, calibrationStatus: "DUE_SOON" }).catch(() => 0);
    out.equipment = { total, overdueCal, dueSoon };
  }

  const SignalAlert = modelByName("ai-signal-alerts");
  if (SignalAlert) {
    const openSignals = await SignalAlert.countDocuments({ tenantId, status: "open" }).catch(() => 0);
    out.signals = { open: openSignals };
  }

  return out;
}

export async function populateMrmInputs({
  tenantId,
  reviewType = "quarterly",
  windowDays = 90,
  tenantContext,
  llmConfig,
} = {}) {
  if (!tenantId) throw new Error("populateMrmInputs: tenantId required");

  const agg = await gatherAggregates({ tenantId, windowDays });

  // Build a grounded prompt with the raw numbers as SOURCES.
  const retrievalSet = Object.entries(agg).map(([key, val]) => ({
    docId: `mrm-input:${key}`,
    chunkId: reviewType,
    text: JSON.stringify(val, null, 2).slice(0, 1500),
    score: 1,
  }));

  const userPrompt = [
    `MANAGEMENT REVIEW TYPE: ${reviewType}`,
    `WINDOW: last ${windowDays} days`,
    "",
    "AGGREGATED INPUTS FROM MODULES:",
    JSON.stringify(agg, null, 2).slice(0, 2500),
    "",
    "Produce the MRM input narrative. Keep each section to 2-4 sentences. Cite the SOURCE for any number you restate.",
  ].join("\n");

  const result = await groundedGenerate({
    feature: "mrm.input_populator",
    systemPrompt: `You draft the inputs section of a pharmaceutical Management Review per ISO 9001 clause 9.3 and ICH Q10 §3.2.4. Each input section: title, narrative, trend (improved/stable/worsened/insufficient_data), recommendation.

OUTPUT (strict JSON):
{
  "exec_preread": "3-4 sentence executive summary",
  "input_sections": [
    { "title": "CAPA status", "narrative": "...", "trend": "stable", "recommendation": "...", "citation": "SOURCE_1:capa" },
    { "title": "Deviation trends", ... },
    { "title": "Audit program", ... },
    { "title": "Training compliance", ... },
    { "title": "Supplier risk", ... },
    { "title": "Equipment calibration", ... }
  ],
  "suggested_action_items": [
    { "action": "...", "owner_role": "...", "priority": "high|medium|low", "due_days": 30 }
  ],
  "adequacy_verdict": "ADEQUATE | NEEDS_IMPROVEMENT | INADEQUATE",
  "verdict_rationale": "...",
  "citations": ["SOURCE_N:..."],
  "confidence": 0.0
}`,
    userPrompt,
    retrievalSet,
    outputSchema: {
      requiredFields: ["exec_preread", "input_sections", "suggested_action_items", "adequacy_verdict", "citations", "confidence"],
    },
    minConfidence: 0.4,
    requireCitations: true,
    tenantContext: { ...tenantContext, tenantId, linkedEntityType: "management_review" },
    llmConfig,
    promptVersion: PROMPT_VERSION,
  });

  return {
    ok: result.ok,
    reason: result.reason,
    aggregates: agg,
    narrative: result.ok ? result.output : null,
    meta: { llm: result.llmMeta, promptVersion: PROMPT_VERSION },
  };
}

export const __private = { PROMPT_VERSION, gatherAggregates };
