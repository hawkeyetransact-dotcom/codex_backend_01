/**
 * AI Gap-Agents routes — mounted at /api/ai (shared namespace).
 */
import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  postClassifyChangeImpact,
  postBrainstormRiskScenarios,
  postPopulateMrm,
  postTrainingAutoAssign,
  postActiveLearningAdjustments,
} from "../controllers/aiGapAgentsController.js";

const router = express.Router();
const ADMINS = ["admin", "tenant_admin", "superadmin"];
const REG_ROLES = ["user", "auditor", ...ADMINS];
const QA_ROLES = ["user", ...ADMINS];

router.post("/change-control/classify-impact",
  authenticate, requireTenantActive, permit(...REG_ROLES), postClassifyChangeImpact);

router.post("/risk/brainstorm-scenarios",
  authenticate, requireTenantActive, permit(...QA_ROLES), postBrainstormRiskScenarios);

router.post("/mrm/populate-inputs",
  authenticate, requireTenantActive, permit(...ADMINS), postPopulateMrm);

router.post("/training/auto-assign",
  authenticate, requireTenantActive, permit(...QA_ROLES), postTrainingAutoAssign);

router.post("/active-learning/adjustments",
  authenticate, requireTenantActive, permit(...ADMINS), postActiveLearningAdjustments);

export default router;
