// src/routes/universalModuleConfigRoutes.js

import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { permit } from '../middlewares/roleMiddleware.js';
import ModuleConfig from '../models/ModuleConfigModel.js';
import { invalidateVocabularyCache } from '../services/vocabularyService.js';
import { getModuleConfig } from '../services/universalModuleConfigService.js';
import { getVocabulary } from '../services/vocabularyService.js';

const router = express.Router();

router.get('/active', authenticate, async (req, res) => {
  try {
    const tenantId = req.tenantId;
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
    console.error('[ModuleConfig] getActiveModules error:', err);
    return res.status(500).json({ error: 'Failed to load module configuration' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const config = await ModuleConfig.findOne({ tenantId: req.tenantId }).lean();
    res.json(config ?? { message: 'No config found; defaults apply' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', authenticate, permit('tenant_admin', 'admin', 'superadmin'), async (req, res) => {
  try {
    const config = await ModuleConfig.findOneAndUpdate(
      { tenantId: req.tenantId },
      { ...req.body, tenantId: req.tenantId },
      { upsert: true, new: true, runValidators: true }
    );
    invalidateVocabularyCache(req.tenantId);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
