import mongoose from "mongoose";
import { Engagement, EngagementParticipant } from "../models/engagementModels.js";
import { OrgPermissionService } from "../services/orgDirectory/orgPermissionService.js";
import { EngagementAccessService } from "../services/orgDirectory/engagementAccessService.js";

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

export const listEngagements = async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.buyerOrgId) query.buyerOrgId = req.query.buyerOrgId;
    if (req.query.supplierOrgId) query.supplierOrgId = req.query.supplierOrgId;

    if (!OrgPermissionService.isGlobalOrgAdmin(req.user) && !["admin", "superadmin", "tenant_admin"].includes(role)) {
      const accessibleOrgIds = await EngagementAccessService.resolveAccessibleOrgIds({
        user: req.user,
        tenantId: req.tenantId,
      });
      query.$or = [
        { ownerTenantId: req.tenantId },
        { buyerOrgId: { $in: accessibleOrgIds } },
        { supplierOrgId: { $in: accessibleOrgIds } },
      ];
    } else if (!OrgPermissionService.isGlobalOrgAdmin(req.user)) {
      query.ownerTenantId = req.tenantId;
    }

    const engagements = await Engagement.find(query)
      .populate("buyerOrgId", "legalName displayName supplyChainRoles")
      .populate("supplierOrgId", "legalName displayName supplyChainRoles")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ engagements });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createEngagement = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.body.buyerOrgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot create engagements for this buyer organization",
    });

    if (String(req.body.buyerOrgId) === String(req.body.supplierOrgId)) {
      return res.status(400).json({ error: "buyerOrgId and supplierOrgId must be different" });
    }

    const engagement = await Engagement.create({
      engagementCode: `ENG-${Date.now()}-${String(req.body.buyerOrgId).slice(-4)}${String(req.body.supplierOrgId).slice(-4)}`,
      ownerTenantId: req.tenantId,
      buyerOrgId: req.body.buyerOrgId,
      supplierOrgId: req.body.supplierOrgId,
      status: req.body.status || "ACTIVE",
      scope: req.body.scope || {},
      visibilityPolicy: req.body.visibilityPolicy || {},
      startDate: req.body.startDate || null,
      endDate: req.body.endDate || null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    await EngagementParticipant.insertMany([
      {
        engagementId: engagement._id,
        participantType: "TENANT",
        tenantId: req.tenantId,
        orgId: toObjectId(req.body.buyerOrgId),
        role: "BUYER_OWNER",
        permissions: ["manage", "read", "write"],
        status: "ACTIVE",
        createdBy: req.user?._id || null,
        updatedBy: req.user?._id || null,
      },
      {
        engagementId: engagement._id,
        participantType: "ORG",
        orgId: toObjectId(req.body.supplierOrgId),
        role: "SUPPLIER_OWNER",
        permissions: ["read"],
        status: "ACTIVE",
        createdBy: req.user?._id || null,
        updatedBy: req.user?._id || null,
      },
    ]);

    return res.status(201).json({ engagement });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const getEngagement = async (req, res) => {
  try {
    const canAccess = await EngagementAccessService.canAccessEngagement({
      engagementId: req.params.id,
      user: req.user,
      tenantId: req.tenantId,
    });
    if (!canAccess) return res.status(404).json({ error: "Engagement not found" });

    const [engagement, participants] = await Promise.all([
      Engagement.findById(req.params.id)
        .populate("buyerOrgId", "legalName displayName supplyChainRoles")
        .populate("supplierOrgId", "legalName displayName supplyChainRoles")
        .lean(),
      EngagementParticipant.find({ engagementId: req.params.id, status: { $ne: "REVOKED" } })
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    return res.json({ engagement, participants });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const addEngagementParticipant = async (req, res) => {
  try {
    const canManage = await EngagementAccessService.canManageEngagement({
      engagementId: req.params.id,
      user: req.user,
      tenantId: req.tenantId,
    });
    if (!canManage) return res.status(403).json({ error: "Forbidden" });

    const participant = await EngagementParticipant.create({
      engagementId: req.params.id,
      participantType: req.body.participantType,
      tenantId: req.body.tenantId || null,
      orgId: req.body.orgId || null,
      userId: req.body.userId || null,
      role: req.body.role,
      permissions: req.body.permissions || [],
      accessStartsAt: req.body.accessStartsAt || null,
      accessExpiresAt: req.body.accessExpiresAt || null,
      assignmentScope: req.body.assignmentScope || {},
      status: "ACTIVE",
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ participant });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Participant already exists" });
    }
    return res.status(500).json({ error: error.message });
  }
};

