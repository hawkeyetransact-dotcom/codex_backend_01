import express from "express";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  addActionItem,
  addCapaComment,
  approveCAPAStage,
  assignCAPAOwner,
  bulkGenerateCandidatesFromAudit,
  closeCAPA,
  createCAPAIntake,
  createCandidateFromAuditFinding,
  createFormalCAPA,
  generateDraftPrefillFromAuditSources,
  getCAPADashboard,
  getCapaDetail,
  getCapaList,
  getCapaModuleHealth,
  getCandidateQueue,
  getRelatedFindingsAndPastCAPAs,
  linkLegacyCapasToV2,
  reopenCAPA,
  saveActionPlan,
  saveEffectivenessCheck,
  saveInvestigation,
  saveRiskAssessment,
  saveRootCauseAnalysis,
  submitForTriage,
  triageCAPA,
  updateActionItemStatus,
  updateCAPAIntake,
  uploadImplementationEvidence,
} from "../controllers/capaV2Controller.js";

const router = express.Router();

const manageRoles = [
  "buyer",
  "supplier",
  "supplierUser",
  "auditor",
  "tenant_admin",
  "admin",
  "superadmin",
];

const triageRoles = ["auditor", "tenant_admin", "admin", "superadmin"];
const approvalRoles = ["auditor", "tenant_admin", "admin", "superadmin"];

router.post("/candidates/from-finding", authenticate, requireTenantActive, permit(...manageRoles), createCandidateFromAuditFinding);
router.post(
  "/candidates/bulk-from-audit/:auditId",
  authenticate,
  requireTenantActive,
  permit(...triageRoles),
  bulkGenerateCandidatesFromAudit
);
router.get("/candidates", authenticate, requireTenantActive, permit(...manageRoles), getCandidateQueue);

router.post("/prefill/from-audit/:auditId", authenticate, requireTenantActive, permit(...manageRoles), generateDraftPrefillFromAuditSources);

router.post("/intakes", authenticate, requireTenantActive, permit(...manageRoles), createCAPAIntake);
router.patch("/intakes/:intakeId", authenticate, requireTenantActive, permit(...manageRoles), updateCAPAIntake);
router.post("/intakes/:intakeId/submit", authenticate, requireTenantActive, permit(...manageRoles), submitForTriage);

router.post("/triage/:triageId/decision", authenticate, requireTenantActive, permit(...triageRoles), triageCAPA);
router.post("/capas", authenticate, requireTenantActive, permit(...manageRoles), createFormalCAPA);
router.get("/capas", authenticate, requireTenantActive, permit(...manageRoles), getCapaList);
router.get("/capas/:capaId", authenticate, requireTenantActive, permit(...manageRoles), getCapaDetail);
router.post("/capas/:capaId/assign", authenticate, requireTenantActive, permit(...triageRoles), assignCAPAOwner);
router.put("/capas/:capaId/investigation", authenticate, requireTenantActive, permit(...manageRoles), saveInvestigation);
router.put("/capas/:capaId/root-cause", authenticate, requireTenantActive, permit(...manageRoles), saveRootCauseAnalysis);
router.put("/capas/:capaId/action-plan", authenticate, requireTenantActive, permit(...manageRoles), saveActionPlan);
router.post("/capas/:capaId/action-items", authenticate, requireTenantActive, permit(...manageRoles), addActionItem);
router.patch("/action-items/:actionItemId/status", authenticate, requireTenantActive, permit(...manageRoles), updateActionItemStatus);
router.post(
  "/capas/:capaId/implementation-evidence",
  authenticate,
  requireTenantActive,
  permit(...manageRoles),
  uploadImplementationEvidence
);
router.put("/capas/:capaId/effectiveness", authenticate, requireTenantActive, permit(...manageRoles), saveEffectivenessCheck);
router.post("/capas/:capaId/approvals", authenticate, requireTenantActive, permit(...approvalRoles), approveCAPAStage);
router.post("/capas/:capaId/close", authenticate, requireTenantActive, permit(...approvalRoles), closeCAPA);
router.post("/capas/:capaId/reopen", authenticate, requireTenantActive, permit(...approvalRoles), reopenCAPA);
router.get("/capas/:capaId/related", authenticate, requireTenantActive, permit(...manageRoles), getRelatedFindingsAndPastCAPAs);
router.post("/capas/:capaId/comments", authenticate, requireTenantActive, permit(...manageRoles), addCapaComment);
router.post("/capas/:capaId/risk-assessment", authenticate, requireTenantActive, permit(...triageRoles), saveRiskAssessment);
router.post("/capas/:capaId/link-legacy", authenticate, requireTenantActive, permit(...triageRoles), linkLegacyCapasToV2);

router.get("/dashboard", authenticate, requireTenantActive, permit(...manageRoles), getCAPADashboard);
router.get("/health", authenticate, requireTenantActive, permit(...triageRoles), getCapaModuleHealth);

export default router;
