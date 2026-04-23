/**
 * Audit AI Agents — routes. Mounted at /api/ai/audit-agents in app.js.
 */
import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  postPrepareQuestionnaire,
  postAutofillForm,
  postAssembleReport,
  postSupplierIntel,
  postResolveSupplier,
  getPublicProviders,
  postOpenFdaManufacturer,
  postOpenFdaRecalls,
  postFdaWarningLetters,
  postOpenFdaAdverseEvents,
} from "../controllers/auditAgentsController.js";

const router = express.Router();
const ALL = ["admin", "tenant_admin", "superadmin", "user", "auditor", "buyer", "supplier", "supplierUser"];
const AUDIT_ROLES = ["admin", "tenant_admin", "superadmin", "user", "auditor", "buyer"];

// Agents
router.post("/prepare-questionnaire", authenticate, requireTenantActive, permit(...AUDIT_ROLES), postPrepareQuestionnaire);
router.post("/autofill-form", authenticate, requireTenantActive, permit(...ALL), postAutofillForm);
router.post("/assemble-report", authenticate, requireTenantActive, permit(...AUDIT_ROLES), postAssembleReport);
router.post("/supplier-intel", authenticate, requireTenantActive, permit(...ALL), postSupplierIntel);

// Services
router.post("/resolve-supplier", authenticate, requireTenantActive, permit(...ALL), postResolveSupplier);

// Public-data adapters
router.get("/public/providers", authenticate, requireTenantActive, permit(...ALL), getPublicProviders);
router.post("/public/openfda/manufacturer", authenticate, requireTenantActive, permit(...ALL), postOpenFdaManufacturer);
router.post("/public/openfda/recalls", authenticate, requireTenantActive, permit(...ALL), postOpenFdaRecalls);
router.post("/public/openfda/adverse-events", authenticate, requireTenantActive, permit(...ALL), postOpenFdaAdverseEvents);
router.post("/public/fda/warning-letters", authenticate, requireTenantActive, permit(...ALL), postFdaWarningLetters);

export default router;
