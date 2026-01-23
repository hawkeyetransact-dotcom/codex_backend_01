import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getAuditTracking, transitionPhase, updateStatus } from "../controllers/trackingController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/tracking",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getAuditTracking
);

router.post(
  "/audits/:auditId/phases/transition",
  authenticate,
  permit("auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  transitionPhase
);

router.post(
  "/audits/:auditId/statuses/update",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  updateStatus
);

export default router;
