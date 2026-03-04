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

  const audit = await AuditRequestMaster.findById(auditId)
    .select("auditor_id tenantOrgId assignedAuditors")
    .lean();
  if (!audit) return false;

  // Backward compatibility: single auditor_id
  if (audit.auditor_id && String(audit.auditor_id) === String(userId)) return true;

  const profile = await resolveAuditorProfile(userId);
  const profileId = profile?._id ? String(profile._id) : "";

  // AssignedAuditors path
  const matchAssigned =
    Array.isArray(audit.assignedAuditors) &&
    audit.assignedAuditors.some((a) => {
      if (!a) return false;
      if (a.auditorUserId && String(a.auditorUserId) === String(userId)) return true;
      if (a.userId && String(a.userId) === String(userId)) return true;
      if (a.auditorProfileId && profileId && String(a.auditorProfileId) === profileId) return true;
      return false;
    });
  if (!matchAssigned) return false;

  // If this audit uses user-level assignment and profile is absent, allow access.
  if (!profile?._id) return true;

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
