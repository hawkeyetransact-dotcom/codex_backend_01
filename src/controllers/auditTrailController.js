import { AuditTrail } from "../models/auditTrailModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { ENFORCE_AUDIT_PARTICIPANTS } from "../config/featureFlags.js";
import { assertAuditParticipant } from "../utils/auditAccess.js";
import mongoose from "mongoose";

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
  assertSameTenant(audit.tenantOrgId, req.tenantId);
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
