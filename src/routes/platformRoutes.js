import express from "express";
import {
  createTenant,
  listTenants,
  getTenant,
  updateTenant,
  suspendTenant,
  assignOwners,
  setSubscription,
  listApprovals,
  approveRequest,
  rejectRequest,
  globalUserSearch,
  disableUser,
  auditLogs,
} from "../controllers/platformController.js";
import { authenticate, requireAdminScope, requireTenantActive } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(authenticate);
router.use(requireAdminScope("PLATFORM"));

router.post("/platform/tenants", createTenant);
router.get("/platform/tenants", listTenants);
router.get("/platform/tenants/:id", getTenant);
router.patch("/platform/tenants/:id", updateTenant);
router.post("/platform/tenants/:id/suspend", suspendTenant);
router.post("/platform/tenants/:id/owners", assignOwners);
router.post("/platform/tenants/:id/subscription", setSubscription);

router.get("/platform/approvals", listApprovals);
router.post("/platform/approvals/:id/approve", approveRequest);
router.post("/platform/approvals/:id/reject", rejectRequest);

router.get("/platform/users", globalUserSearch);
router.post("/platform/users/:id/disable", disableUser);

router.get("/platform/audit-logs", auditLogs);

export default router;
