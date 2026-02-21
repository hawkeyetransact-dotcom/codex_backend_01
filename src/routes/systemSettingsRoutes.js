import express from "express";
import { authenticate, requireAdminScope, requireTenantActive } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  getLlmSettings,
  updateLlmSettings,
  getPreviewModeSettings,
  updatePreviewModeSettings,
  runPreviewModeAnalysis,
} from "../controllers/systemSettingsController.js";

const router = express.Router();

router.get(
  "/system-settings/llm",
  authenticate,
  requireAdminScope("PLATFORM"),
  getLlmSettings
);
router.put(
  "/system-settings/llm",
  authenticate,
  requireAdminScope("PLATFORM"),
  updateLlmSettings
);

router.get(
  "/system-settings/preview-mode",
  authenticate,
  requireTenantActive,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  getPreviewModeSettings
);
router.put(
  "/system-settings/preview-mode",
  authenticate,
  requireTenantActive,
  permit("admin", "tenant_admin", "superadmin"),
  updatePreviewModeSettings
);
router.post(
  "/system-settings/preview-mode/run",
  authenticate,
  requireTenantActive,
  permit("auditor", "buyer", "admin", "tenant_admin", "superadmin"),
  runPreviewModeAnalysis
);

export default router;
