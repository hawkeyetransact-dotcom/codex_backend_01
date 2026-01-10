import express from "express";
import { authenticate, requireAdminScope } from "../../middlewares/authMiddleware.js";
import { requireFeatureFlag } from "../../middlewares/featureFlagMiddleware.js";
import { NOTIF_ENGINE_V1 } from "../../config/featureFlags.js";
import {
  listNotificationEvents,
  createNotificationEvent,
  updateNotificationEvent,
} from "../../controllers/governance/notificationEventsController.js";
import {
  listNotificationPolicies,
  upsertPlatformPolicy,
} from "../../controllers/governance/notificationPoliciesController.js";

const router = express.Router();

router.use(authenticate, requireAdminScope("PLATFORM"));
router.use(requireFeatureFlag(NOTIF_ENGINE_V1));

router.get("/notification-events", listNotificationEvents);
router.post("/notification-events", createNotificationEvent);
router.patch("/notification-events/:id", updateNotificationEvent);

router.get("/notification-policies", listNotificationPolicies);
router.put("/notification-policies", upsertPlatformPolicy);

export default router;
