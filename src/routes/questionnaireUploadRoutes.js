import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";
import { uploadQuestionnaireFile, getQuestionnaireJob, publishQuestionnaireJob } from "../controllers/questionnaireUploadController.js";

const router = express.Router();

router.post(
  "/upload",
  authenticate,
  permit("auditor"),
  upload.single("file"),
  uploadQuestionnaireFile
);

router.get(
  "/jobs/:id",
  authenticate,
  permit("auditor"),
  getQuestionnaireJob
);

router.post(
  "/jobs/:id/publish",
  authenticate,
  permit("auditor"),
  publishQuestionnaireJob
);

export default router;
