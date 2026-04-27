/**
 * /api/suppliers/:supplierId/quality-events — unified EQMS rollup per supplier.
 */
import { Router } from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { getSupplierQualityEvents } from "../controllers/supplierQualityEventsController.js";

const router = Router();

const READ_ROLES = [
  "buyer", "buyer_admin", "tenant_admin", "admin", "superadmin",
  "auditor", "auditor_lead", "auditor_admin",
  "qa_head", "qa_specialist", "vp_quality",
];

router.get("/:supplierId/quality-events",
  authenticate, requireTenantActive, permit(...READ_ROLES),
  getSupplierQualityEvents);

export default router;
