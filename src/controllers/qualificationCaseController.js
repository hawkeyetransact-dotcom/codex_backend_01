import { QualificationCase, QualificationMethod } from "../models/qualificationModels.js";
import { OrgPermissionService } from "../services/orgDirectory/orgPermissionService.js";
import { EngagementAccessService } from "../services/orgDirectory/engagementAccessService.js";

const canAccessQualificationCase = async ({ qualificationCase, req }) => {
  if (!qualificationCase) return false;
  if (OrgPermissionService.isGlobalOrgAdmin(req.user)) return true;
  if (String(qualificationCase.ownerTenantId) === String(req.tenantId)) return true;
  if (qualificationCase.engagementId) {
    return EngagementAccessService.canAccessEngagement({
      engagementId: qualificationCase.engagementId,
      user: req.user,
      tenantId: req.tenantId,
    });
  }
  return false;
};

export const listQualificationCases = async (req, res) => {
  try {
    const query = {};
    if (req.query.engagementId) query.engagementId = req.query.engagementId;
    if (req.query.status) query.status = req.query.status;
    if (req.query.buyerOrgId) query.buyerOrgId = req.query.buyerOrgId;
    if (req.query.supplierOrgId) query.supplierOrgId = req.query.supplierOrgId;

    if (!OrgPermissionService.isGlobalOrgAdmin(req.user)) {
      const accessibleOrgIds = await EngagementAccessService.resolveAccessibleOrgIds({
        user: req.user,
        tenantId: req.tenantId,
      });
      query.$or = [
        { ownerTenantId: req.tenantId },
        { buyerOrgId: { $in: accessibleOrgIds } },
        { supplierOrgId: { $in: accessibleOrgIds } },
      ];
    }

    const qualificationCases = await QualificationCase.find(query)
      .populate("buyerOrgId", "legalName displayName")
      .populate("supplierOrgId", "legalName displayName")
      .populate("engagementId", "engagementCode status")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ qualificationCases });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createQualificationCase = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.body.buyerOrgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot create qualification cases for this buyer organization",
    });

    if (req.body.engagementId) {
      const canAccess = await EngagementAccessService.canAccessEngagement({
        engagementId: req.body.engagementId,
        user: req.user,
        tenantId: req.tenantId,
      });
      if (!canAccess) return res.status(403).json({ error: "Invalid engagement context" });
    }

    const qualificationCase = await QualificationCase.create({
      qualificationCode: `QUAL-${Date.now()}-${String(req.body.supplierOrgId).slice(-4)}`,
      ownerTenantId: req.tenantId,
      buyerOrgId: req.body.buyerOrgId,
      supplierOrgId: req.body.supplierOrgId,
      engagementId: req.body.engagementId || null,
      criticality: req.body.criticality || "MEDIUM",
      riskBand: req.body.riskBand || "MEDIUM",
      decision: req.body.decision || "PENDING",
      status: req.body.status || "DRAFT",
      scope: req.body.scope || {},
      approvedScope: req.body.approvedScope || {},
      requalDueDate: req.body.requalDueDate || null,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ qualificationCase });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const getQualificationCase = async (req, res) => {
  try {
    const qualificationCase = await QualificationCase.findById(req.params.id)
      .populate("buyerOrgId", "legalName displayName")
      .populate("supplierOrgId", "legalName displayName")
      .populate("engagementId", "engagementCode status")
      .lean();
    if (!(await canAccessQualificationCase({ qualificationCase, req }))) {
      return res.status(404).json({ error: "Qualification case not found" });
    }
    const methods = await QualificationMethod.find({ qualificationCaseId: req.params.id }).sort({ createdAt: 1 }).lean();
    return res.json({ qualificationCase, methods });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateQualificationCase = async (req, res) => {
  try {
    const qualificationCase = await QualificationCase.findById(req.params.id);
    if (!qualificationCase) return res.status(404).json({ error: "Qualification case not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: qualificationCase.buyerOrgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot update this qualification case",
    });

    Object.assign(qualificationCase, {
      criticality: req.body.criticality ?? qualificationCase.criticality,
      riskBand: req.body.riskBand ?? qualificationCase.riskBand,
      decision: req.body.decision ?? qualificationCase.decision,
      status: req.body.status ?? qualificationCase.status,
      scope: req.body.scope ?? qualificationCase.scope,
      approvedScope: req.body.approvedScope ?? qualificationCase.approvedScope,
      requalDueDate: req.body.requalDueDate ?? qualificationCase.requalDueDate,
      legacyRefs: req.body.legacyRefs ?? qualificationCase.legacyRefs,
      updatedBy: req.user?._id || null,
    });
    await qualificationCase.save();
    return res.json({ qualificationCase });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listQualificationMethods = async (req, res) => {
  try {
    const qualificationCase = await QualificationCase.findById(req.params.id).lean();
    if (!(await canAccessQualificationCase({ qualificationCase, req }))) {
      return res.status(404).json({ error: "Qualification case not found" });
    }
    const methods = await QualificationMethod.find({ qualificationCaseId: req.params.id }).sort({ createdAt: 1 }).lean();
    return res.json({ methods });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createQualificationMethod = async (req, res) => {
  try {
    const qualificationCase = await QualificationCase.findById(req.params.id).lean();
    if (!qualificationCase) return res.status(404).json({ error: "Qualification case not found" });

    await OrgPermissionService.assertManageOrganization({
      orgId: qualificationCase.buyerOrgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot add methods to this qualification case",
    });

    const method = await QualificationMethod.create({
      qualificationCaseId: req.params.id,
      methodType: req.body.methodType,
      status: req.body.status || "PLANNED",
      rationale: req.body.rationale || "",
      outcome: req.body.outcome || "",
      performedByUserId: req.user?._id || null,
      evidenceRefs: Array.isArray(req.body.evidenceRefs) ? req.body.evidenceRefs : [],
    });
    return res.status(201).json({ method });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

