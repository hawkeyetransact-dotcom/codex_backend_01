import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireWorkflowOsEnabled } from "../middlewares/workflowFlagsMiddleware.js";
import {
  completeWorkflowTask,
  listWorkflowTasks,
} from "../controllers/workflowTaskController.js";

const router = express.Router();

router.use(requireWorkflowOsEnabled, authenticate, requireTenantActive);

router.get(
  "/",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listWorkflowTasks
);
router.post(
  "/:id/complete",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  completeWorkflowTask
);

export default router;
