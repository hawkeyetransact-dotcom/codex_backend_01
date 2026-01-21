import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
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
  createDocument
);
router.post(
  "/digilocker/documents/:documentId/upload",
  authenticate,
  digilockerUploadMiddleware,
  uploadDocumentVersion
);
router.get(
  "/digilocker/documents",
  authenticate,
  listDocuments
);
router.get(
  "/digilocker/documents/:id",
  authenticate,
  getDocument
);
router.patch(
  "/digilocker/documents/:id",
  authenticate,
  updateDocument
);
router.post(
  "/digilocker/documents/:id/tags/suggest",
  authenticate,
  suggestTags
);
router.post(
  "/digilocker/documents/:id/tags/apply",
  authenticate,
  applyTags
);
router.post(
  "/digilocker/documents/:id/suggest-questions",
  authenticate,
  suggestQuestionsForDocument
);
router.post(
  "/digilocker/questions/:questionId/suggest-evidence",
  authenticate,
  suggestEvidence
);
router.post(
  "/digilocker/questions/:questionId/attach",
  authenticate,
  attachEvidence
);
router.get(
  "/digilocker/questions/:questionId/attachments",
  authenticate,
  listQuestionEvidence
);
router.get(
  "/digilocker/audits/:auditId/evidence-checklist",
  authenticate,
  getEvidenceChecklist
);
router.post(
  "/digilocker/audits/:auditId/evidence-pack",
  authenticate,
  createEvidencePack
);
router.get(
  "/digilocker/jobs/:jobId",
  authenticate,
  getEvidenceJobStatus
);

export default router;
