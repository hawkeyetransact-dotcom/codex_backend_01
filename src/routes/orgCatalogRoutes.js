import express from "express";
import { authenticate, requireTenantActiveOrPlatformAdmin } from "../middlewares/authMiddleware.js";
import { requireFeatureEnabled } from "../middlewares/featureFlagMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  createMarketplaceListing,
  createOrgCatalogItem,
  listMarketplaceListings,
  listOrgCatalogItems,
} from "../controllers/orgCatalogController.js";
import {
  createMarketplaceListingValidator,
  createOrgCatalogItemValidator,
} from "../validators/orgDirectoryValidators.js";
import { isFeatureEnabledForTenant } from "../services/orgDirectory/featureGate.js";

const router = express.Router();

router.use(authenticate, requireTenantActiveOrPlatformAdmin);
router.use(
  requireFeatureEnabled((req) => isFeatureEnabledForTenant("ORG_MARKETPLACE_ENABLED", req.tenantId))
);

router.get("/items", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), listOrgCatalogItems);
router.post("/items", permit("supplier", "supplierUser", "tenant_admin", "admin", "superadmin"), validate(createOrgCatalogItemValidator), createOrgCatalogItem);
router.get("/listings", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), listMarketplaceListings);
router.post("/listings", permit("supplier", "supplierUser", "tenant_admin", "admin", "superadmin"), validate(createMarketplaceListingValidator), createMarketplaceListing);

export default router;
