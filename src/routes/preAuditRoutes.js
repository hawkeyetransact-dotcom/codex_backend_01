import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  agendaValidator,
  auditPlanValidator,
  preAuditQuestionnaireValidator,
} from "../validators/preAuditValidators.js";
import {
  getAgenda,
  getAuditPlan,
  getPreAuditQuestionnaire,
  upsertAgenda,
  upsertAuditPlan,
  upsertPreAuditQuestionnaire,
} from "../controllers/preAuditController.js";

const router = express.Router();

const readRoles = ["auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"];
const writeRoles = ["auditor", "buyer", "tenant_admin", "admin", "superadmin"];

router.get("/audits/:auditId/prep/plan", authenticate, permit(...readRoles), getAuditPlan);
router.post(
  "/audits/:auditId/prep/plan",
  authenticate,
  permit(...writeRoles),
  validate(auditPlanValidator),
  upsertAuditPlan
);

router.get("/audits/:auditId/planning/agenda", authenticate, permit(...readRoles), getAgenda);
router.post(
  "/audits/:auditId/planning/agenda",
  authenticate,
  permit(...writeRoles),
  validate(agendaValidator),
  upsertAgenda
);

router.get(
  "/audits/:auditId/prep/questionnaire",
  authenticate,
  permit(...readRoles),
  getPreAuditQuestionnaire
);
router.post(
  "/audits/:auditId/prep/questionnaire",
  authenticate,
  permit(...readRoles),
  validate(preAuditQuestionnaireValidator),
  upsertPreAuditQuestionnaire
);

export default router;
