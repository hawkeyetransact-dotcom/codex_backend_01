/**
 * executionScopeController.js
 *
 * G5: Auditor builds the curated execution checklist for an audit.
 * The auditor selects which template questions / categories / subcategories
 * are in-scope for the on-site execution; out-of-scope questions are hidden
 * from the execution UI but kept on the record for audit trail.
 */
import mongoose from "mongoose";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";

/**
 * GET /api/audits/:auditId/execution/scope
 * Returns categories + counts (total / in-scope / out-of-scope) so the
 * builder UI can render a tree.
 */
export const getExecutionScope = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    if (!mongoose.isValidObjectId(auditId)) return res.status(400).json({ error: "Invalid auditId" });
    const audit = await AuditRequestMaster.findById(auditId).select("_id auditor_id supplier_id").lean();
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    const questions = await AuditQuestions.find({ auditRequestId: auditId })
      .select("_id question categoryName isMandatory inExecutionScope formalityTier")
      .lean();

    const byCategory = new Map();
    for (const q of questions) {
      const key = q.categoryName || "Uncategorised";
      if (!byCategory.has(key)) byCategory.set(key, { categoryName: key, total: 0, inScope: 0, mandatory: 0, questions: [] });
      const entry = byCategory.get(key);
      entry.total += 1;
      if (q.inExecutionScope !== false) entry.inScope += 1;
      if (q.isMandatory) entry.mandatory += 1;
      entry.questions.push({
        _id: q._id,
        question: q.question,
        isMandatory: !!q.isMandatory,
        inExecutionScope: q.inExecutionScope !== false,
        formalityTier: q.formalityTier || "BASE",
      });
    }

    const categories = [...byCategory.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return res.json({
      data: {
        auditId,
        totalQuestions: questions.length,
        inScopeCount: questions.filter((q) => q.inExecutionScope !== false).length,
        categories,
      },
    });
  } catch (err) {
    console.error("getExecutionScope error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/audits/:auditId/execution/scope
 * Body: { questionIds: ['<id>', ...], inExecutionScope: true | false }
 *
 * Bulk-update inExecutionScope flag. Auditor only.
 */
export const setExecutionScope = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    const { questionIds = [], inExecutionScope } = req.body || {};
    if (!mongoose.isValidObjectId(auditId)) return res.status(400).json({ error: "Invalid auditId" });
    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ error: "questionIds must be a non-empty array" });
    }
    if (typeof inExecutionScope !== "boolean") {
      return res.status(400).json({ error: "inExecutionScope must be boolean" });
    }

    // Mandatory questions cannot be deselected — they are required by the
    // template's compliance contract. Filter them out before update.
    const candidates = await AuditQuestions.find({
      _id: { $in: questionIds },
      auditRequestId: auditId,
    }).select("_id isMandatory").lean();
    const allowed = candidates
      .filter((q) => inExecutionScope === true || !q.isMandatory)
      .map((q) => q._id);
    if (!allowed.length) {
      return res.status(400).json({ error: "Cannot deselect mandatory questions" });
    }
    const result = await AuditQuestions.updateMany(
      { _id: { $in: allowed }, auditRequestId: auditId },
      { $set: { inExecutionScope } }
    );

    return res.json({
      data: {
        modified: result.modifiedCount || 0,
        skippedMandatory: candidates.length - allowed.length,
      },
    });
  } catch (err) {
    console.error("setExecutionScope error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/audits/:auditId/execution/finalize
 * Locks the curated scope so subsequent edits require an auditor override.
 * Stores a snapshot timestamp on the audit record.
 */
export const finalizeExecutionScope = async (req, res) => {
  try {
    const auditId = req.params.auditId;
    if (!mongoose.isValidObjectId(auditId)) return res.status(400).json({ error: "Invalid auditId" });
    const audit = await AuditRequestMaster.findByIdAndUpdate(
      auditId,
      {
        $set: {
          executionScopeFinalizedAt: new Date(),
          executionScopeFinalizedBy: req.user._id,
        },
      },
      { new: true }
    );
    if (!audit) return res.status(404).json({ error: "Audit not found" });
    return res.json({ data: audit });
  } catch (err) {
    console.error("finalizeExecutionScope error:", err);
    return res.status(500).json({ error: err.message });
  }
};
