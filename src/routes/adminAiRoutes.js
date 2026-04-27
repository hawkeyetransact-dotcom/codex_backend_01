/**
 * Admin Panel · AI Agents — routes.
 * Mounted at /api/admin/ai
 */
import { Router } from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  getUsage,
  getRoi,
  getPermissions,
  putPermissions,
  getCatalog,
  postAcceptUsage,
} from "../controllers/adminAiController.js";

const router = Router();

const ADMIN_ROLES = ["tenant_admin", "buyer_admin", "superadmin", "admin", "auditor_admin"];
const READ_ROLES = [...ADMIN_ROLES, "qa_head", "vp_quality", "audit_lead"];

router.get("/usage",                    authenticate, requireTenantActive, permit(...READ_ROLES),  getUsage);
router.get("/roi",                      authenticate, requireTenantActive, permit(...READ_ROLES),  getRoi);
router.get("/permissions",              authenticate, requireTenantActive, permit(...ADMIN_ROLES), getPermissions);
router.put("/permissions",              authenticate, requireTenantActive, permit(...ADMIN_ROLES), putPermissions);
router.get("/catalog",                  authenticate, requireTenantActive, getCatalog);
router.post("/usage/:eventId/accept",   authenticate, requireTenantActive, postAcceptUsage);

export default router;
