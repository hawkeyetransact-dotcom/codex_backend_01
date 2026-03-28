// src/routes/universalWorkflowDefinitionRoutes.js

import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import { permit } from '../middlewares/roleMiddleware.js';
import WorkflowDefinition from '../models/WorkflowDefinitionModel.js';
import { getDefinitionsForTenant } from '../services/workflowEngine/WorkflowDefinitionService.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const defs = await getDefinitionsForTenant(req.tenantId);
    res.json(defs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:workflowKey', authenticate, async (req, res) => {
  try {
    const def = await WorkflowDefinition.findOne({ workflowKey: req.params.workflowKey, isActive: true }).lean();
    if (!def) return res.status(404).json({ error: 'Not found' });
    res.json(def);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, permit('tenant_admin', 'admin', 'superadmin'), async (req, res) => {
  try {
    const def = await WorkflowDefinition.create({ ...req.body, tenantId: req.tenantId, isBuiltIn: false });
    res.status(201).json(def);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authenticate, permit('tenant_admin', 'admin', 'superadmin'), async (req, res) => {
  try {
    const def = await WorkflowDefinition.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, isBuiltIn: false },
      req.body,
      { new: true }
    );
    if (!def) return res.status(404).json({ error: 'Not found or not modifiable (built-in definitions are read-only)' });
    res.json(def);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
