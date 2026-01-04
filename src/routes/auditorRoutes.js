import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { createPreviewAuditQuestions, createProfile, getAuditoQuestionsByRequestId, updateAuditResponses, updateProfile, flagQuestionFollowUp} from "../controllers/auditorController.js";
import { autoFillAuditQuestions } from "../controllers/autoFillController.js";
import { validate } from "../middlewares/validate.js";
import { auditorProfileValidator } from "../validators/auditorProfileValidators.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { generateDraftReport, getReport, signReport } from "../controllers/reportController.js";

const router = express.Router();

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
  permit("auditor", "supplier"),
  getAuditoQuestionsByRequestId
);

router.put(
    "/audit-question/update-data/:auditRequestId",
    authenticate,
    permit("auditor", "supplier"),
    updateAuditResponses
);

router.post(
  "/auto-fill/:auditRequestId",
  authenticate,
  permit("auditor", "admin"),
  autoFillAuditQuestions
);

router.post(
  "/audit-question/flag-follow-up",
  authenticate,
  permit("auditor"),
  flagQuestionFollowUp
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

export default router;
