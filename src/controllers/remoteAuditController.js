import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { RemoteSession } from "../models/remoteSessionModel.js";
import { assertSameTenant } from "../middlewares/authMiddleware.js";
import { resolveAuditRequestId } from "../services/requestIdService.js";
import { ENFORCE_AUDIT_PARTICIPANTS } from "../config/featureFlags.js";
import { assertAuditParticipant } from "../utils/auditAccess.js";
import { writeAuditTrail } from "../services/auditTrailService.js";

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

export const listRemoteSessions = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const items = await RemoteSession.find({ tenantId, auditId: audit._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to load remote sessions" });
  }
};

export const createRemoteSession = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const payload = req.body || {};
    const record = await RemoteSession.create({
      tenantId,
      auditId: audit._id,
      provider: payload.provider,
      meetingUrl: payload.meetingUrl,
      status: payload.status,
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      recordingAssetId: payload.recordingAssetId,
      notes: payload.notes,
      participants: payload.participants || [],
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "remote-session",
      entityId: record._id,
      action: "REMOTE_SESSION_CREATED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
    });
    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to create remote session" });
  }
};

export const updateRemoteSession = async (req, res) => {
  try {
    const audit = await loadAudit(req);
    const tenantId = audit.tenantOrgId || req.tenantId;
    const payload = req.body || {};
    const record = await RemoteSession.findOneAndUpdate(
      { tenantId, auditId: audit._id, _id: req.params.sessionId },
      { ...payload, updatedBy: req.user?._id },
      { new: true }
    );
    if (!record) return res.status(404).json({ error: "Remote session not found" });
    await writeAuditTrail({
      tenantId,
      auditId: audit._id,
      entityType: "remote-session",
      entityId: record._id,
      action: "REMOTE_SESSION_UPDATED",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      meta: { status: record.status },
    });
    return res.json({ success: true, data: record });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || "Failed to update remote session" });
  }
};
