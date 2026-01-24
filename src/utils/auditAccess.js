import { QuestionnaireSectionAssignment } from "../models/questionnaireSectionAssignmentModel.js";
import { canAuditorAccessAudit } from "./auditorAccess.js";

export const canUserAccessAudit = async ({ user, audit }) => {
  if (!user || !audit) return false;
  if (user.adminScope === "PLATFORM") return true;
  if (["admin", "superadmin", "tenant_admin"].includes(user.role)) return true;

  if (user.role === "auditor") {
    const ok = await canAuditorAccessAudit(user._id, audit._id);
    return ok;
  }
  if (user.role === "buyer") {
    return String(audit.create_by_buyer_id) === String(user._id);
  }
  if (user.role === "supplier") {
    return String(audit.supplier_id) === String(user._id);
  }
  if (user.role === "supplierUser") {
    const assignment = await QuestionnaireSectionAssignment.findOne({
      auditRequestId: audit._id,
      assignedToUserId: user._id,
      status: { $ne: "REASSIGNED" },
    })
      .select("_id")
      .lean();
    return Boolean(assignment);
  }
  return false;
};

export const assertAuditParticipant = async ({ user, audit }) => {
  const ok = await canUserAccessAudit({ user, audit });
  if (!ok) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
};
