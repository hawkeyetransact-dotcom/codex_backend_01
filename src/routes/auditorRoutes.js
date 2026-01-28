import express from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authMiddleware.js";
import { createPreviewAuditQuestions, createProfile, getAuditoQuestionsByRequestId, updateAuditResponses, updateProfile, flagQuestionFollowUp, acceptAuditRequest, rejectAuditRequest } from "../controllers/auditorController.js";
import { autoFillAuditQuestions, autoFillPreviewTemplate, reportPreviewTemplate } from "../controllers/autoFillController.js";
import { validate } from "../middlewares/validate.js";
import { auditorProfileValidator } from "../validators/auditorProfileValidators.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { generateDraftReport, getReport, signReport, updateReportObservationLinks } from "../controllers/reportController.js";
import {
  listAuditorAvailability,
  createAuditorAvailability,
  deleteAuditorAvailability,
} from "../controllers/auditorAvailabilityController.js";

const router = express.Router();
const previewUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

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
  previewUpload.array("files", 10),
  autoFillPreviewTemplate
);

router.post(
  "/report-preview",
  authenticate,
  permit("auditor"),
  previewUpload.array("files", 10),
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
  permit("auditor"),
  generateDraftReport
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

export default router;
