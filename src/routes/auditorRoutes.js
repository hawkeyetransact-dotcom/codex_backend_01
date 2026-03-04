import express from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authMiddleware.js";
import { createPreviewAuditQuestions, createProfile, getAuditoQuestionsByRequestId, updateAuditResponses, updateProfile, flagQuestionFollowUp, acceptAuditRequest, rejectAuditRequest, listSupplierAttachmentsByUser } from "../controllers/auditorController.js";
import { autoFillAuditQuestions, autoFillPreviewTemplate, reportPreviewTemplate } from "../controllers/autoFillController.js";
import { validate } from "../middlewares/validate.js";
import { auditorProfileValidator } from "../validators/auditorProfileValidators.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { generateDraftReport, getReport, signReport, updateReportObservationLinks, getAuditComplianceSuggestion, generateCapasFromReport } from "../controllers/reportController.js";
import {
  listAuditorAvailability,
  createAuditorAvailability,
  deleteAuditorAvailability,
} from "../controllers/auditorAvailabilityController.js";
import {
  listTestArtifactOptions,
  listTestReportTemplates,
  previewTestReportTemplate,
  prefillTestArtifact,
  runExecutionRagTestPreview,
} from "../controllers/testArtifactController.js";

const router = express.Router();
const previewUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const executionPreviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 150 },
});

const withUploadArray = (upload, field, maxCount) => (req, res, next) => {
  upload.array(field, maxCount)(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `One or more files exceed the upload size limit (${Math.floor((upload?.limits?.fileSize || 0) / (1024 * 1024))} MB each).`
        : err.message || "File upload failed";
    return res.status(400).json({ error: message });
  });
};

router.post(
    "/profile/create",
    authenticate,
    permit("auditor"),
    validate(auditorProfileValidator),
    createProfile
);

router.put(
    "/profile/update",
    authenticate,
    permit("auditor"),
    validate(auditorProfileValidator),
    updateProfile
);

router.post(
    "/create-draft-questions",
    authenticate,
    permit("auditor"),
    createPreviewAuditQuestions
);

router.get(
  "/audit-questionsId",
  authenticate,
  permit("auditor", "supplier", "supplierUser"),
  getAuditoQuestionsByRequestId
);

router.put(
    "/audit-question/update-data/:auditRequestId",
    authenticate,
    permit("auditor", "supplier", "supplierUser"),
    updateAuditResponses
);

router.post(
  "/auto-fill/:auditRequestId",
  authenticate,
  permit("auditor", "admin", "supplier", "supplierUser"),
  autoFillAuditQuestions
);

router.post(
  "/auto-fill-preview",
  authenticate,
  permit("supplier", "supplierUser", "auditor"),
  withUploadArray(previewUpload, "files", 10),
  autoFillPreviewTemplate
);

router.post(
  "/report-preview",
  authenticate,
  permit("auditor"),
  withUploadArray(previewUpload, "files", 10),
  reportPreviewTemplate
);

router.post(
  "/audit-question/flag-follow-up",
  authenticate,
  permit("auditor"),
  flagQuestionFollowUp
);

router.post(
  "/audits/:auditId/accept",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  acceptAuditRequest
);

router.post(
  "/audits/:auditId/reject",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  rejectAuditRequest
);

router.post(
  "/audits/:auditId/report/draft",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  generateDraftReport
);

router.post(
  "/audits/:auditId/compliance-suggestion",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  getAuditComplianceSuggestion
);

router.get(
  "/audits/:auditId/supplier-attachments",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  listSupplierAttachmentsByUser
);

router.get(
  "/audits/:auditId/report",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "admin"),
  getReport
);

router.post(
  "/audits/:auditId/report/sign",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser"),
  signReport
);

router.patch(
  "/audits/:auditId/report/observations/:observationId/links",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  updateReportObservationLinks
);

router.post(
  "/audits/:auditId/report/capas/generate",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  generateCapasFromReport
);

router.get(
  "/availability",
  authenticate,
  permit("auditor"),
  listAuditorAvailability
);

router.post(
  "/availability",
  authenticate,
  permit("auditor"),
  createAuditorAvailability
);

router.delete(
  "/availability/:blockId",
  authenticate,
  permit("auditor"),
  deleteAuditorAvailability
);

router.get(
  "/test-artifacts/options",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  listTestArtifactOptions
);

router.post(
  "/test-artifacts/prefill",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  prefillTestArtifact
);

router.post(
  "/test-artifacts/execution-rag-preview",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  withUploadArray(executionPreviewUpload, "files", 150),
  runExecutionRagTestPreview
);

router.get(
  "/test-artifacts/report-templates",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  listTestReportTemplates
);

router.post(
  "/test-artifacts/report-preview",
  authenticate,
  permit("auditor", "admin", "superadmin", "tenant_admin"),
  previewTestReportTemplate
);

export default router;
