import express from "express";
import multer from "multer";
import { authenticate, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  bootstrapComplianceDefaults,
  createComplianceStandard,
  getComplianceGuidelineStatus,
  getComplianceStandard,
  listComplianceStandards,
  reindexComplianceGuidelines,
  uploadComplianceGuidelines,
  updateComplianceStandard,
} from "../controllers/complianceStandardsController.js";

const router = express.Router();
const guidelineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 25 },
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

router.get(
  "/",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  listComplianceStandards
);

router.post(
  "/bootstrap/defaults",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  bootstrapComplianceDefaults
);

router.post(
  "/",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  createComplianceStandard
);

router.get(
  "/:standardKey/:version",
  authenticate,
  requireTenantActive,
  permit("auditor", "supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  getComplianceStandard
);

router.put(
  "/:standardKey/:version",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  updateComplianceStandard
);

router.get(
  "/:standardKey/:version/guidelines/status",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  getComplianceGuidelineStatus
);

router.post(
  "/:standardKey/:version/guidelines/upload",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  withUploadArray(guidelineUpload, "files", 25),
  uploadComplianceGuidelines
);

router.post(
  "/:standardKey/:version/guidelines/reindex",
  authenticate,
  requireTenantActive,
  permit("auditor", "admin", "tenant_admin", "superadmin"),
  reindexComplianceGuidelines
);

export default router;
