import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import { validate } from "../../middlewares/validate.js";
import {
  createAssessment,
  listAssessments,
  getAssessment,
  updatePhase,
  updateMilestone,
} from "../../controllers/v2/assessmentController.js";
import { createAssessmentValidator, updatePhaseValidator, updateMilestoneValidator } from "../../validators/assessmentValidator.js";

const router = express.Router();

router.post(
  "/assessments",
  authenticate,
  requireTenantActive,
  permit("buyer", "admin", "tenant_admin", "superadmin"),
  validate(createAssessmentValidator),
  createAssessment
);
router.get("/assessments", authenticate, requireTenantActive, listAssessments);
router.get("/assessments/:id", authenticate, requireTenantActive, getAssessment);
router.patch(
  "/assessments/:id/phase",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  validate(updatePhaseValidator),
  updatePhase
);
router.patch(
  "/assessments/:id/milestones/:mid",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  validate(updateMilestoneValidator),
  updateMilestone
);

export default router;
