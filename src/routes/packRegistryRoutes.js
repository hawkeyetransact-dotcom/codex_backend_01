import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  requirePharmaPackEnabled,
  requireWorkflowOsEnabled,
} from "../middlewares/workflowFlagsMiddleware.js";
import {
  importPackTemplates,
  installPack,
  listPacks,
} from "../controllers/packRegistryController.js";

const router = express.Router();

router.use(requireWorkflowOsEnabled, authenticate, requireTenantActive);

router.get(
  "/",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listPacks
);
router.post(
  "/install",
  requirePharmaPackEnabled,
  permit("admin", "tenant_admin", "superadmin"),
  installPack
);
router.post(
  "/:id/templates/import",
  requirePharmaPackEnabled,
  permit("admin", "tenant_admin", "superadmin"),
  importPackTemplates
);

export default router;
