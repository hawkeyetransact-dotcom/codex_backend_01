import express from "express";
import {
  getCompany,
  updateCompany,
  listUsers,
  inviteUser,
  disableUserTenant,
  createApproval,
  listApprovalTenant,
  tenantAuditLogs,
} from "../controllers/tenantAdminController.js";
import { authenticate, requireAdminScope, requireTenantActive } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.use(requireAdminScope(["TENANT", "PLATFORM"]));
router.use(requireTenantActive);

router.get("/admin/company", getCompany);
router.patch("/admin/company", updateCompany);

router.get("/admin/users", listUsers);
router.post("/admin/users/invite", inviteUser);
router.post("/admin/users/:id/disable", disableUserTenant);

router.post("/admin/approvals", createApproval);
router.get("/admin/approvals", listApprovalTenant);

router.get("/admin/audit-logs", tenantAuditLogs);

export default router;
