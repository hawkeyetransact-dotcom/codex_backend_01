import { GovernanceAuditLog } from "../../models/governanceAuditLogModel.js";
import { resolvePersonaFromUser } from "./persona.js";

export const writeGovernanceAuditLog = async ({
  req,
  action,
  targetType,
  targetId,
  diff,
  tenantId,
  actorPersona,
}) => {
  try {
    const persona = actorPersona || resolvePersonaFromUser(req?.user);
    await GovernanceAuditLog.create({
      tenantId: tenantId || req?.tenantId || null,
      actorUserId: req?.user?._id,
      actorPersona: persona || undefined,
      action,
      targetType,
      targetId,
      diff,
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    });
  } catch (err) {
    console.error("governance audit log failed", err.message);
  }
};
