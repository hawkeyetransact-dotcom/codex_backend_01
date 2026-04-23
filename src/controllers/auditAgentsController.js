/**
 * Audit AI Agents — HTTP controller.
 * Mounted at /api/ai/audit-agents (see app.js).
 */
import { prepareQuestionnaire } from "../services/ai/audit-agents/auditPrepAgent.js";
import { autofillForm } from "../services/ai/audit-agents/auditAutofillAgent.js";
import { assembleReport, contentHash } from "../services/ai/audit-agents/auditReportAgent.js";
import { compileSupplierIntel } from "../services/ai/audit-agents/supplierIntelAgent.js";
import { resolveSupplier } from "../services/ai/audit-agents/entityResolutionService.js";
import {
  openFdaSearchByManufacturer,
  openFdaRecallsByFirm,
  openFdaAdverseEventsByBrand,
  fdaWarningLettersByCompany,
  PROVIDERS,
} from "../services/ai/audit-agents/publicDataFusionService.js";

function tc(req) {
  return {
    tenantId: req.user?.tenant_id || req.user?.tenantId,
    userId: req.user?._id,
    userRole: req.user?.role,
  };
}

// ── Agent: prepare questionnaire ─────────────────────────────────────────
export const postPrepareQuestionnaire = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant not resolved" });
    const { supplierId, supplierName, productClass, scope, auditType, templateId } = req.body || {};
    if (!supplierId && !supplierName) {
      return res.status(400).json({ error: "supplierId or supplierName required" });
    }
    const result = await prepareQuestionnaire({
      tenantId: t.tenantId,
      supplierId, supplierName, productClass, scope, auditType, templateId,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[audit-agents] prepareQuestionnaire:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Agent: autofill form ─────────────────────────────────────────────────
export const postAutofillForm = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant not resolved" });
    const { formFields, libraryChunks, supplierId, siteId, productId } = req.body || {};
    const result = await autofillForm({
      tenantId: t.tenantId,
      formFields, libraryChunks, supplierId, siteId, productId,
      tenantContext: t,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[audit-agents] autofill:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Agent: assemble report ───────────────────────────────────────────────
export const postAssembleReport = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant not resolved" });
    const { auditId } = req.body || {};
    if (!auditId) return res.status(400).json({ error: "auditId required" });
    const result = await assembleReport({
      tenantId: t.tenantId,
      auditId,
      tenantContext: t,
    });
    // Expose integrity hash so the client can surface it in UI.
    if (result.html && !result.integrityHash) {
      result.integrityHash = contentHash(result.html);
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("[audit-agents] assembleReport:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ── Agent: supplier intel ────────────────────────────────────────────────
export const postSupplierIntel = async (req, res) => {
  try {
    const t = tc(req);
    if (!t.tenantId) return res.status(400).json({ error: "tenant not resolved" });
    const { supplierId, supplierName, fetchPublic } = req.body || {};
    if (!supplierId && !supplierName) {
      return res.status(400).json({ error: "supplierId or supplierName required" });
    }
    const result = await compileSupplierIntel({
      tenantId: t.tenantId,
      supplierId, supplierName, fetchPublic,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Service: entity resolution ───────────────────────────────────────────
export const postResolveSupplier = async (req, res) => {
  try {
    const t = tc(req);
    const { queryName, knownSupplierId, fetchPublic = true } = req.body || {};
    if (!queryName && !knownSupplierId) return res.status(400).json({ error: "queryName or knownSupplierId required" });
    const result = await resolveSupplier({ tenantId: t.tenantId, queryName, knownSupplierId, fetchPublic });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Service: public data adapters ────────────────────────────────────────
export const getPublicProviders = async (_req, res) => {
  return res.status(200).json({ ok: true, providers: Object.values(PROVIDERS) });
};

export const postOpenFdaManufacturer = async (req, res) => {
  try {
    const { name, limit } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await openFdaSearchByManufacturer(name, { limit });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postOpenFdaRecalls = async (req, res) => {
  try {
    const { name, limit } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await openFdaRecallsByFirm(name, { limit });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postFdaWarningLetters = async (req, res) => {
  try {
    const { name, limit } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const r = await fdaWarningLettersByCompany(name, { limit });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const postOpenFdaAdverseEvents = async (req, res) => {
  try {
    const { brandName, limit } = req.body || {};
    if (!brandName) return res.status(400).json({ error: "brandName required" });
    const r = await openFdaAdverseEventsByBrand(brandName, { limit });
    return res.status(200).json(r);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
