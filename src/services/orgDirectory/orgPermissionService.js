import { OrgClaim } from "../../models/orgClaimModel.js";

const normalizeRole = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");

export class OrgPermissionService {
  static isGlobalOrgAdmin(user) {
    const role = normalizeRole(user?.role);
    return role === "superadmin" || String(user?.adminScope || "").toUpperCase() === "PLATFORM";
  }

  static async listManagedOrgIds({ tenantId, user }) {
    if (OrgPermissionService.isGlobalOrgAdmin(user)) {
      return null;
    }
    if (!tenantId) return [];

    const claims = await OrgClaim.find({ tenantId, status: "ACTIVE" }).select("orgId").lean();
    return claims.map((claim) => String(claim.orgId)).filter(Boolean);
  }

  static async canManageOrganization({ orgId, tenantId, user }) {
    if (!orgId) return false;
    if (OrgPermissionService.isGlobalOrgAdmin(user)) return true;
    if (!tenantId) return false;

    const claim = await OrgClaim.findOne({
      tenantId,
      orgId,
      status: "ACTIVE",
    })
      .select("_id")
      .lean();

    return Boolean(claim);
  }

  static async assertManageOrganization({ orgId, tenantId, user, message = "Forbidden" }) {
    const allowed = await OrgPermissionService.canManageOrganization({ orgId, tenantId, user });
    if (!allowed) {
      const error = new Error(message);
      error.status = 403;
      throw error;
    }
  }
}
