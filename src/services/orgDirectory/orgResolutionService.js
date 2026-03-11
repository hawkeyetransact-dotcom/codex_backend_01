import mongoose from "mongoose";
import { BuyerProfile } from "../../models/buyerProfileModel.js";
import { SupplierProfile } from "../../models/supplierProfileModel.js";
import { AuditorProfile } from "../../models/auditorProfileModel.js";
import { AuditorAffiliation } from "../../models/auditorAffiliationModel.js";
import Tenant from "../../models/tenantModel.js";
import { User } from "../../models/userModel.js";
import { Organization } from "../../models/organizationModel.js";
import { OrgClaim } from "../../models/orgClaimModel.js";
import { Engagement } from "../../models/engagementModels.js";
import { QualificationCase } from "../../models/qualificationModels.js";

export const normalizeOrgName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(limited|ltd|inc|llc|corp|corporation|pvt|private|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const buildDirectoryKey = (name, country = "") => {
  const normalized = normalizeOrgName(name).replace(/\s+/g, "-");
  const suffix = String(country || "").trim().toLowerCase();
  return [normalized || "org", suffix].filter(Boolean).join("--");
};

const maybeObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const getTenantClaim = async (tenantId) => {
  if (!tenantId) return null;
  return OrgClaim.findOne({ tenantId, status: "ACTIVE", isPrimary: true }).populate("orgId").lean();
};

const findOrCreateInferredOrg = async ({ legalName, country = "", actorUserId = null, apply = true }) => {
  const normalizedLegalName = normalizeOrgName(legalName);
  if (!normalizedLegalName) return null;

  const existing = await Organization.findOne({
    normalizedLegalName,
    ...(country ? { "headquarters.country": country } : {}),
  }).lean();
  if (existing || !apply) return existing || null;

  return Organization.create({
    directoryKey: buildDirectoryKey(legalName, country),
    legalName: legalName.trim(),
    normalizedLegalName,
    displayName: legalName.trim(),
    headquarters: { country },
    status: "ACTIVE",
    entityTypes: ["UNKNOWN"],
    supplyChainRoles: [],
    legacyRefs: { source: "org-resolution-inferred" },
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
};

const resolveProfileOrganization = async ({
  tenantId,
  userId,
  profileModel,
  companyFieldCandidates = ["companyName", "organizationName", "company"],
  actorUserId = null,
}) => {
  const activeClaim = await getTenantClaim(tenantId);
  if (activeClaim?.orgId) return activeClaim.orgId;

  if (!userId || !profileModel) return null;
  const profile = await profileModel.findOne({ user_id: userId }).lean();
  if (!profile) return null;

  const companyName = companyFieldCandidates
    .map((field) => String(profile?.[field] || "").trim())
    .find(Boolean);
  if (!companyName) return null;

  return findOrCreateInferredOrg({
    legalName: companyName,
    country: profile?.country || "",
    actorUserId,
  });
};

const resolveAuditorOrganization = async ({ tenantId, userId, actorUserId = null }) => {
  const directClaim = await getTenantClaim(tenantId);
  if (directClaim?.orgId) return directClaim.orgId;

  const profiles = userId
    ? await AuditorProfile.find({ user_id: userId }).select("_id").lean()
    : [];
  const profileIds = profiles.map((profile) => profile._id);
  const affiliation =
    profileIds.length > 0
      ? await AuditorAffiliation.findOne({
          status: "ACTIVE",
          auditorProfileId: { $in: profileIds },
        })
          .sort({ updatedAt: -1 })
          .lean()
      : null;

  const affiliatedTenantId = affiliation?.orgTenantId || null;
  if (affiliatedTenantId) {
    const claim = await getTenantClaim(affiliatedTenantId);
    if (claim?.orgId) return claim.orgId;
  }

  return resolveProfileOrganization({
    tenantId,
    userId,
    profileModel: AuditorProfile,
    companyFieldCandidates: ["companyName"],
    actorUserId,
  });
};

const resolveTenantFallbackOrg = async ({ tenantId, actorUserId = null }) => {
  if (!tenantId) return null;
  const claim = await getTenantClaim(tenantId);
  if (claim?.orgId) return claim.orgId;

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant?.displayName && !tenant?.name) return null;
  return findOrCreateInferredOrg({
    legalName: tenant.displayName || tenant.name,
    actorUserId,
  });
};

export class OrgResolutionService {
  static async resolveTenantOrganization({ tenantId, actorUserId = null }) {
    return resolveTenantFallbackOrg({ tenantId, actorUserId });
  }

  static async resolveBuyerOrg({ buyerUserId, tenantId, actorUserId = null }) {
    return resolveProfileOrganization({
      tenantId,
      userId: buyerUserId,
      profileModel: BuyerProfile,
      companyFieldCandidates: ["companyName"],
      actorUserId,
    });
  }

  static async resolveSupplierOrg({ supplierUserId, actorUserId = null }) {
    if (!supplierUserId) return null;
    const user = await User.findById(supplierUserId).select("tenant_id").lean();
    return resolveProfileOrganization({
      tenantId: user?.tenant_id || null,
      userId: supplierUserId,
      profileModel: SupplierProfile,
      companyFieldCandidates: ["companyName"],
      actorUserId,
    });
  }

  static async resolveAuditorOrg({ auditorUserId, actorUserId = null }) {
    if (!auditorUserId) return null;
    const user = await User.findById(auditorUserId).select("tenant_id").lean();
    return resolveAuditorOrganization({
      tenantId: user?.tenant_id || null,
      userId: auditorUserId,
      actorUserId,
    });
  }

  static async resolveAuditContext({
    tenantId,
    buyerUserId,
    supplierUserId,
    auditorUserId,
    buyerOrgId,
    supplierOrgId,
    engagementId,
    qualificationCaseId,
    actorUserId = null,
  }) {
    const resolvedBuyerOrg =
      maybeObjectId(buyerOrgId) ||
      (await OrgResolutionService.resolveBuyerOrg({ buyerUserId, tenantId, actorUserId }))?._id ||
      null;
    const resolvedSupplierOrg =
      maybeObjectId(supplierOrgId) ||
      (await OrgResolutionService.resolveSupplierOrg({ supplierUserId, actorUserId }))?._id ||
      null;
    const resolvedAuditorOrg =
      (await OrgResolutionService.resolveAuditorOrg({ auditorUserId, actorUserId }))?._id || null;

    let resolvedEngagementId = maybeObjectId(engagementId);
    if (resolvedEngagementId) {
      const engagement = await Engagement.findById(resolvedEngagementId).select("_id buyerOrgId supplierOrgId").lean();
      if (!engagement) {
        const error = new Error("Invalid engagementId");
        error.status = 400;
        throw error;
      }
      if (
        resolvedBuyerOrg &&
        String(engagement.buyerOrgId) !== String(resolvedBuyerOrg)
      ) {
        const error = new Error("engagementId does not match buyerOrgId");
        error.status = 400;
        throw error;
      }
      if (
        resolvedSupplierOrg &&
        String(engagement.supplierOrgId) !== String(resolvedSupplierOrg)
      ) {
        const error = new Error("engagementId does not match supplierOrgId");
        error.status = 400;
        throw error;
      }
    } else if (resolvedBuyerOrg && resolvedSupplierOrg) {
      const engagement = await Engagement.findOne({
        buyerOrgId: resolvedBuyerOrg,
        supplierOrgId: resolvedSupplierOrg,
        status: { $in: ["DRAFT", "ACTIVE"] },
      })
        .sort({ updatedAt: -1 })
        .select("_id")
        .lean();
      resolvedEngagementId = engagement?._id || null;
    }

    const resolvedQualificationCaseId = maybeObjectId(qualificationCaseId);
    if (resolvedQualificationCaseId) {
      const qualification = await QualificationCase.findById(resolvedQualificationCaseId)
        .select("_id buyerOrgId supplierOrgId engagementId")
        .lean();
      if (!qualification) {
        const error = new Error("Invalid qualificationCaseId");
        error.status = 400;
        throw error;
      }
      if (
        resolvedBuyerOrg &&
        String(qualification.buyerOrgId) !== String(resolvedBuyerOrg)
      ) {
        const error = new Error("qualificationCaseId does not match buyerOrgId");
        error.status = 400;
        throw error;
      }
      if (
        resolvedSupplierOrg &&
        String(qualification.supplierOrgId) !== String(resolvedSupplierOrg)
      ) {
        const error = new Error("qualificationCaseId does not match supplierOrgId");
        error.status = 400;
        throw error;
      }
    }

    return {
      buyerOrgId: resolvedBuyerOrg,
      supplierOrgId: resolvedSupplierOrg,
      auditorOrgId: resolvedAuditorOrg,
      engagementId: resolvedEngagementId,
      qualificationCaseId: resolvedQualificationCaseId,
    };
  }
}
