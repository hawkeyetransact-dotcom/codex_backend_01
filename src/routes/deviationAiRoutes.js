/**
 * deviationAiRoutes.js — 5 AI endpoints for the Deviation module.
 *
 * Mount: app.use("/api/ai/deviation", deviationAiRoutes)
 *
 * Per-tenant AgentPermission gating (deviation.* keys) is enforced at the
 * service layer via groundedGenerate. Auth + tenant scope here.
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import {
  postClassifyIntake,
  postFindSimilar,
  postDraftDisposition,
  postRecommendCapa,
  getTrends,
} from "../controllers/deviationAiController.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const allowedRoles = ["buyer", "auditor", "tenant_admin", "admin", "superadmin", "workflow_manager", "inspector"];

// Intake classifier — called from the New Deviation form, BEFORE save.
router.post("/classify-intake", permit(...allowedRoles), postClassifyIntake);

// On an existing deviation:
router.post("/:id/find-similar",      permit(...allowedRoles), postFindSimilar);
router.post("/:id/draft-disposition", permit(...allowedRoles), postDraftDisposition);
router.post("/:id/recommend-capa",    permit(...allowedRoles), postRecommendCapa);

// Tenant-wide trend report.
router.get("/trends", permit(...allowedRoles), getTrends);

export default router;
