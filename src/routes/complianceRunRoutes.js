import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createComplianceRun,
  finalizeComplianceRun,
  getComplianceRun,
  listComplianceRunQuestions,
  listComplianceRuns,
  recomputeComplianceRun,
  updateComplianceQuestionVerdict,
} from "../controllers/complianceRunController.js";

const router = express.Router();

router.get(
  "/runs",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listComplianceRuns
);

router.post(
  "/runs",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  createComplianceRun
);

router.get(
  "/runs/:runId",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  getComplianceRun
);

router.get(
  "/runs/:runId/questions",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listComplianceRunQuestions
);

router.patch(
  "/runs/:runId/questions/:questionId/verdict",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  updateComplianceQuestionVerdict
);

router.post(
  "/runs/:runId/finalize",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  finalizeComplianceRun
);

router.post(
  "/runs/:runId/recompute",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  recomputeComplianceRun
);

export default router;
