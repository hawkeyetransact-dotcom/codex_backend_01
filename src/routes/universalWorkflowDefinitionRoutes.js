// backend/src/routes/universalWorkflowDefinitionRoutes.js
// CRUD for WorkflowDefinition — built-in definitions + tenant-custom overrides.

import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import WorkflowDefinition from "../models/WorkflowDefinitionModel.js";
import {
  getDefinitionsForTenant,
} from "../services/workflowEngine/WorkflowDefinitionService.js";

const router = express.Router();

// GET all active definitions available to the tenant (platform-wide + custom)
router.get("/", authenticate, async (req, res) => {
  try {
    const defs = await getDefinitionsForTenant(req.user.tenantId);
    res.json(defs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single definition by workflowKey
router.get("/:workflowKey", authenticate, async (req, res) => {
  try {
    const def = await WorkflowDefinition.findOne({
      workflowKey: req.params.workflowKey,
      isActive: true,
    }).lean();
    if (!def) return res.status(404).json({ error: "Not found" });
    res.json(def);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create tenant-custom workflow definition (admin only)
router.post(
  "/",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  async (req, res) => {
    try {
      const def = await WorkflowDefinition.create({
        ...req.body,
        tenantId: req.user.tenantId,
        isBuiltIn: false,
      });
      res.status(201).json(def);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// PUT update tenant-custom definition (cannot update built-in)
router.put(
  "/:id",
  authenticate,
  permit("tenant_admin", "admin", "superadmin"),
  async (req, res) => {
    try {
      const def = await WorkflowDefinition.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.user.tenantId, isBuiltIn: false },
        req.body,
        { new: true }
      );
      if (!def)
        return res
          .status(404)
          .json({ error: "Not found or not modifiable (built-in definitions are read-only)" });
      res.json(def);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
