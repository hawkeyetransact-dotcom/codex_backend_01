import { IntegrationAuditLog } from "../../models/integrationAuditLogModel.js";

export const logIntegrationAudit = async ({ req, action, entityType, entityId, before, after }) => {
  try {
    await IntegrationAuditLog.create({
      tenantId: req.tenantId || null,
      actorUserId: req.user?._id,
      action,
      entityType,
      entityId,
      before,
      after,
      ip: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  } catch (err) {
    console.error("[integrations] audit log error", err.message);
  }
};
