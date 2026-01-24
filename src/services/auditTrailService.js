import { AuditTrail } from "../models/auditTrailModel.js";

export const writeAuditTrail = async ({
  tenantId,
  auditId,
  entityType,
  entityId,
  action,
  actorId,
  actorRole,
  meta,
}) => {
  if (!tenantId || !auditId || !entityType || !action) return;
  try {
    await AuditTrail.create({
      tenantId,
      auditId,
      entityType,
      entityId,
      action,
      actorId,
      actorRole,
      meta: meta || {},
    });
  } catch (error) {
    console.error("audit trail write failed", error.message);
  }
};
