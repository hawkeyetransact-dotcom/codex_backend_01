import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { createPreviewAuditQuestions, createProfile, getAuditoQuestionsByRequestId, updateAuditResponses, updateProfile} from "../controllers/auditorController.js";
import { validate } from "../middlewares/validate.js";
import { auditorProfileValidator } from "../validators/auditorProfileValidators.js";
import { permit } from "../middlewares/roleMiddleware.js";

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



export default router;
