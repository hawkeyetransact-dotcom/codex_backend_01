import express from "express";
import {
  getUserNotifications,
  markNotificationAsRead,
  markNotificationAsUnread,
  markAllNotificationsRead,
  getUnreadCount,
  createNotification,
  snoozeNotification,
  deleteNotification,
} from "../controllers/notificationController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";

const router = express.Router();

const notificationRoles = ["auditor", "supplier", "supplierUser", "buyer", "tenant_admin", "admin", "superadmin"];

router.get("/getdata", authenticate, permit(...notificationRoles), getUserNotifications);
router.get("/unread-count", authenticate, permit(...notificationRoles), getUnreadCount);
router.patch("/mark-all-read", authenticate, permit(...notificationRoles), markAllNotificationsRead);
router.patch("/:id/read", authenticate, permit(...notificationRoles), markNotificationAsRead);
router.patch("/:id/unread", authenticate, permit(...notificationRoles), markNotificationAsUnread);
router.patch("/:id/snooze", authenticate, permit(...notificationRoles), snoozeNotification);
router.delete("/:id", authenticate, permit(...notificationRoles), deleteNotification);

// Optional: allow POST manually (mostly system uses utility)
router.post("/", authenticate, createNotification);

export default router;
