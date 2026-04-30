/**
 * observationDrafterController.js
 *
 * AI observation drafter with citation-traceable evidence.
 * Per the PDA Letter pattern: GenAI is restricted to summarisation + drafting
 * with citations from controlled sources; every assertion in the draft
 * carries a clickable trace back to a source paragraph; auditor approval
 * gates use.
 *
 * Calls services/ai/features/audit/observationDrafter.js for the real
 * grounded-LLM draft. If the LLM is unavailable / mis-configured, falls back
 * to the deterministic skeleton (citations[] still intact and auditable).
 */
import mongoose from "mongoose";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { draftObservationLlm } from "../services/ai/features/audit/observationDrafter.js";

const getTenantLlmConfig = (req) => ({
  // Future: per-tenant model + provider override.
  tenantConfig: req.tenantLlmConfig || {},
});

/**
 * POST /api/audits/:auditId/observations/draft
 * Body: {
 *   findingTitle: string,           // short title of the finding
 *   findingDetail?: string,         // optional auditor's free-text
 *   linkedQuestionIds?: string[],   // questions that triggered this finding
 *   suggestedSeverity?: 'CRITICAL' | 'MAJOR' | 'MINOR',
 *   citationContext?: {              // optional: scoped guidance to cite
 *     standards?: string[],          //   e.g. ['ICH Q7', '21 CFR 211.22']
 *   }
 * }
 *
 * Returns:
 *   {
 *     draft: { title, observation, classification, recommendedCAPA },
 *     citations: [{ id, source, sourceType, excerpt, quoteOffset }],
 *     auditTrail: { promptHash, modelInfo, tokenUsage }
 *   }
 *
 * Permission: auditor / admin only.
 */
export const draftObservation = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { findingTitle, findingDetail, linkedQuestionIds = [], suggestedSeverity, citationContext } = req.body || {};
    if (!findingTitle) return res.status(400).json({ error: "findingTitle is required" });
    if (!mongoose.isValidObjectId(auditId)) return res.status(400).json({ error: "Invalid auditId" });

    const audit = await AuditRequestMaster.findById(auditId)
      .select("_id auditor_id supplier_id supplier_product_id formalityTier riskBandAtCreate tenantOrgId")
      .lean();
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    if (String(audit.auditor_id || "") !== String(req.user._id) && req.user.role !== "admin" && req.user.role !== "tenant_admin") {
      return res.status(403).json({ error: "Only the assigned auditor may draft observations" });
    }

    // Pull linked question context (response, evidence, supplier text).
    const questions = linkedQuestionIds.length
      ? await AuditQuestions.find({ _id: { $in: linkedQuestionIds }, auditRequestId: auditId })
          .select("question categoryName YesNoAnswers textResponse responseDetails docUrls auditorAttachments")
          .lean()
      : [];

    // Build the evidence corpus for citations. Each item gets a stable id.
    const citations = [];
    questions.forEach((q, idx) => {
      const id = `Q${idx + 1}`;
      citations.push({
        id,
        source: `Q: ${String(q.question || "").slice(0, 120)}`,
        sourceType: "questionnaire_response",
        excerpt: [
          q.YesNoAnswers ? `Answer: ${q.YesNoAnswers}` : null,
          q.textResponse ? `Note: ${String(q.textResponse).slice(0, 240)}` : null,
        ].filter(Boolean).join(" · "),
        quoteOffset: 0,
        questionId: String(q._id),
        category: q.categoryName,
      });
    });

    // Add cited standards if requested (these are guidance excerpts the AI can cite).
    const standards = (citationContext?.standards || []).filter(Boolean);
    standards.forEach((s, idx) => {
      citations.push({
        id: `S${idx + 1}`,
        source: s,
        sourceType: "regulatory_standard",
        excerpt: `Reference standard: ${s}`,
        quoteOffset: 0,
      });
    });

    // ── Try real LLM first via groundedGenerate (Wave 2) ───────────────────
    const questionnaireContext = questions.map((q, idx) => ({
      id: `Q${idx + 1}`,
      question: String(q.question || "").slice(0, 240),
      answer: q.YesNoAnswers || "",
      note: String(q.textResponse || "").slice(0, 400),
      category: q.categoryName,
    }));
    const standardsContext = standards.map((s, idx) => ({ id: `S${idx + 1}`, standard: s }));

    let llmResult = null;
    try {
      llmResult = await draftObservationLlm({
        findingTitle,
        findingDetail,
        questionnaireContext,
        standards: standardsContext,
        formalityTier: audit.formalityTier || "BASE",
        riskBandAtCreate: audit.riskBandAtCreate || "MEDIUM",
        tenantContext: {
          tenantId: String(audit.tenantOrgId || req.tenantId || ""),
          userId: String(req.user._id),
          userRole: req.user.role,
          auditId: String(audit._id),
          linkedEntityType: "audit_observation",
        },
        llmConfig: getTenantLlmConfig(req),
      });
    } catch (e) {
      console.warn("[observationDrafter] LLM call failed, falling back to skeleton:", e.message);
    }

    if (llmResult?.ok) {
      return res.json({
        draft: llmResult.draft,
        citations,
        auditTrail: {
          promptHash: llmResult.meta?.auditRecord?.promptHash || null,
          modelInfo: llmResult.meta?.llm || null,
          promptVersion: llmResult.meta?.promptVersion,
          tokenUsage: {
            input: llmResult.meta?.llm?.tokensInput,
            output: llmResult.meta?.llm?.tokensOutput,
          },
          source: "llm.groundedGenerate",
        },
      });
    }

    // ── Skeleton fallback ──────────────────────────────────────────────────
    // Used if LLM is unavailable / low-confidence / missing citations. Output is
    // deterministic but the citations[] block is real, the auditor can review.
    const severity = (suggestedSeverity || (audit.formalityTier === "DEEP" ? "MAJOR" : "MINOR")).toUpperCase();
    const citeRefs = citations.map((c) => `[${c.id}]`).join(" ") || "[no-evidence]";
    const draft = {
      title: findingTitle,
      observation: [
        `${findingTitle}.`,
        findingDetail ? `Auditor notes: ${findingDetail}.` : null,
        questions.length
          ? `Evidence reviewed: ${questions.length} questionnaire response${questions.length === 1 ? "" : "s"} ${citeRefs}.`
          : null,
        standards.length ? `Cited standards: ${standards.map((s, i) => `${s} [S${i + 1}]`).join(", ")}.` : null,
      ].filter(Boolean).join(" "),
      classification: severity === "CRITICAL" ? "OAI" : severity === "MAJOR" ? "VAI" : "NAI",
      severity,
      recommendedCAPA: severity === "CRITICAL"
        ? "Immediate corrective action required; root-cause analysis within 5 working days; effectiveness verification mandatory."
        : severity === "MAJOR"
          ? "Corrective + preventive action required within 30 days; CAPA plan signed by supplier QA."
          : "Preventive action documented within 60 days; tracked via supplier scorecard.",
    };

    return res.json({
      draft,
      citations,
      auditTrail: {
        promptHash: null,
        modelInfo: null,
        tokenUsage: null,
        source: "skeleton.fallback",
        notice: llmResult?.fallbackMessage || "LLM unavailable — deterministic draft. Citations[] is real and auditable.",
        llmReason: llmResult?.reason || null,
      },
    });
  } catch (err) {
    console.error("draftObservation error:", err);
    return res.status(500).json({ error: err.message });
  }
};
