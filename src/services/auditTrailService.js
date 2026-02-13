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
    await AuditTrail.create({
      tenantId,
      auditId,
      entityType,
      entityId,
      action,
      actorId,
      actorRole,
      meta: normalizedMeta,
    });
  } catch (error) {
    console.error("audit trail write failed", error.message);
  }
};
