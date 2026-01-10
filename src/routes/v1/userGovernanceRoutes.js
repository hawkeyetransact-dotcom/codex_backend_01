import express from "express";
import { authenticate } from "../../middlewares/authMiddleware.js";
import { resolveTenant } from "../../middlewares/tenantMiddleware.js";
import { requireFeatureFlag } from "../../middlewares/featureFlagMiddleware.js";
import { NOTIF_ENGINE_V1 } from "../../config/featureFlags.js";
import {
  listUserNotificationPreferences,
  upsertUserNotificationPreference,
} from "../../controllers/governance/userNotificationPreferencesController.js";
import { listUserNotifications } from "../../controllers/governance/userNotificationsController.js";

const router = express.Router();

router.use(authenticate, resolveTenant);
router.use(requireFeatureFlag(NOTIF_ENGINE_V1));

router.get("/notification-preferences", listUserNotificationPreferences);
router.put("/notification-preferences", upsertUserNotificationPreference);
router.get("/notifications", listUserNotifications);

export default router;
