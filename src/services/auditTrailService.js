import { AuditTrail } from "../models/auditTrailModel.js";

/**
 * Cross-module Part-11 / Annex-11 audit-trail writer.
 *
 * Required:
 *   tenantId, entityType, action
 * Optional but strongly encouraged:
 *   module               — "deviation" | "capa" | "document_control" | "change_control" | etc.
 *   auditId              — only when the change is tied to an audit
 *   entityId             — the record being changed
 *   actorId, actorRole   — who did it
 *   reasonForChange      — ALCOA+ "why" — required by FDA inspectors
 *   signatureId          — link to ElectronicSignature record (when applicable)
 *   meta                 — { before, after, changedFields[], collection, ... }
 */
export const writeAuditTrail = async ({
  tenantId,
  auditId,
  module,
  entityType,
  entityId,
  action,
  actorId,
  actorRole,
  reasonForChange,
  signatureId,
  meta,
}) => {
  if (!tenantId || !entityType || !action) return null;
  try {
    const incomingMeta = meta && typeof meta === "object" ? meta : {};
    const changedFields = Array.isArray(incomingMeta?.changedFields)
      ? incomingMeta.changedFields.filter(Boolean).map((field) => String(field))
      : [];
    const normalizedMeta = {
      ...incomingMeta,
      actorRole: incomingMeta.actorRole || actorRole || null,
      actorUsername:
        incomingMeta.actorUsername ||
        incomingMeta.username ||
        (actorId ? String(actorId) : "system"),
      changeBrief: incomingMeta.changeBrief || {
        collection: incomingMeta.collection || entityType,
        fields: changedFields,
      },
      loggedAt: incomingMeta.loggedAt || new Date().toISOString(),
    };
    const entry = await AuditTrail.create({
      tenantId,
      auditId: auditId || undefined,
      module: module || entityType,
      entityType,
      entityId,
      action,
      actorId,
      actorRole,
      reasonForChange: reasonForChange || incomingMeta.reasonForChange || null,
      signatureId: signatureId || incomingMeta.signatureId || null,
      meta: normalizedMeta,
    });
    return entry;
  } catch (error) {
    console.error("audit trail write failed", error.message);
    return null;
  }
};

/**
 * Convenience: log a state transition (the most common audit-trail event).
 *   recordTransition({ req, module, entityType, entityId, fromStatus, toStatus, reasonForChange })
 * Pulls actor, tenantId, signatureId from the request automatically.
 */
export const recordTransition = async ({
  req,
  module,
  entityType,
  entityId,
  auditId,
  fromStatus,
  toStatus,
  reasonForChange,
  extraMeta,
}) => {
  return writeAuditTrail({
    tenantId: req?.tenantId || req?.user?.tenant_id?.toString() || null,
    auditId,
    module,
    entityType,
    entityId,
    action: `STATUS_${(toStatus || "CHANGED").toUpperCase()}`,
    actorId: req?.user?._id,
    actorRole: req?.user?.role,
    reasonForChange,
    signatureId: req?.electronicSignature?._id,
    meta: {
      before: { status: fromStatus },
      after: { status: toStatus },
      changedFields: ["status"],
      ...(extraMeta || {}),
    },
  });
};
