import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import { createAuditTrailEntry, listAuditTrail, listByEntity } from "../controllers/auditTrailController.js";

const router = express.Router();

const allRoles = ["auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];

// Audit-scoped trail (existing — used by audit Audit Log tab).
router.get(
  "/audits/:auditId/audit-trail",
  authenticate,
  permit(...allRoles),
  listAuditTrail
);
router.post(
  "/audits/:auditId/audit-trail",
  authenticate,
  permit(...allRoles),
  createAuditTrailEntry
);

// Cross-module entity-scoped trail (used by CAPA / Doc / Change / MRM / Risk pages).
router.get(
  "/audit-trail/by-entity",
  authenticate,
  resolveTenant,
  permit(...allRoles),
  listByEntity
);

export default router;
