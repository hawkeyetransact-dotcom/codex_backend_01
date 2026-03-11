import express from "express";
import { authenticate, requireTenantActiveOrPlatformAdmin } from "../middlewares/authMiddleware.js";
import { requireFeatureEnabled } from "../middlewares/featureFlagMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  createQualificationCase,
  createQualificationMethod,
  getQualificationCase,
  listQualificationCases,
  listQualificationMethods,
  updateQualificationCase,
} from "../controllers/qualificationCaseController.js";
import {
  createQualificationCaseValidator,
  createQualificationMethodValidator,
  updateQualificationCaseValidator,
} from "../validators/orgDirectoryValidators.js";
import { isFeatureEnabledForTenant } from "../services/orgDirectory/featureGate.js";

const router = express.Router();

router.use(authenticate, requireTenantActiveOrPlatformAdmin);
router.use(
  requireFeatureEnabled((req) => isFeatureEnabledForTenant("QUALIFICATION_CASES_ENABLED", req.tenantId))
);

router.get("/", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), listQualificationCases);
router.post("/", permit("buyer", "tenant_admin", "admin", "superadmin"), validate(createQualificationCaseValidator), createQualificationCase);
router.get("/:id", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), getQualificationCase);
router.patch("/:id", permit("buyer", "tenant_admin", "admin", "superadmin"), validate(updateQualificationCaseValidator), updateQualificationCase);
router.get("/:id/methods", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), listQualificationMethods);
router.post("/:id/methods", permit("buyer", "auditor", "tenant_admin", "admin", "superadmin"), validate(createQualificationMethodValidator), createQualificationMethod);

export default router;

