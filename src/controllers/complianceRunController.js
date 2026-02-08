import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import {
  ADMIN_ROLES,
  AUDITOR_ROLES,
  BUYER_ROLES,
  COMPLIANCE_VERDICTS,
  SUPPLIER_ROLES,
} from "../modules/compliance/constants.js";
import { canAuditorAccessAudit } from "../utils/auditorAccess.js";
import { ComplianceEvaluationService } from "../services/compliance/complianceEvaluationService.js";

const normalizeRole = (value) => {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "";
  const compact = raw.replace(/[\s_-]/g, "");
  if (compact === "supplieradmin") return "supplier";
  if (compact === "supplieruser") return "supplieruser";
  if (compact === "tenantadmin") return "tenant_admin";
  if (compact === "superadmin") return "superadmin";
  return raw;
};

const assertTenant = (entityTenantId, req) => {
  if (entityTenantId && req.tenantId && String(entityTenantId) !== String(req.tenantId)) {
    const err = new Error("Not Found");
    err.status = 404;
    throw err;
  }
};

const ensureAuditAccess = async (req, auditId) => {
  if (!auditId) {
    const err = new Error("auditId is required");
    err.status = 400;
    throw err;
  }
  const audit = await AuditRequestMaster.findById(auditId).lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  assertTenant(audit.tenantOrgId, req);

  const role = normalizeRole(req.user?.role);
  if (ADMIN_ROLES.has(role)) return audit;
  if (AUDITOR_ROLES.has(role)) {
    const assigned =
      (audit.auditor_id && String(audit.auditor_id) === String(req.user?._id)) ||
      (await canAuditorAccessAudit(req.user?._id, auditId));
    if (!assigned) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }
  if (BUYER_ROLES.has(role)) {
    if (String(audit.create_by_buyer_id) !== String(req.user?._id)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }
  if (SUPPLIER_ROLES.has(role)) {
    if (String(audit.supplier_id) !== String(req.user?._id) && String(audit.supplier_id) !== String(req.user?.invitedBy)) {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }
    return audit;
  }
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
};

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

export const listComplianceRuns = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const auditId = req.query?.auditId || req.query?.auditRequestId;
    const role = normalizeRole(req.user?.role);
    if (SUPPLIER_ROLES.has(role) && !auditId) {
      return res.status(400).json({ error: "auditId is required for supplier view" });
    }
    if (auditId) await ensureAuditAccess(req, auditId);
    const data = await ComplianceEvaluationService.listRuns({
      tenantId: req.tenantId,
      auditId,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load compliance runs",
    });
  }
};

export const createComplianceRun = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const auditId = req.body?.auditId || req.body?.auditRequestId;
    await ensureAuditAccess(req, auditId);

    const standardKey = req.body?.standardKey;
    const standardVersion = req.body?.standardVersion;
    if (!standardKey || !standardVersion) {
      return res.status(400).json({ error: "standardKey and standardVersion are required" });
    }

    const role = normalizeRole(req.user?.role);
    const requestedMode = String(req.body?.mode || "ADVISORY").toUpperCase();
    const mode = SUPPLIER_ROLES.has(role) ? "ADVISORY" : requestedMode;

    const data = await ComplianceEvaluationService.createRun({
      tenantId: req.tenantId,
      auditId,
      standardKey,
      standardVersion,
      mode,
      actorUserId: req.user?._id,
    });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to create compliance run",
    });
  }
};

export const getComplianceRun = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const run = await ComplianceEvaluationService.getRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
    });
    if (!run) return res.status(404).json({ error: "Compliance run not found" });
    await ensureAuditAccess(req, run.auditId);
    return res.json({ success: true, data: run });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load compliance run",
    });
  }
};

export const listComplianceRunQuestions = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const run = await ComplianceEvaluationService.getRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
    });
    if (!run) return res.status(404).json({ error: "Compliance run not found" });
    await ensureAuditAccess(req, run.auditId);

    const data = await ComplianceEvaluationService.listRunQuestionResults({
      tenantId: req.tenantId,
      runId: req.params.runId,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
      verdict: req.query?.verdict,
      reviewStatus: req.query?.reviewStatus,
    });

    const hydrateSuggestions = toBool(req.query?.hydrateSuggestions, false);
    if (hydrateSuggestions && Array.isArray(data.items) && data.items.length) {
      data.items = await ComplianceEvaluationService.hydrateEvidenceSuggestions({
        tenantId: req.tenantId,
        runId: req.params.runId,
        questionResults: data.items,
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to load compliance question results",
    });
  }
};

export const updateComplianceQuestionVerdict = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const run = await ComplianceEvaluationService.getRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
    });
    if (!run) return res.status(404).json({ error: "Compliance run not found" });
    await ensureAuditAccess(req, run.auditId);

    const auditorVerdict = String(req.body?.auditorVerdict || "").toUpperCase();
    if (!COMPLIANCE_VERDICTS.includes(auditorVerdict)) {
      return res.status(400).json({
        error: `auditorVerdict must be one of: ${COMPLIANCE_VERDICTS.join(", ")}`,
      });
    }

    const data = await ComplianceEvaluationService.updateQuestionVerdict({
      tenantId: req.tenantId,
      runId: req.params.runId,
      questionId: req.params.questionId,
      auditorVerdict,
      auditorReason: req.body?.reason || req.body?.auditorReason || "",
      actorUserId: req.user?._id,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to update auditor verdict",
    });
  }
};

export const finalizeComplianceRun = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const run = await ComplianceEvaluationService.getRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
    });
    if (!run) return res.status(404).json({ error: "Compliance run not found" });
    await ensureAuditAccess(req, run.auditId);

    const data = await ComplianceEvaluationService.finalizeRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
      actorUserId: req.user?._id,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to finalize compliance run",
    });
  }
};

export const recomputeComplianceRun = async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: "Tenant missing" });
    const run = await ComplianceEvaluationService.getRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
    });
    if (!run) return res.status(404).json({ error: "Compliance run not found" });
    await ensureAuditAccess(req, run.auditId);

    const data = await ComplianceEvaluationService.recomputeRun({
      tenantId: req.tenantId,
      runId: req.params.runId,
      actorUserId: req.user?._id,
      refreshSnapshot: toBool(req.body?.refreshSnapshot, false),
      preserveAuditorOverrides: toBool(req.body?.preserveAuditorOverrides, true),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to recompute compliance run",
    });
  }
};
