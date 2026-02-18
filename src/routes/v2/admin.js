import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import {
  getActiveModuleConfig,
  getModuleConfig,
  updateModuleConfig,
  listStandards,
} from "../../controllers/v2/moduleAdminController.js";

const router = express.Router();

router.get(
  "/modules/active",
  authenticate,
  requireTenantActive,
  permit("buyer", "supplier", "supplierUser", "auditor", "admin", "tenant_admin", "superadmin"),
  getActiveModuleConfig
);
router.get("/admin/modules", authenticate, requireTenantActive, permit("admin", "tenant_admin", "superadmin"), getModuleConfig);
router.patch("/admin/modules", authenticate, requireTenantActive, permit("admin", "tenant_admin", "superadmin"), updateModuleConfig);
router.get("/admin/standards", authenticate, requireTenantActive, permit("admin", "tenant_admin", "superadmin"), listStandards);

export default router;
