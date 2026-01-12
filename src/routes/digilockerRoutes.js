import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createDocument,
  digilockerUploadMiddleware,
  uploadDocumentVersion,
  listDocuments,
  getDocument,
  updateDocument,
  suggestTags,
  applyTags,
  suggestQuestionsForDocument,
  suggestEvidence,
  attachEvidence,
  listQuestionEvidence,
  getEvidenceChecklist,
  createEvidencePack,
  getEvidenceJobStatus,
} from "../controllers/digilockerController.js";

const router = express.Router();

router.post(
  "/digilocker/documents",
  authenticate,
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  createDocument
);
router.post(
  "/digilocker/documents/:documentId/upload",
  authenticate,
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  digilockerUploadMiddleware,
  uploadDocumentVersion
);
router.get(
  "/digilocker/documents",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  listDocuments
);
router.get(
  "/digilocker/documents/:id",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getDocument
);
router.patch(
  "/digilocker/documents/:id",
  authenticate,
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  updateDocument
);
router.post(
  "/digilocker/documents/:id/tags/suggest",
  authenticate,
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  suggestTags
);
router.post(
  "/digilocker/documents/:id/tags/apply",
  authenticate,
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  applyTags
);
router.post(
  "/digilocker/documents/:id/suggest-questions",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  suggestQuestionsForDocument
);
router.post(
  "/digilocker/questions/:questionId/suggest-evidence",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  suggestEvidence
);
router.post(
  "/digilocker/questions/:questionId/attach",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "admin", "tenant_admin", "superadmin"),
  attachEvidence
);
router.get(
  "/digilocker/questions/:questionId/attachments",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  listQuestionEvidence
);
router.get(
  "/digilocker/audits/:auditId/evidence-checklist",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getEvidenceChecklist
);
router.post(
  "/digilocker/audits/:auditId/evidence-pack",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "admin", "tenant_admin", "superadmin"),
  createEvidencePack
);
router.get(
  "/digilocker/jobs/:jobId",
  authenticate,
  permit("supplier", "supplierUser", "auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getEvidenceJobStatus
);

export default router;
