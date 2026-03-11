import { AuditorAffiliation } from "../../models/auditorAffiliationModel.js";
import { Engagement, EngagementParticipant } from "../../models/engagementModels.js";
import { OrgClaim } from "../../models/orgClaimModel.js";

const normalizeRole = (value) => String(value || "").toLowerCase().replace(/[\s_-]/g, "");

export class EngagementAccessService {
  static async resolveAccessibleOrgIds({ user, tenantId }) {
    const orgIds = new Set();
    if (tenantId) {
      const claims = await OrgClaim.find({ tenantId, status: "ACTIVE" }).select("orgId").lean();
      claims.forEach((claim) => {
        if (claim?.orgId) orgIds.add(String(claim.orgId));
      });
    }

    const role = normalizeRole(user?.role);
    if (role === "auditor" && user?._id) {
      const affiliations = await AuditorAffiliation.find({ status: "ACTIVE" })
        .populate({
          path: "auditorProfileId",
          match: { user_id: user._id },
          select: "_id",
        })
        .select("orgTenantId")
        .lean();

      const tenantIds = affiliations.map((item) => item?.orgTenantId).filter(Boolean);
      if (tenantIds.length) {
        const claims = await OrgClaim.find({
          tenantId: { $in: tenantIds },
          status: "ACTIVE",
        }).select("orgId").lean();
        claims.forEach((claim) => {
          if (claim?.orgId) orgIds.add(String(claim.orgId));
        });
      }
    }

    return Array.from(orgIds);
  }

  static async canAccessEngagement({ engagementId, user, tenantId }) {
    const engagement = await Engagement.findById(engagementId).lean();
    if (!engagement) return false;

    if (tenantId && String(engagement.ownerTenantId) === String(tenantId)) {
      return true;
    }

    const now = new Date();
    const participant = await EngagementParticipant.findOne({
      engagementId,
      status: "ACTIVE",
      $or: [
        ...(user?._id ? [{ userId: user._id }] : []),
        ...(tenantId ? [{ tenantId }] : []),
      ],
      $and: [
        { $or: [{ accessStartsAt: null }, { accessStartsAt: { $lte: now } }] },
        { $or: [{ accessExpiresAt: null }, { accessExpiresAt: { $gt: now } }] },
      ],
    }).lean();

    if (participant) return true;

    const accessibleOrgIds = await EngagementAccessService.resolveAccessibleOrgIds({ user, tenantId });
    if (
      accessibleOrgIds.includes(String(engagement.buyerOrgId)) ||
      accessibleOrgIds.includes(String(engagement.supplierOrgId))
    ) {
      const orgParticipant = await EngagementParticipant.findOne({
        engagementId,
        status: "ACTIVE",
        orgId: { $in: accessibleOrgIds },
      }).lean();
      return Boolean(orgParticipant);
    }

    return false;
  }

  static async canManageEngagement({ engagementId, user, tenantId }) {
    const access = await EngagementAccessService.canAccessEngagement({ engagementId, user, tenantId });
    if (!access) return false;

    const role = normalizeRole(user?.role);
    if (["tenantadmin", "admin", "superadmin"].includes(role)) return true;

    const participant = await EngagementParticipant.findOne({
      engagementId,
      status: "ACTIVE",
      $or: [{ userId: user?._id }, { tenantId }],
      role: { $in: ["BUYER_OWNER", "SUPPLIER_OWNER", "ADMIN"] },
    }).lean();

    return Boolean(participant);
  }
}
