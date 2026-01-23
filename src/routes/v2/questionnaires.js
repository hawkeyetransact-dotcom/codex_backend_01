import express from "express";
import { authenticate, requireTenantActive } from "../../middlewares/authMiddleware.js";
import { permit } from "../../middlewares/roleMiddleware.js";
import { validate } from "../../middlewares/validate.js";
import {
  listQuestionnaires,
  createPreAuditQuestionnaire,
  createFullQuestionnaire,
  getQuestionnaire,
  respondQuestionnaire,
  reviewQuestionnaire,
} from "../../controllers/v2/questionnaireController.js";
import { createFullQuestionnaireValidator, respondQuestionnaireValidator } from "../../validators/assessmentValidator.js";

const router = express.Router();

router.get("/questionnaires", authenticate, requireTenantActive, listQuestionnaires);
router.post("/assessments/:id/questionnaires/pre-audit", authenticate, requireTenantActive, permit("auditor", "admin", "tenant_admin", "superadmin"), createPreAuditQuestionnaire);
router.post(
  "/assessments/:id/questionnaires/full",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  validate(createFullQuestionnaireValidator),
  createFullQuestionnaire
);
router.get("/questionnaires/:qid", authenticate, requireTenantActive, getQuestionnaire);
router.post(
  "/questionnaires/:qid/respond",
  authenticate,
  requireTenantActive,
  permit("supplier", "supplierUser"),
  validate(respondQuestionnaireValidator),
  respondQuestionnaire
);
router.post("/questionnaires/:qid/review", authenticate, requireTenantActive, permit("auditor", "admin", "tenant_admin", "superadmin"), reviewQuestionnaire);

export default router;
