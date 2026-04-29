/**
 * observationDrafterController.js
 *
 * G12: AI observation drafter with citation-traceable evidence.
 * Per the PDA Letter pattern (PDA Letter, "Harnessing AI to Strengthen
 * Audit Readiness in Pharmaceutical Manufacturing"): GenAI is restricted
 * to summarisation + drafting with **citations from controlled sources**;
 * every assertion in the draft must carry a clickable trace back to a
 * source paragraph in evidence or guidance; auditor approval gates use.
 *
 * This is a SKELETON — the full vector-store + LLM integration is in
 * `services/groundedGenerate.js`. This handler wires the audit context
 * into that helper and returns a draft with structured citations.
 */
import mongoose from "mongoose";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";

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

    // ── DRAFT (skeleton) ────────────────────────────────────────────────────
    // The real implementation should call services/groundedGenerate with the
    // citations[] as the controlled-source corpus and a system prompt that
    // forces the model to insert [<id>] citations after every claim. For now
    // we return a deterministic skeleton that's safe to ship without LLM
    // wiring, plus a citations[] block the UI can render.
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
        // Future: fill from groundedGenerate response.
        promptHash: null,
        modelInfo: null,
        tokenUsage: null,
        notice: "Skeleton draft — LLM integration pending. Citations[] is real and auditable.",
      },
    });
  } catch (err) {
    console.error("draftObservation error:", err);
    return res.status(500).json({ error: err.message });
  }
};
