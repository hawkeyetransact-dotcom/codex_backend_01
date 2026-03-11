import express from "express";
import { authenticate, requireTenantActiveOrPlatformAdmin } from "../middlewares/authMiddleware.js";
import { requireFeatureEnabled } from "../middlewares/featureFlagMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  addEngagementParticipant,
  createEngagement,
  getEngagement,
  listEngagements,
} from "../controllers/engagementController.js";
import { addEngagementParticipantValidator, createEngagementValidator } from "../validators/orgDirectoryValidators.js";
import { isFeatureEnabledForTenant } from "../services/orgDirectory/featureGate.js";

const router = express.Router();

router.use(authenticate, requireTenantActiveOrPlatformAdmin);
router.use(
  requireFeatureEnabled((req) => isFeatureEnabledForTenant("ENGAGEMENTS_ENABLED", req.tenantId))
);

router.get("/", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), listEngagements);
router.post("/", permit("buyer", "tenant_admin", "admin", "superadmin"), validate(createEngagementValidator), createEngagement);
router.get("/:id", permit("buyer", "supplier", "supplierUser", "auditor", "tenant_admin", "admin", "superadmin"), getEngagement);
router.post(
  "/:id/participants",
  permit("buyer", "tenant_admin", "admin", "superadmin"),
  validate(addEngagementParticipantValidator),
  addEngagementParticipant
);

export default router;
