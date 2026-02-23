import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  completePrepPhase,
  createAuditArtifact,
  deleteAuditArtifact,
  getAuditArtifact,
  getAuditPhases,
  getPhaseOptions,
  listAuditArtifacts,
  sendAuditArtifact,
  startPrepPhase,
  submitAuditArtifact,
  transitionAuditPhase,
} from "../controllers/auditPhaseController.js";

const router = express.Router();

router.get(
  "/audits/:auditId/phases",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getAuditPhases
);

router.post(
  "/audits/:auditId/phases/transition",
  authenticate,
  permit("auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  transitionAuditPhase
);

router.get(
  "/audits/:auditId/artifacts",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  listAuditArtifacts
);

router.get(
  "/audits/:auditId/artifacts/:artifactId",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getAuditArtifact
);

router.post(
  "/audits/:auditId/artifacts",
  authenticate,
  permit("auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  createAuditArtifact
);

router.delete(
  "/audits/:auditId/artifacts/:artifactId",
  authenticate,
  permit("auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  deleteAuditArtifact
);

router.post(
  "/audits/:auditId/artifacts/:artifactId/submit",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  submitAuditArtifact
);

router.post(
  "/audits/:auditId/artifacts/:artifactId/send",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  sendAuditArtifact
);

router.post(
  "/audits/:auditId/prep/start",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  startPrepPhase
);

router.post(
  "/audits/:auditId/prep/complete",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  completePrepPhase
);

router.get(
  "/audits/phase-options",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getPhaseOptions
);

export default router;
