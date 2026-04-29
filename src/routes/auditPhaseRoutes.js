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
import { signIntimationLetter } from "../controllers/intimationSignatureController.js";
import {
  getExecutionScope,
  setExecutionScope,
  finalizeExecutionScope,
} from "../controllers/executionScopeController.js";
import {
  createClosureCertificate,
  approveClosureCertificate,
  getClosureCertificate,
} from "../controllers/auditClosureController.js";
import { draftObservation } from "../controllers/observationDrafterController.js";

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

// G1: Supplier signs the intimation letter — 21 CFR Part 11 e-signature.
router.post(
  "/audits/:auditId/intimation/sign",
  authenticate,
  permit("supplier", "supplierUser"),
  signIntimationLetter
);

// G5: Auditor builds + finalizes the curated execution checklist.
router.get(
  "/audits/:auditId/execution/scope",
  authenticate,
  permit("auditor", "buyer", "tenant_admin", "admin", "superadmin"),
  getExecutionScope
);
router.post(
  "/audits/:auditId/execution/scope",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  setExecutionScope
);
router.post(
  "/audits/:auditId/execution/finalize",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  finalizeExecutionScope
);

// G8: Audit closure certification.
router.get(
  "/audits/:auditId/closure-certificate",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getClosureCertificate
);
router.post(
  "/audits/:auditId/closure-certificate",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  createClosureCertificate
);
router.post(
  "/audits/:auditId/closure-certificate/approve",
  authenticate,
  permit("buyer", "tenant_admin", "admin", "superadmin"),
  approveClosureCertificate
);

// G12: AI observation drafter w/ citation traces.
router.post(
  "/audits/:auditId/observations/draft",
  authenticate,
  permit("auditor", "tenant_admin", "admin", "superadmin"),
  draftObservation
);

export default router;
