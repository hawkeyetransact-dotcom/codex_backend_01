import express from "express";
import { authenticate } from "../../../middlewares/authMiddleware.js";
import { resolveTenant } from "../../../middlewares/tenantMiddleware.js";
import {
  listNotifications,
  unreadCount,
  markRead,
  markUnread,
  markAllRead,
  snoozeNotification,
  deleteNotification,
} from "../controllers/notificationController.js";
import { getPreferences, updatePreferences } from "../controllers/preferenceController.js";

const router = express.Router();

router.use(authenticate, resolveTenant);

router.get("/notifications", listNotifications);
router.get("/notifications/unread-count", unreadCount);
router.patch("/notifications/:id/read", markRead);
router.patch("/notifications/:id/unread", markUnread);
router.patch("/notifications/mark-all-read", markAllRead);
router.patch("/notifications/:id/snooze", snoozeNotification);
router.delete("/notifications/:id", deleteNotification);

router.get("/notification-preferences", getPreferences);
router.put("/notification-preferences", updatePreferences);

export default router;
