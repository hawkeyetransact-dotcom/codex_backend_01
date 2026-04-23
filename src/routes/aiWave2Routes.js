/**
 * AI Wave 2 routes — mounted at /api/ai (shared namespace).
 */
import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  postCreateAgentPlan,
  postApproveAgentPlan,
  postExecuteAgentPlan,
  getAgentPlanById,
  getAgentTools,
  postCompileSupplierDossier,
  getSupplierDossier,
  postDraftObservation,
  postSuggestFollowups,
  postIngestFeedback,
  postProposePromptVariant,
} from "../controllers/aiWave2Controller.js";

const router = express.Router();

const ALL_USERS = ["admin", "tenant_admin", "superadmin", "user", "auditor", "buyer", "supplier", "supplierUser"];
const ADMINS = ["admin", "tenant_admin", "superadmin"];

// Agent + tools
router.get("/agent/tools", authenticate, requireTenantActive, permit(...ALL_USERS), getAgentTools);
router.post("/agent/plan", authenticate, requireTenantActive, permit(...ALL_USERS), postCreateAgentPlan);
router.get("/agent/plans/:planId", authenticate, requireTenantActive, permit(...ALL_USERS), getAgentPlanById);
router.post("/agent/plans/:planId/approve", authenticate, requireTenantActive, permit(...ALL_USERS), postApproveAgentPlan);
router.post("/agent/plans/:planId/execute", authenticate, requireTenantActive, permit(...ALL_USERS), postExecuteAgentPlan);

// Cross-Company Audit
router.post("/cross-co/supplier-risk-dossier", authenticate, requireTenantActive, permit(...ALL_USERS), postCompileSupplierDossier);
router.get("/cross-co/supplier-risk-dossier/:supplierId", authenticate, requireTenantActive, permit(...ALL_USERS), getSupplierDossier);
router.post("/cross-co/observation/draft", authenticate, requireTenantActive, permit("auditor", ...ADMINS), postDraftObservation);
router.post("/cross-co/followup-suggestions", authenticate, requireTenantActive, permit("auditor", ...ADMINS), postSuggestFollowups);

// Active learning (admin-only)
router.post("/active-learning/ingest-feedback", authenticate, requireTenantActive, permit(...ADMINS), postIngestFeedback);
router.post("/active-learning/propose-variant", authenticate, requireTenantActive, permit(...ADMINS), postProposePromptVariant);

export default router;
