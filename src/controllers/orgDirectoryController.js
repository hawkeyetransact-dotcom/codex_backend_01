import mongoose from "mongoose";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { OrgClaim } from "../models/orgClaimModel.js";
import { OrgSite } from "../models/orgSiteModel.js";
import { OrgUnit } from "../models/orgUnitModel.js";
import { OrgUserAssignment } from "../models/orgUserAssignmentModel.js";
import { Organization } from "../models/organizationModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { User } from "../models/userModel.js";
import { OrgPermissionService } from "../services/orgDirectory/orgPermissionService.js";
import {
  OrgResolutionService,
  buildDirectoryKey,
  normalizeOrgName,
} from "../services/orgDirectory/orgResolutionService.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const pick = (source, fields) => {
  const target = {};
  fields.forEach((field) => {
    if (source[field] !== undefined) target[field] = source[field];
  });
  return target;
};

const ensureOrgScopedSite = async ({ orgId, siteId }) => {
  if (!siteId) return null;
  const site = await OrgSite.findOne({ _id: siteId, orgId }).lean();
  if (!site) {
    const error = new Error("Selected site does not belong to this organization");
    error.status = 400;
    throw error;
  }
  return site;
};

const ensureOrgScopedUnit = async ({ orgId, orgUnitId }) => {
  if (!orgUnitId) return null;
  const unit = await OrgUnit.findOne({ _id: orgUnitId, orgId }).lean();
  if (!unit) {
    const error = new Error("Selected department / unit does not belong to this organization");
    error.status = 400;
    throw error;
  }
  return unit;
};

const ensureTenantScopedUser = async ({ tenantId, userId, message = "Selected user is not part of this tenant" }) => {
  if (!userId) return null;
  const user = await User.findOne({ _id: userId, tenant_id: tenantId }).select("_id email role status adminScope").lean();
  if (!user) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
  return user;
};

const enforceSinglePrimaryAssignment = async ({ assignmentId = null, tenantId, orgId, userId, isPrimary }) => {
  if (!tenantId || !orgId || !userId || !isPrimary) return;
  const query = { tenantId, orgId, userId, isPrimary: true };
  if (assignmentId) query._id = { $ne: assignmentId };
  await OrgUserAssignment.updateMany(query, { $set: { isPrimary: false, updatedAt: new Date() } });
};

