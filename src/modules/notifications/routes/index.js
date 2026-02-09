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
  archiveNotification,
  unarchiveNotification,
  moveNotification,
  setNotificationLabels,
  bulkUpdateNotifications,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
} from "../controllers/notificationController.js";
import { getPreferences, updatePreferences } from "../controllers/preferenceController.js";

const router = express.Router();

router.use(authenticate, resolveTenant);

router.get("/notifications", listNotifications);
router.get("/notifications/unread-count", unreadCount);
router.patch("/notifications/bulk", bulkUpdateNotifications);
router.patch("/notifications/:id/read", markRead);
router.patch("/notifications/:id/unread", markUnread);
router.patch("/notifications/mark-all-read", markAllRead);
router.patch("/notifications/:id/snooze", snoozeNotification);
router.patch("/notifications/:id/archive", archiveNotification);
router.patch("/notifications/:id/unarchive", unarchiveNotification);
router.patch("/notifications/:id/folder", moveNotification);
router.patch("/notifications/:id/labels", setNotificationLabels);
router.delete("/notifications/:id", deleteNotification);

router.get("/notifications/folders", listFolders);
router.post("/notifications/folders", createFolder);
router.put("/notifications/folders/:id", updateFolder);
router.delete("/notifications/folders/:id", deleteFolder);

router.get("/notifications/labels", listLabels);
router.post("/notifications/labels", createLabel);
router.put("/notifications/labels/:id", updateLabel);
router.delete("/notifications/labels/:id", deleteLabel);

router.get("/notification-preferences", getPreferences);
router.put("/notification-preferences", updatePreferences);

export default router;
