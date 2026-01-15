import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { User } from "../models/userModel.js";

export const resolveAuditWorkflowTenantId = async ({ auditId, fallbackTenantId }) => {
  if (!auditId) return fallbackTenantId || null;
  const audit = await AuditRequestMaster.findById(auditId).select("create_by_buyer_id").lean();
  if (!audit?.create_by_buyer_id) return fallbackTenantId || null;
  const buyerUser = await User.findById(audit.create_by_buyer_id).select("tenant_id").lean();
  return buyerUser?.tenant_id || fallbackTenantId || null;
};
