import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import {
  createStatusDefinition,
  listStatusDefinitions,
  setStatusDefinitionActive,
  updateStatusDefinition,
} from "../controllers/statusDefinitionController.js";

const router = express.Router();

router.get("/", authenticate, permit("tenant_admin", "admin", "superadmin", "supplier"), listStatusDefinitions);
router.post("/", authenticate, permit("tenant_admin", "admin", "superadmin", "supplier"), createStatusDefinition);
router.put("/:id", authenticate, permit("tenant_admin", "admin", "superadmin", "supplier"), updateStatusDefinition);
router.post(
  "/:id/:action(activate|deactivate)",
  authenticate,
  permit("tenant_admin", "admin", "superadmin", "supplier"),
  setStatusDefinitionActive
);

export default router;
