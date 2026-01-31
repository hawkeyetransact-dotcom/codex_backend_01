import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";
import { uploadQuestionnaireFile, getQuestionnaireJob, getQuestionnaireJobSource, publishQuestionnaireJob } from "../controllers/questionnaireUploadController.js";

const router = express.Router();

router.post(
  "/upload",
  authenticate,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  upload.single("file"),
  uploadQuestionnaireFile
);

router.get(
  "/jobs/:id",
  authenticate,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getQuestionnaireJob
);

router.get(
  "/jobs/:id/source",
  authenticate,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getQuestionnaireJobSource
);

router.post(
  "/jobs/:id/publish",
  authenticate,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  publishQuestionnaireJob
);

export default router;
