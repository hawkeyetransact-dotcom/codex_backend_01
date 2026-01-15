import mongoose from "mongoose";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { User } from "../models/userModel.js";

export const resolveAuditWorkflowTenantId = async ({ auditId, fallbackTenantId }) => {
  if (!auditId) return fallbackTenantId || null;
  const audit = await AuditRequestMaster.findById(auditId)
    .select("create_by_buyer_id tenantOrgId tenant_id tenantId")
    .lean();
  const tenantCandidate = audit?.tenantOrgId || audit?.tenant_id || audit?.tenantId;
  if (tenantCandidate && mongoose.Types.ObjectId.isValid(String(tenantCandidate))) {
    return new mongoose.Types.ObjectId(String(tenantCandidate));
  }
  if (!audit?.create_by_buyer_id) return fallbackTenantId || null;
  const buyerUser = await User.findById(audit.create_by_buyer_id).select("tenant_id").lean();
  return buyerUser?.tenant_id || fallbackTenantId || null;
};
