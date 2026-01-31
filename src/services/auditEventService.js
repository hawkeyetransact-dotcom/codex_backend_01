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
      meta: meta || {},
    });
  } catch (error) {
    console.error("audit event write failed", error.message);
  }
};