const buildUniqueDirectoryKey = async (legalName, country = "") => {
  const baseKey = buildDirectoryKey(legalName, country);
  let candidate = baseKey;
  let suffix = 1;
  while (await Organization.exists({ directoryKey: candidate })) {
    candidate = `${baseKey}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

export const searchOrganizations = async (req, res) => {
  try {
    const search = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const query = {};
    if (status) query.status = status;

    if (String(req.query.managedOnly || "").toLowerCase() === "true") {
      const managedOrgIds = await OrgPermissionService.listManagedOrgIds({
        tenantId: req.tenantId,
        user: req.user,
      });
      if (Array.isArray(managedOrgIds)) {
        query._id = { $in: managedOrgIds };
      }
    }

    if (search) {
      query.$or = [
        { legalName: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { normalizedLegalName: { $regex: search.toLowerCase(), $options: "i" } },
      ];
    }
    const organizations = await Organization.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
    return res.json({ organizations });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id).lean();
    if (!organization) return res.status(404).json({ error: "Organization not found" });
    return res.json({ organization });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createOrganization = async (req, res) => {
  try {
    const legalName = String(req.body.legalName || "").trim();
    const displayName = String(req.body.displayName || legalName).trim();
    const country = String(req.body?.headquarters?.country || "").trim();
    const normalizedLegalName = normalizeOrgName(legalName);

    const existing = await Organization.findOne({ normalizedLegalName, ...(country ? { "headquarters.country": country } : {}) }).lean();
    if (existing) {
      return res.status(200).json({ organization: existing, created: false, matchedExisting: true });
    }

    const organization = await Organization.create({
      directoryKey: await buildUniqueDirectoryKey(legalName, country),
      legalName,
      normalizedLegalName,
      displayName,
      status: req.body.status || "ACTIVE",
      entityTypes: Array.isArray(req.body.entityTypes) ? req.body.entityTypes : [],
      supplyChainRoles: Array.isArray(req.body.supplyChainRoles) ? req.body.supplyChainRoles : [],
      website: req.body.website || "",
      domains: Array.isArray(req.body.domains) ? req.body.domains : [],
      headquarters: req.body.headquarters || {},
      identifiers: req.body.identifiers || {},
      contactPoints: Array.isArray(req.body.contactPoints) ? req.body.contactPoints : [],
      sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
      legacyRefs: req.body.legacyRefs || {},
      metadata: req.body.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    let claim = null;
    if (req.body.claimForCurrentTenant && req.tenantId) {
      if (req.body.isPrimary) {
        await OrgClaim.updateMany({ tenantId: req.tenantId, status: "ACTIVE" }, { $set: { isPrimary: false } });
      }
      claim = await OrgClaim.findOneAndUpdate(
        { tenantId: req.tenantId, orgId: organization._id },
        {
          $set: {
            claimType: req.body.claimType || "PRIMARY",
            status: "ACTIVE",
            confidence: req.body.confidence ?? 1,
            isPrimary: Boolean(req.body.isPrimary ?? true),
            approvedByUserId: req.user?._id || null,
            approvedAt: new Date(),
            updatedAt: new Date(),
          },
          $setOnInsert: {
            claimedByUserId: req.user?._id || null,
            sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
          },
        },
        { new: true, upsert: true }
      ).lean();
    }

    return res.status(201).json({ organization, claim, created: true });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Organization already exists" });
    }
    return res.status(500).json({ error: error.message });
  }
};

export const updateOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) return res.status(404).json({ error: "Organization not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: organization._id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage this organization",
    });

    const next = pick(req.body, [
      "displayName",
      "status",
      "entityTypes",
      "supplyChainRoles",
      "website",
      "domains",
      "headquarters",
      "identifiers",
      "contactPoints",
      "sourceRefs",
      "legacyRefs",
      "metadata",
    ]);

    if (req.body.legalName !== undefined) {
      next.legalName = String(req.body.legalName || "").trim();
      next.normalizedLegalName = normalizeOrgName(next.legalName);
      if (next.headquarters?.country || organization.headquarters?.country) {
        next.directoryKey = await buildUniqueDirectoryKey(next.legalName, next.headquarters?.country || organization.headquarters?.country || "");
      }
    }

    Object.assign(organization, next, { updatedBy: req.user?._id || null });
    await organization.save();
    return res.json({ organization });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listManagedOrganizations = async (req, res) => {
  try {
    if (OrgPermissionService.isGlobalOrgAdmin(req.user)) {
      const organizations = await Organization.find({}).sort({ legalName: 1 }).lean();
      return res.json({ organizations, claims: [] });
    }

    const claims = await OrgClaim.find({ tenantId: req.tenantId, status: "ACTIVE" })
      .populate("orgId")
      .sort({ isPrimary: -1, updatedAt: -1 })
      .lean();

    const organizations = claims.map((claim) => claim.orgId).filter(Boolean);
    return res.json({ organizations, claims });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const listOrgClaims = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.tenantId;
    const query = tenantId ? { tenantId } : {};
    const claims = await OrgClaim.find(query)
      .populate("orgId")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ claims });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createOrgClaim = async (req, res) => {
  try {
    const tenantId = req.body.tenantId || req.tenantId;
    const orgId = toObjectId(req.body.orgId);
    if (!tenantId || !orgId) {
      return res.status(400).json({ error: "tenantId and orgId are required" });
    }
    const existing = await OrgClaim.findOne({ tenantId, orgId });
    if (existing) return res.status(200).json({ claim: existing, created: false });

    const claim = await OrgClaim.create({
      orgId,
      tenantId,
      claimType: req.body.claimType || "PRIMARY",
      status: "PENDING",
      confidence: req.body.confidence ?? 1,
      isPrimary: Boolean(req.body.isPrimary),
      claimedByUserId: req.user?._id || null,
      sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
    });
    return res.status(201).json({ claim, created: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const approveOrgClaim = async (req, res) => {
  try {
    const claim = await OrgClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ error: "Claim not found" });

    claim.status = req.body.status;
    claim.approvedByUserId = req.user?._id || null;
    claim.approvedAt = new Date();
    if (req.body.status === "ACTIVE" && claim.isPrimary) {
      await OrgClaim.updateMany(
        { tenantId: claim.tenantId, _id: { $ne: claim._id } },
        { $set: { isPrimary: false } }
      );
    }
    await claim.save();
    return res.json({ claim });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const listOrgSites = async (req, res) => {
  try {
    const query = { orgId: req.params.id };
    if (req.query.status) query.status = req.query.status;
    if (req.query.q) {
      query.$or = [
        { siteName: { $regex: String(req.query.q), $options: "i" } },
        { normalizedSiteName: { $regex: normalizeOrgName(req.query.q), $options: "i" } },
      ];
    }
    const sites = await OrgSite.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ sites });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createOrgSite = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage sites for this organization",
    });

    const siteName = String(req.body.siteName || "").trim();
    const site = await OrgSite.create({
      orgId: req.params.id,
      siteKey: `ORG-SITE-${Date.now()}-${String(req.params.id).slice(-6)}`,
      siteName,
      normalizedSiteName: normalizeOrgName(siteName),
      siteType: req.body.siteType || "OTHER",
      status: req.body.status || "ACTIVE",
      address: req.body.address || {},
      regulatoryIds: req.body.regulatoryIds || {},
      gxpScopes: Array.isArray(req.body.gxpScopes) ? req.body.gxpScopes : [],
      contactName: req.body.contactName || "",
      contactEmail: req.body.contactEmail || "",
      contactPhone: req.body.contactPhone || "",
      sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
      legacyRefs: req.body.legacyRefs || {},
      metadata: req.body.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ site });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const updateOrgSite = async (req, res) => {
  try {
    const site = await OrgSite.findById(req.params.siteId);
    if (!site) return res.status(404).json({ error: "Site not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: site.orgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage sites for this organization",
    });

    const next = pick(req.body, [
      "siteType",
      "status",
      "address",
      "regulatoryIds",
      "gxpScopes",
      "contactName",
      "contactEmail",
      "contactPhone",
      "sourceRefs",
      "legacyRefs",
      "metadata",
    ]);
    if (req.body.siteName !== undefined) {
      next.siteName = String(req.body.siteName || "").trim();
      next.normalizedSiteName = normalizeOrgName(next.siteName);
    }
    Object.assign(site, next, { updatedBy: req.user?._id || null });
    await site.save();
    return res.json({ site });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listOrgUnits = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot view units for this organization",
    });

    const query = { orgId: req.params.id };
    if (req.query.siteId) query.siteId = req.query.siteId;
    if (req.query.status) query.status = req.query.status;
    const units = await OrgUnit.find(query).sort({ path: 1, name: 1 }).lean();
    return res.json({ units });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const createOrgUnit = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage units for this organization",
    });

    const name = String(req.body.name || "").trim();
    const siteId = toObjectId(req.body.siteId) || null;
    const parentUnitId = toObjectId(req.body.parentUnitId) || null;
    const pathSegments = [req.params.id, siteId ? String(siteId) : null, name].filter(Boolean);

    const unit = await OrgUnit.create({
      orgId: req.params.id,
      parentUnitId,
      siteId,
      unitType: req.body.unitType || "OTHER",
      name,
      path: pathSegments.join("/"),
      status: req.body.status || "ACTIVE",
      sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
      legacyRefs: req.body.legacyRefs || {},
      metadata: req.body.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ unit });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const updateOrgUnit = async (req, res) => {
  try {
    const unit = await OrgUnit.findById(req.params.unitId);
    if (!unit) return res.status(404).json({ error: "Unit not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: unit.orgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage units for this organization",
    });

    const next = pick(req.body, [
      "unitType",
      "status",
      "sourceRefs",
      "legacyRefs",
      "metadata",
    ]);
    if (req.body.name !== undefined) next.name = String(req.body.name || "").trim();
    if (req.body.parentUnitId !== undefined) next.parentUnitId = toObjectId(req.body.parentUnitId) || null;
    if (req.body.siteId !== undefined) next.siteId = toObjectId(req.body.siteId) || null;
    next.path = [String(unit.orgId), next.siteId ? String(next.siteId) : null, next.name || unit.name].filter(Boolean).join("/");

    Object.assign(unit, next, { updatedBy: req.user?._id || null });
    await unit.save();
    return res.json({ unit });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listAssignableTenantUsers = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage users for this organization",
    });

    const query = { tenant_id: req.tenantId };
    const search = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();

    if (status) query.status = status;
    if (search) query.email = { $regex: search, $options: "i" };

    const users = await User.find(query)
      .select("_id email role status adminScope createdAt")
      .sort({ email: 1 })
      .lean();

    return res.json({ users });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listOrgUserAssignments = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot view assignments for this organization",
    });

    const query = { tenantId: req.tenantId, orgId: req.params.id };
    if (req.query.status) query.status = req.query.status;
    if (req.query.siteId) query.siteId = req.query.siteId;
    if (req.query.orgUnitId) query.orgUnitId = req.query.orgUnitId;
    if (req.query.userId) query.userId = req.query.userId;

    const assignments = await OrgUserAssignment.find(query)
      .populate("userId", "_id email role status adminScope")
      .populate("siteId", "_id siteName siteType status")
      .populate("orgUnitId", "_id name unitType status siteId")
      .populate("managerUserId", "_id email role")
      .sort({ isPrimary: -1, updatedAt: -1 })
      .lean();

    return res.json({ assignments });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const createOrgUserAssignment = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.params.id,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage assignments for this organization",
    });

    const userId = toObjectId(req.body.userId);
    const siteId = toObjectId(req.body.siteId);
    const orgUnitId = toObjectId(req.body.orgUnitId);
    const managerUserId = toObjectId(req.body.managerUserId);
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    await ensureTenantScopedUser({ tenantId: req.tenantId, userId });
    await ensureOrgScopedSite({ orgId: req.params.id, siteId });
    const unit = await ensureOrgScopedUnit({ orgId: req.params.id, orgUnitId });
    if (unit?.siteId && siteId && String(unit.siteId) !== String(siteId)) {
      return res.status(400).json({ error: "Selected department / unit does not belong to the selected site" });
    }
    if (managerUserId) {
      await ensureTenantScopedUser({
        tenantId: req.tenantId,
        userId: managerUserId,
        message: "Selected manager is not part of this tenant",
      });
    }

    await enforceSinglePrimaryAssignment({
      tenantId: req.tenantId,
      orgId: req.params.id,
      userId,
      isPrimary: Boolean(req.body.isPrimary),
    });

    const assignment = await OrgUserAssignment.create({
      tenantId: req.tenantId,
      orgId: req.params.id,
      userId,
      siteId,
      orgUnitId,
      managerUserId,
      orgRole: req.body.orgRole || "MEMBER",
      assignmentType: req.body.assignmentType || "PRIMARY",
      businessFunction: req.body.businessFunction || "OTHER",
      title: String(req.body.title || "").trim(),
      isPrimary: Boolean(req.body.isPrimary),
      status: req.body.status || "ACTIVE",
      startDate: req.body.startDate || null,
      endDate: req.body.endDate || null,
      sourceRefs: Array.isArray(req.body.sourceRefs) ? req.body.sourceRefs : [],
      metadata: req.body.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    const hydratedAssignment = await OrgUserAssignment.findById(assignment._id)
      .populate("userId", "_id email role status adminScope")
      .populate("siteId", "_id siteName siteType status")
      .populate("orgUnitId", "_id name unitType status siteId")
      .populate("managerUserId", "_id email role")
      .lean();

    return res.status(201).json({ assignment: hydratedAssignment });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "This assignment already exists" });
    }
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const updateOrgUserAssignment = async (req, res) => {
  try {
    const assignment = await OrgUserAssignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: assignment.orgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage assignments for this organization",
    });

    const next = pick(req.body, [
      "orgRole",
      "assignmentType",
      "businessFunction",
      "status",
      "title",
      "startDate",
      "endDate",
      "sourceRefs",
      "metadata",
    ]);

    if (req.body.userId !== undefined) {
      const userId = toObjectId(req.body.userId);
      if (!userId) return res.status(400).json({ error: "Invalid userId" });
      await ensureTenantScopedUser({ tenantId: req.tenantId, userId });
      next.userId = userId;
    }

    if (req.body.siteId !== undefined) {
      const siteId = toObjectId(req.body.siteId);
      await ensureOrgScopedSite({ orgId: assignment.orgId, siteId });
      next.siteId = siteId;
    }

    if (req.body.orgUnitId !== undefined) {
      const orgUnitId = toObjectId(req.body.orgUnitId);
      const unit = await ensureOrgScopedUnit({ orgId: assignment.orgId, orgUnitId });
      const effectiveSiteId = next.siteId !== undefined ? next.siteId : assignment.siteId;
      if (unit?.siteId && effectiveSiteId && String(unit.siteId) !== String(effectiveSiteId)) {
        return res.status(400).json({ error: "Selected department / unit does not belong to the selected site" });
      }
      next.orgUnitId = orgUnitId;
    }

    if (req.body.managerUserId !== undefined) {
      const managerUserId = toObjectId(req.body.managerUserId);
      if (managerUserId) {
        await ensureTenantScopedUser({
          tenantId: req.tenantId,
          userId: managerUserId,
          message: "Selected manager is not part of this tenant",
        });
      }
      next.managerUserId = managerUserId;
    }

    if (req.body.isPrimary !== undefined) {
      next.isPrimary = Boolean(req.body.isPrimary);
      await enforceSinglePrimaryAssignment({
        assignmentId: assignment._id,
        tenantId: req.tenantId,
        orgId: assignment.orgId,
        userId: next.userId || assignment.userId,
        isPrimary: next.isPrimary,
      });
    }

    Object.assign(assignment, next, { updatedBy: req.user?._id || null });
    await assignment.save();

    const hydratedAssignment = await OrgUserAssignment.findById(assignment._id)
      .populate("userId", "_id email role status adminScope")
      .populate("siteId", "_id siteName siteType status")
      .populate("orgUnitId", "_id name unitType status siteId")
      .populate("managerUserId", "_id email role")
      .lean();

    return res.json({ assignment: hydratedAssignment });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "This assignment already exists" });
    }
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const resolveAuditContextPreview = async (req, res) => {
  try {
    const context = await OrgResolutionService.resolveAuditContext({
      tenantId: req.tenantId,
      buyerUserId: req.query.buyerUserId || req.user?._id || null,
      supplierUserId: req.query.supplierUserId || null,
      auditorUserId: req.query.auditorUserId || null,
      buyerOrgId: req.query.buyerOrgId || null,
      supplierOrgId: req.query.supplierOrgId || null,
      engagementId: req.query.engagementId || null,
      qualificationCaseId: req.query.qualificationCaseId || null,
      actorUserId: req.user?._id || null,
    });
    return res.json({ context });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const getMyResolvedOrganization = async (req, res) => {
  try {
    let organization = await OrgResolutionService.resolveTenantOrganization({
      tenantId: req.tenantId,
      actorUserId: req.user?._id || null,
    });

    if (!organization && req.user?.role === "buyer") {
      const profile = await BuyerProfile.findOne({ user_id: req.user._id }).lean();
      if (profile?.companyName) {
        organization = await OrgResolutionService.resolveBuyerOrg({
          buyerUserId: req.user._id,
          tenantId: req.tenantId,
          actorUserId: req.user._id,
        });
      }
    }

    if (!organization && ["supplier", "supplierUser"].includes(String(req.user?.role || ""))) {
      const profile = await SupplierProfile.findOne({ user_id: req.user._id }).lean();
      if (profile?.companyName) {
        organization = await OrgResolutionService.resolveSupplierOrg({
          supplierUserId: req.user._id,
          actorUserId: req.user._id,
        });
      }
    }

    return res.json({ organization: organization || null });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
