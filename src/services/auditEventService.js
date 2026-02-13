import { AuditEvent } from "../models/auditEventModel.js";

export const writeAuditEvent = async ({
  tenantId,
  auditId,
  entityType,
  entityId,
  action,
  actorId,
  actorRole,
  before,
  after,
  ip,
  userAgent,
  meta,
}) => {
  if (!tenantId || !auditId || !entityType || !action) return;
  try {
    const incomingMeta = meta && typeof meta === "object" ? meta : {};
    const normalizedMeta = {
      ...incomingMeta,
      actorRole: incomingMeta.actorRole || actorRole || null,
      actorUsername:
        incomingMeta.actorUsername ||
        incomingMeta.username ||
        (actorId ? String(actorId) : "system"),
      changeBrief: incomingMeta.changeBrief || null,
      loggedAt: incomingMeta.loggedAt || new Date().toISOString(),
    };
    await AuditEvent.create({
      tenantId,
      auditId,
      entityType,
      entityId,
      action,
      actorId,
      actorRole,
      before: before ?? null,
      after: after ?? null,
      ip,
      userAgent,
      meta: normalizedMeta,
    });
  } catch (error) {
    console.error("audit event write failed", error.message);
  }
};
