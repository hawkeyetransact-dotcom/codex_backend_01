import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../models/auditorAffiliationModel.js";
import mongoose from "mongoose";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const resolveAuditorProfile = async (userId) => {
  if (!isValidObjectId(userId)) return null;
  return AuditorProfile.findOne({ user_id: userId }).lean();
};

export const canAuditorAccessAudit = async (userId, auditId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(auditId)) return false;
  const profile = await resolveAuditorProfile(userId);
  if (!profile) return false;

  const audit = await AuditRequestMaster.findById(auditId)
    .select("auditor_id tenantOrgId assignedAuditors")
    .lean();
  if (!audit) return false;

  // Backward compatibility: single auditor_id
  if (audit.auditor_id && String(audit.auditor_id) === String(userId)) return true;

  // AssignedAuditors path
  const matchAssigned =
    Array.isArray(audit.assignedAuditors) &&
    audit.assignedAuditors.some((a) => a?.auditorProfileId && String(a.auditorProfileId) === String(profile._id));
  if (!matchAssigned) return false;

  // Tenant/affiliation guard
  if (audit.tenantOrgId) {
    const affiliation = await AuditorAffiliation.findOne({
      auditorProfileId: profile._id,
      orgTenantId: audit.tenantOrgId,
      status: "ACTIVE",
    }).lean();
    return Boolean(affiliation);
  }
  return true;
};
