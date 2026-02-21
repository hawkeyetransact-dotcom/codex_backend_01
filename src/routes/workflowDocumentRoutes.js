import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { requireWorkflowOsEnabled } from "../middlewares/workflowFlagsMiddleware.js";
import {
  createWorkflowDocument,
  tagWorkflowDocument,
} from "../controllers/workflowDocumentController.js";

const router = express.Router();

router.use(requireWorkflowOsEnabled, authenticate, requireTenantActive);

router.post(
  "/",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  createWorkflowDocument
);
router.post(
  "/:id/tag",
  permit("auditor", "buyer", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  tagWorkflowDocument
);

export default router;
