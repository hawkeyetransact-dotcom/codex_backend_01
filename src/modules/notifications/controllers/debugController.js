import Notification from "../models/notificationModel.js";
import NotificationDeliveryLog from "../models/notificationDeliveryLogModel.js";

export const searchNotifications = async (req, res) => {
  try {
    const { tenantId, userId, event, entityId, limit = 50 } = req.query;
    const q = {};
    if (tenantId) q.tenantId = tenantId;
    if (userId) q.recipientUserId = userId;
    if (event) q.type = event;
    if (entityId) q.entityId = entityId;
    const data = await Notification.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getNotificationLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const logs = await NotificationDeliveryLog.find({ notificationId: id }).sort({ attemptedAt: -1 }).lean();
    return res.json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const resendDelivery = async (req, res) => {
  try {
    const { logId } = req.params;
    const log = await NotificationDeliveryLog.findById(logId);
    if (!log) return res.status(404).json({ success: false, error: "Log not found" });
    log.status = "pending";
    log.error = null;
    log.attempts = (log.attempts || 0) + 1;
    await log.save();
    return res.json({ success: true, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
