// backend/src/routes/universalModuleConfigRoutes.js
// Per-tenant universal platform module configuration.

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import ModuleConfig from "../models/ModuleConfigModel.js";
import { invalidateVocabularyCache } from "../services/vocabularyService.js";
import {
  getModuleConfig,
} from "../services/universalModuleConfigService.js";
import { getVocabulary } from "../services/vocabularyService.js";

const router = express.Router();

// GET active module config + vocabulary for the calling tenant
// Used by frontend to determine which nav items/features to render
router.get("/active", authenticate, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const [moduleConfig, vocabulary] = await Promise.all([
      getModuleConfig(tenantId),
      getVocabulary(tenantId),
    ]);
    return res.json({
      modules: moduleConfig.modules,
      vocabulary,
      industryProfile: moduleConfig.industryProfile,
      activeWorkflowKeys: moduleConfig.activeWorkflowKeys,
      complianceStandardKeys: moduleConfig.complianceStandardKeys,
    });
  } catch (err) {
    console.error("[ModuleConfig] getActiveModules error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load module configuration" });
  }
});

// GET raw config document for the tenant
router.get("/", authenticate, async (req, res) => {
  try {
    const config = await ModuleConfig.findOne({
      tenantId: req.user.tenantId,
    }).lean();
    res.json(config ?? { message: "No config found; defaults apply" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT upsert module config (tenant admin only)
router.put(
  "/",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  async (req, res) => {
    try {
      const config = await ModuleConfig.findOneAndUpdate(
        { tenantId: req.user.tenantId },
        { ...req.body, tenantId: req.user.tenantId },
        { upsert: true, new: true, runValidators: true }
      );
      // Invalidate vocabulary cache so next request reflects new overrides
      invalidateVocabularyCache(req.user.tenantId);
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
