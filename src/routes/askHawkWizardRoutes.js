/**
 * askHawkWizardRoutes.js
 *
 * Routes the App Wizard endpoints under /api/askhawk/wizard/*.
 *
 * Mount: app.use("/api/askhawk/wizard", askHawkWizardRoutes)
 */
import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { resolveTenant } from "../middlewares/tenantMiddleware.js";
import {
  getAvailableTools,
  postCreatePlan,
  getPlanState,
  postApprovePlan,
  postExecutePlan,
} from "../controllers/askHawkWizardController.js";

const router = express.Router();
router.use(authenticate, resolveTenant);

const WIZARD_ROLES = ["buyer", "auditor", "tenant_admin", "admin", "superadmin"];

router.get("/tools", permit(...WIZARD_ROLES), getAvailableTools);
router.post("/plan", permit(...WIZARD_ROLES), postCreatePlan);
router.get("/:planId", permit(...WIZARD_ROLES), getPlanState);
router.post("/:planId/approve", permit(...WIZARD_ROLES), postApprovePlan);
router.post("/:planId/execute", permit(...WIZARD_ROLES), postExecutePlan);

export default router;
