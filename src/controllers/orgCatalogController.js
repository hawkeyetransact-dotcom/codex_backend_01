import { MarketplaceListing, OrgCatalogItem } from "../models/orgDiscoveryModels.js";
import { OrgPermissionService } from "../services/orgDirectory/orgPermissionService.js";
import { normalizeOrgName } from "../services/orgDirectory/orgResolutionService.js";

const applyVisibilityFilter = async ({ req, query, orgId }) => {
  const canManage = orgId
    ? await OrgPermissionService.canManageOrganization({ orgId, tenantId: req.tenantId, user: req.user })
    : OrgPermissionService.isGlobalOrgAdmin(req.user);

  if (canManage) return;

  if (!req.query.status) {
    query.status = "ACTIVE";
  }
  if (!req.query.visibility) {
    query.visibility = { $in: ["PUBLIC", "RESTRICTED"] };
  }
};

export const listOrgCatalogItems = async (req, res) => {
  try {
    const query = {};
    const orgId = req.query.orgId || null;
    if (orgId) query.orgId = orgId;
    if (req.query.catalogType) query.catalogType = req.query.catalogType;
    if (req.query.visibility) query.visibility = req.query.visibility;
    if (req.query.status) query.status = req.query.status;
    await applyVisibilityFilter({ req, query, orgId });

    const items = await OrgCatalogItem.find(query)
      .populate("orgId", "legalName displayName supplyChainRoles")
      .populate("siteIds", "siteName siteType status")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createOrgCatalogItem = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.body.orgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage catalog items for this organization",
    });

    const item = await OrgCatalogItem.create({
      ...req.body,
      normalizedName: normalizeOrgName(req.body.name),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ item });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "Catalog item already exists" });
    }
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

export const listMarketplaceListings = async (req, res) => {
  try {
    const query = {};
    const orgId = req.query.orgId || null;
    if (orgId) query.orgId = orgId;
    if (req.query.visibility) query.visibility = req.query.visibility;
    if (req.query.status) query.status = req.query.status;
    await applyVisibilityFilter({ req, query, orgId });

    const listings = await MarketplaceListing.find(query)
      .populate("orgId", "legalName displayName supplyChainRoles")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ listings });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createMarketplaceListing = async (req, res) => {
  try {
    await OrgPermissionService.assertManageOrganization({
      orgId: req.body.orgId,
      tenantId: req.tenantId,
      user: req.user,
      message: "You cannot manage marketplace listings for this organization",
    });

    const listing = await MarketplaceListing.create({
      ...req.body,
      ownerTenantId: req.tenantId,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ listing });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
};

