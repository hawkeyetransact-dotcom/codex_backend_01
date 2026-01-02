import express from "express";
import {
  getUserNotifications,
  markNotificationAsRead,
  createNotification,
} from "../controllers/notificationController.js";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";

const router = express.Router();

router.get("/getdata", authenticate, permit("auditor", "supplier"), getUserNotifications);
router.patch("/:id/read",permit("auditor", "supplier"), authenticate, markNotificationAsRead);

// Optional: allow POST manually (mostly system uses utility)
router.post("/", authenticate, createNotification);

export default router;
