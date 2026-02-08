import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  bootstrapComplianceDefaults,
  createComplianceStandard,
  getComplianceStandard,
  listComplianceStandards,
  updateComplianceStandard,
} from "../controllers/complianceStandardsController.js";

const router = express.Router();

router.get(
  "/",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listComplianceStandards
);

router.post(
  "/bootstrap/defaults",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  bootstrapComplianceDefaults
);

router.post(
  "/",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  createComplianceStandard
);

router.get(
  "/:standardKey/:version",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  getComplianceStandard
);

router.put(
  "/:standardKey/:version",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  updateComplianceStandard
);

export default router;
