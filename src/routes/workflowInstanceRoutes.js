import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireWorkflowOsEnabled } from "../middlewares/workflowFlagsMiddleware.js";
import {
  createWorkflowInstance,
  getWorkflowInstance,
  submitWorkflowInstanceEvent,
} from "../controllers/workflowInstanceController.js";

const router = express.Router();

router.use(requireWorkflowOsEnabled, authenticate, requireTenantActive);

router.post(
  "/instances",
  permit("buyer", "auditor", "admin", "tenant_admin", "superadmin"),
  createWorkflowInstance
);
router.get(
  "/instances/:id",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  getWorkflowInstance
);
router.post(
  "/instances/:id/events",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  submitWorkflowInstanceEvent
);

export default router;
