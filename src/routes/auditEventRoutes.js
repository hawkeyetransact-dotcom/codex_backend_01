import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { listAuditEvents } from "../controllers/auditEventController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/audit-events",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  listAuditEvents
);

export default router;
