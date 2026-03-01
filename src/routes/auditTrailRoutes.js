import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { createAuditTrailEntry, listAuditTrail } from "../controllers/auditTrailController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/audit-trail",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  listAuditTrail
);
router.post(
  "/audits/:auditId/audit-trail",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  createAuditTrailEntry
);

export default router;
