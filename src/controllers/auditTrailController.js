import { AuditTrail } from "../models/auditTrailModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { ENFORCE_AUDIT_PARTICIPANTS } from "../config/featureFlags.js";
import { assertAuditParticipant } from "../utils/auditAccess.js";
import mongoose from "mongoose";

const normalizeRole = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");
const isPlatformScopedAdmin = (req) => {
  const role = normalizeRole(req.user?.role);
  if (role === "superadmin") return true;
  return String(req.user?.adminScope || "").toUpperCase() === "PLATFORM";
};
const assertAuditTenantVisibility = ({ audit, req }) => {
  if (!audit?.tenantOrgId || !req?.tenantId) return;
  if (String(audit.tenantOrgId) === String(req.tenantId)) return;
  if (isPlatformScopedAdmin(req)) return;
  const role = normalizeRole(req.user?.role);
  if (["auditor", "buyer", "supplier", "supplieruser"].includes(role)) return;
  const err = new Error("Not Found");
  err.status = 404;
  throw err;
};

const loadAudit = async (req) => {
  const rawId = req.params.auditId;
  const resolvedId = await resolveAuditRequestId({
    requestId: rawId,
    AuditRequestModel: AuditRequestMaster,
  });
  const audit = await AuditRequestMaster.findById(resolvedId || rawId);
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  assertAuditTenantVisibility({ audit, req });
  if (ENFORCE_AUDIT_PARTICIPANTS) {
    await assertAuditParticipant({ user: req.user, audit });
  }
  return audit;
};

const clampNumber = (value, fallback, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  if (max && parsed > max) return max;
  return parsed;
};

const normalizeText = (value, fallback = "") => String(value || fallback).trim();
const toObjectIdOrNull = (value) =>
  value && mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;

export const listAuditTrail = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const limit = clampNumber(req.query?.limit, 50, 200);
    const skip = clampNumber(req.query?.skip, 0, 10000);
    const { entityType, action } = req.query || {};

    const filter = { tenantId, auditId: audit._id };
    if (entityType) filter.entityType = entityType;
    if (action) filter.action = action;

    const items = await AuditTrail.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({ success: true, data: items });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load audit trail" });
  }
};

/**
 * GET /api/audit-trail/by-entity?entityType=capa&entityId=...
 *
 * Cross-module Part-11 trail viewer. Used by CAPA / Doc / Change / MRM /
 * Risk pages to show "every change to this record". Tenant-scoped.
 */
export const listByEntity = async (req, res) => {
  try {
    const tenantId = String(req.tenantId || req.user?.tenant_id || "");
    const { entityType, entityId, module, action } = req.query || {};
    if (!entityType && !module) {
      return res.status(400).json({ error: "entityType or module is required" });
    }
    const limit = clampNumber(req.query?.limit, 100, 500);
    const skip = clampNumber(req.query?.skip, 0, 10000);
    const filter = { tenantId };
    if (entityType) filter.entityType = entityType;
    if (entityId && mongoose.Types.ObjectId.isValid(String(entityId))) {
      filter.entityId = new mongoose.Types.ObjectId(String(entityId));
    }
    if (module) filter.module = module;
    if (action) filter.action = action;
    const items = await AuditTrail.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to load audit trail" });
  }
};

export const createAuditTrailEntry = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const action = normalizeText(req.body?.action || "UI_CLICK").slice(0, 80) || "UI_CLICK";
    const entityType = normalizeText(req.body?.entityType || "audit-ui-event").slice(0, 80) || "audit-ui-event";
    const entityId = toObjectIdOrNull(req.body?.entityId);
    const incomingMeta =
      req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};
    const meta = {
      ...incomingMeta,
      actorRole: req.user?.role || "",
      actorUserId: req.user?._id ? String(req.user._id) : "",
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
      loggedAt: new Date().toISOString(),
    };

    const item = await AuditTrail.create({
      tenantId,
      auditId: audit._id,
      entityType,
      entityId,
      action,
      actorId: req.user?._id || undefined,
      actorRole: req.user?.role || "",
      meta,
    });

    return res.status(201).json({ success: true, data: item });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create audit trail entry" });
  }
};
