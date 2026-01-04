import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { requireTenantAdmin, resolveTenant } from "../middlewares/tenantMiddleware.js";
import {
  getCompany,
  updateCompany,
  listTenantUsers,
  inviteUser,
  updateTenantUser,
  disableUser,
  enableUser,
  listTenantAuditLogs,
} from "../controllers/tenantAdminController.js";

const router = express.Router();

router.use(authenticate, resolveTenant, requireTenantAdmin);

router.get("/company", getCompany);
router.patch("/company", updateCompany);

router.get("/users", listTenantUsers);
router.post("/users/invite", inviteUser);
router.patch("/users/:userId", updateTenantUser);
router.post("/users/:userId/disable", disableUser);
router.post("/users/:userId/enable", enableUser);

router.get("/audit-logs", listTenantAuditLogs);

export default router;
