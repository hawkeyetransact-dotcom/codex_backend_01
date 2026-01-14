import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { resolveTenant, requireTenantAdmin } from "../middlewares/tenantMiddleware.js";
import {
  listDefinitions,
  createDefinition,
  updateDefinition,
  activateDefinition,
  listSla,
  upsertSla,
  listInstances,
  updateExpectedAt,
  assignResponsible,
  markStarted,
  markCompleted,
} from "../controllers/workflowMilestoneController.js";

const router = express.Router();

router.use(authenticate);

// Definitions can be listed without tenant context (fallback defaults)
router.get("/definitions", listDefinitions);

router.use(resolveTenant);

// Tenant admin: definitions & SLA
router.post("/definitions", requireTenantAdmin, createDefinition);
router.put("/definitions/:id", requireTenantAdmin, updateDefinition);
router.patch("/definitions/:id/activate", requireTenantAdmin, activateDefinition);

router.get("/sla", requireTenantAdmin, listSla);
router.put("/sla", requireTenantAdmin, upsertSla);

// Instances (workflow-level overrides)
router.get("/workflows/:entityType/:entityId/milestones", listInstances);
router.patch("/workflows/:entityType/:entityId/milestones/:milestoneCode/expectedAt", updateExpectedAt);
router.patch("/workflows/:entityType/:entityId/milestones/:milestoneCode/assign", assignResponsible);
router.patch("/workflows/:entityType/:entityId/milestones/:milestoneCode/start", markStarted);
router.patch("/workflows/:entityType/:entityId/milestones/:milestoneCode/complete", markCompleted);

export default router;
