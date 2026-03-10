import mongoose from "mongoose";
import { listEqmsConnectors } from "../integrations/eqms/registry.js";
import {
  listExternalAudits,
  listExternalCapas,
  listInternalCapas,
  syncExternalAuditsFromHawkeye,
  syncExternalCapasFromHawkeye,
  syncInternalCapasFromSystem,
} from "../services/eqms/eqmsSyncService.js";
import {
  listCAPARiskIndicators,
  recalculateCAPARiskIndicator,
} from "../services/eqms/riskScoringService.js";
import { buildDynamicQuestionnaire } from "../services/eqms/dynamicQuestionnaireEngine.js";
import {
  collectEvidence,
  indexEvidence,
  linkEvidenceToAudit,
} from "../services/eqms/evidenceAggregator.js";
import {
  getAuditIntelligenceAnalytics,
  getUnifiedCapaDashboard,
} from "../services/eqms/unifiedDashboardService.js";

const toObjectIdOrNull = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const parsePagination = (query = {}) => ({
  page: Number(query.page || 1),
  limit: Number(query.limit || 100),
});

const resolveTenantId = (req) => req.tenantId || req.user?.tenant_id || null;

const handleError = (res, error, fallbackMessage) =>
  res.status(error?.status || 500).json({ error: error?.message || fallbackMessage });

export const listSystems = async (_req, res) => {
  try {
    return res.json({ success: true, data: listEqmsConnectors() });
  } catch (error) {
    return handleError(res, error, "Failed to list eQMS systems");
  }
};

export const syncInternalCapas = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const result = await syncInternalCapasFromSystem({
      tenantId: toObjectIdOrNull(tenantId),
      systemKey: req.body?.system || req.body?.externalSystem,
      supplierId: req.body?.supplierId,
      siteId: req.body?.siteId,
      connectionId: req.body?.connectionId,
      limit: req.body?.limit,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to sync internal CAPAs");
  }
};

export const getInternalCapas = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await listInternalCapas({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.query?.supplierId,
      siteId: req.query?.siteId,
      externalSystem: req.query?.externalSystem,
      status: req.query?.status,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load internal CAPAs");
  }
};

export const syncExternalCapas = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await syncExternalCapasFromHawkeye({ tenantId: toObjectIdOrNull(tenantId) });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to sync external CAPAs");
  }
};

export const getExternalCapas = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await listExternalCapas({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.query?.supplierId,
      siteId: req.query?.siteId,
      status: req.query?.status,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load external CAPAs");
  }
};

export const syncExternalAudits = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await syncExternalAuditsFromHawkeye({ tenantId: toObjectIdOrNull(tenantId) });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to sync external audits");
  }
};

export const getExternalAudits = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await listExternalAudits({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.query?.supplierId,
      siteId: req.query?.siteId,
      status: req.query?.status,
      auditType: req.query?.auditType,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load external audits");
  }
};

export const recomputeRiskIndicators = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const supplierId = req.body?.supplierId || req.query?.supplierId;
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
    const data = await recalculateCAPARiskIndicator({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId,
      siteId: req.body?.siteId || req.query?.siteId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to compute CAPA risk indicator");
  }
};

export const getRiskIndicators = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await listCAPARiskIndicators({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.query?.supplierId,
      siteId: req.query?.siteId,
      riskLevel: req.query?.riskLevel,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load risk indicators");
  }
};

export const getDynamicQuestionnaireRecommendations = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const supplierId = req.body?.supplierId || req.query?.supplierId;
    if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
    const data = await buildDynamicQuestionnaire({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: toObjectIdOrNull(supplierId),
      siteId: toObjectIdOrNull(req.body?.siteId || req.query?.siteId),
      auditType: req.body?.auditType || req.query?.auditType || "SUPPLIER_AUDIT",
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to generate dynamic questionnaire");
  }
};

export const collectEqmsEvidence = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await collectEvidence({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.body?.supplierId || req.query?.supplierId,
      siteId: req.body?.siteId || req.query?.siteId,
      connectionId: req.body?.connectionId || req.query?.connectionId,
      includeInternal:
        req.body?.includeInternal === undefined ? true : Boolean(req.body?.includeInternal),
      includeExternal:
        req.body?.includeExternal === undefined ? true : Boolean(req.body?.includeExternal),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to collect evidence");
  }
};

export const indexEqmsEvidence = async (req, res) => {
  try {
    const evidenceItems = Array.isArray(req.body?.evidenceItems) ? req.body.evidenceItems : [];
    if (!evidenceItems.length) {
      return res.status(400).json({ error: "evidenceItems is required" });
    }
    const data = await indexEvidence({ evidenceItems });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to index evidence");
  }
};

export const linkEvidence = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const auditId = req.body?.auditId || req.params?.auditId;
    if (!auditId) return res.status(400).json({ error: "auditId is required" });
    const evidenceItems = Array.isArray(req.body?.evidenceItems) ? req.body.evidenceItems : [];
    const data = await linkEvidenceToAudit({
      tenantId: toObjectIdOrNull(tenantId),
      auditId,
      evidenceItems,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to link evidence");
  }
};

export const getUnifiedDashboard = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await getUnifiedCapaDashboard({
      tenantId: toObjectIdOrNull(tenantId),
      supplierId: req.query?.supplierId,
      siteId: req.query?.siteId,
      status: req.query?.status,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load unified CAPA dashboard");
  }
};

export const getAuditIntelligence = async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant missing" });
    const data = await getAuditIntelligenceAnalytics({
      tenantId: toObjectIdOrNull(tenantId),
      top: req.query?.top,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, "Failed to load audit intelligence analytics");
  }
};
