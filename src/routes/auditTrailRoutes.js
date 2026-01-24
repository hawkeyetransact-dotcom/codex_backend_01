import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { listAuditTrail } from "../controllers/auditTrailController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/audit-trail",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  listAuditTrail
);

export default router;
