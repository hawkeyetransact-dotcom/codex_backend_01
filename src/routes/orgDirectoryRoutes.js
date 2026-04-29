import express from "express";
import { authenticate, requireTenantActiveOrPlatformAdmin } from "../middlewares/authMiddleware.js";
import { requireFeatureEnabled } from "../middlewares/featureFlagMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import * as orgDirectoryController from "../controllers/orgDirectoryController.js";
import {
  approveOrgClaimValidator,
  createOrganizationValidator,
  createOrgClaimValidator,
  createOrgSiteValidator,
  createOrgUnitValidator,
  createOrgUserAssignmentValidator,
  updateOrganizationValidator,
  updateOrgSiteValidator,
  updateOrgUnitValidator,
  updateOrgUserAssignmentValidator,
} from "../validators/orgDirectoryValidators.js";
import { isFeatureEnabledForTenant } from "../services/orgDirectory/featureGate.js";

const router = express.Router();

router.use(authenticate, requireTenantActiveOrPlatformAdmin);
router.use(
  requireFeatureEnabled((req) => isFeatureEnabledForTenant("ORG_DIRECTORY_ENABLED", req.tenantId))
);

router.get(
  "/organizations",
  permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.searchOrganizations
);
router.post(
  "/organizations",
  permit("tenant_admin", "admin", "superadmin"),
  validate(createOrganizationValidator),
  orgDirectoryController.createOrganization
);
router.get(
  "/organizations/:id",
  permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.getOrganization
);
router.patch(
  "/organizations/:id",
  permit("tenant_admin", "admin", "superadmin"),
  validate(updateOrganizationValidator),
  orgDirectoryController.updateOrganization
);
router.get(
  "/organizations/:id/sites",
  permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listOrgSites
);
router.post(
  "/organizations/:id/sites",
  permit("tenant_admin", "admin", "superadmin"),
  validate(createOrgSiteValidator),
  orgDirectoryController.createOrgSite
);
router.patch(
  "/sites/:siteId",
  permit("tenant_admin", "admin", "superadmin"),
  validate(updateOrgSiteValidator),
  orgDirectoryController.updateOrgSite
);
router.get(
  "/organizations/:id/units",
  permit("tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listOrgUnits
);
router.post(
  "/organizations/:id/units",
  permit("tenant_admin", "admin", "superadmin"),
  validate(createOrgUnitValidator),
  orgDirectoryController.createOrgUnit
);
router.patch(
  "/units/:unitId",
  permit("tenant_admin", "admin", "superadmin"),
  validate(updateOrgUnitValidator),
  orgDirectoryController.updateOrgUnit
);
router.get(
  "/organizations/:id/tenant-users",
  permit("tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listAssignableTenantUsers
);
router.get(
  "/organizations/:id/user-assignments",
  permit("tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listOrgUserAssignments
);
router.post(
  "/organizations/:id/user-assignments",
  permit("tenant_admin", "admin", "superadmin"),
  validate(createOrgUserAssignmentValidator),
  orgDirectoryController.createOrgUserAssignment
);
router.patch(
  "/user-assignments/:assignmentId",
  permit("tenant_admin", "admin", "superadmin"),
  validate(updateOrgUserAssignmentValidator),
  orgDirectoryController.updateOrgUserAssignment
);
router.get(
  "/claims",
  permit("tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listOrgClaims
);
router.post(
  "/claims",
  permit("tenant_admin", "admin", "superadmin"),
  validate(createOrgClaimValidator),
  orgDirectoryController.createOrgClaim
);
router.post(
  "/claims/:id/approve",
  permit("tenant_admin", "admin", "superadmin"),
  validate(approveOrgClaimValidator),
  orgDirectoryController.approveOrgClaim
);
router.get(
  "/me/managed-organizations",
  // BUG#4 fix: buyers (and other personas) need this endpoint to populate
  // the "Organization context" dropdown on the New Audit Request form.
  // Previously only admin roles could call it, leaving the dropdown empty.
  permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.listManagedOrganizations
);
router.get(
  "/me/resolved-organization",
  permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.getMyResolvedOrganization
);
router.get(
  "/resolutions/audit-context",
  permit("buyer", "auditor", "tenant_admin", "admin", "superadmin"),
  orgDirectoryController.resolveAuditContextPreview
);

export default router;
