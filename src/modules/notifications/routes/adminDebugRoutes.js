import express from "express";
import { authenticate } from "../../../middlewares/authMiddleware.js";
import { requireSuperAdmin } from "../../../middlewares/tenantMiddleware.js";
import { searchNotifications, getNotificationLogs, resendDelivery } from "../controllers/debugController.js";

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

router.get("/search", searchNotifications);
router.get("/:id/logs", getNotificationLogs);
router.post("/logs/:logId/resend", resendDelivery);

export default router;
