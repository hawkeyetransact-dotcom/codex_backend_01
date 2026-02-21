import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireWorkflowOsEnabled } from "../middlewares/workflowFlagsMiddleware.js";
import {
  createWorkflowDefinition,
  listWorkflowDefinitions,
  listWorkflowDefinitionVersions,
  publishWorkflowDefinition,
} from "../controllers/workflowDefinitionController.js";

const router = express.Router();

router.use(requireWorkflowOsEnabled, authenticate, requireTenantActive);

router.post(
  "/definitions",
  permit("admin", "tenant_admin", "superadmin"),
  createWorkflowDefinition
);
router.get(
  "/definitions",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listWorkflowDefinitions
);
router.get(
  "/definitions/:id/versions",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listWorkflowDefinitionVersions
);
router.post(
  "/definitions/:id/publish",
  permit("admin", "tenant_admin", "superadmin"),
  publishWorkflowDefinition
);

export default router;
