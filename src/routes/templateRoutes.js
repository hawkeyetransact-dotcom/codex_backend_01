import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { listTemplates, createTemplate, deleteTemplate, publishTemplate, extractTemplateUpload, getTemplateSource } from "../controllers/templateController.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get(
  "/",
  authenticate,
  permit("auditor", "admin", "buyer", "tenant_admin", "superadmin"),
  listTemplates
);
router.post("/", authenticate, permit("auditor", "admin"), createTemplate);
router.post("/:templateId/publish", authenticate, permit("auditor", "admin"), publishTemplate);
router.get(
  "/:templateId/source",
  authenticate,
  permit("auditor", "buyer", "supplier", "supplierUser", "tenant_admin", "admin", "superadmin"),
  getTemplateSource
);
router.post(
  "/:templateId/extract-from-upload",
  authenticate,
  permit("auditor", "admin"),
  upload.single("file"),
  extractTemplateUpload
);
router.delete("/:templateId", authenticate, permit("auditor", "admin"), deleteTemplate);

export default router;
