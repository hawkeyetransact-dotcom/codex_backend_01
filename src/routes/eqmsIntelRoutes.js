import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  collectEqmsEvidence,
  getAuditIntelligence,
  getDynamicQuestionnaireRecommendations,
  getExternalAudits,
  getExternalCapas,
  getInternalCapas,
  getRiskIndicators,
  getUnifiedDashboard,
  indexEqmsEvidence,
  linkEvidence,
  listSystems,
  recomputeRiskIndicators,
  syncExternalAudits,
  syncExternalCapas,
  syncInternalCapas,
} from "../controllers/eqmsIntelController.js";

const router = express.Router();

const viewRoles = ["buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"];
const manageRoles = ["buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"];

router.get("/systems", authenticate, permit(...viewRoles), listSystems);

router.post("/sync/internal-capas", authenticate, permit(...manageRoles), syncInternalCapas);
router.get("/internal-capas", authenticate, permit(...viewRoles), getInternalCapas);

router.post("/sync/external-capas", authenticate, permit(...manageRoles), syncExternalCapas);
router.get("/external-capas", authenticate, permit(...viewRoles), getExternalCapas);

router.post("/sync/external-audits", authenticate, permit(...manageRoles), syncExternalAudits);
router.get("/external-audits", authenticate, permit(...viewRoles), getExternalAudits);

router.post("/risk/recompute", authenticate, permit(...manageRoles), recomputeRiskIndicators);
router.get("/risk/indicators", authenticate, permit(...viewRoles), getRiskIndicators);

router.post("/questionnaire/recommendations", authenticate, permit(...viewRoles), getDynamicQuestionnaireRecommendations);

router.post("/evidence/collect", authenticate, permit(...viewRoles), collectEqmsEvidence);
router.post("/evidence/index", authenticate, permit(...viewRoles), indexEqmsEvidence);
router.post("/evidence/link", authenticate, permit(...manageRoles), linkEvidence);

router.get("/dashboard/unified-capas", authenticate, permit(...viewRoles), getUnifiedDashboard);
router.get("/dashboard/audit-intelligence", authenticate, permit(...viewRoles), getAuditIntelligence);

export default router;
