// controllers/notificationController.js
import {Notification} from "../models/notificationModel.js";

export const getUserNotifications = async (req, res) => {
  try {
    const { userId, page = 1, limit = 10 } = req.query;
    const receiverId = userId || req.user?._id;
    if (!receiverId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const notifications = await Notification.find({ receiverId })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true, readAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
};

export const markNotificationAsUnread = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: false, readAt: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as unread" });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const receiverId = req.query.userId || req.user?._id;
    if (!receiverId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const result = await Notification.updateMany(
      { receiverId, read: { $ne: true } },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true, data: { modified: result.modifiedCount || result.nModified || 0 } });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const receiverId = req.query.userId || req.user?._id;
    if (!receiverId) {
      return res.status(400).json({ error: "userId is required" });
    }
    const count = await Notification.countDocuments({ receiverId, read: { $ne: true } });
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
};

export const snoozeNotification = async (req, res) => {
  try {
    const { snoozedUntil } = req.body || {};
    await Notification.findByIdAndUpdate(req.params.id, { snoozedUntil: snoozedUntil || null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to snooze notification" });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete notification" });
  }
};

export const createNotification = async (req, res) => {
  try {
    const { senderId, receiverId, senderRole, receiverRole, message, link = "" } = req.body;
    const notification = new Notification({
      senderId,
      receiverId,
      senderRole,
      receiverRole,
      message,
      link,
    });
    await notification.save();
    res.status(201).json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ error: "Failed to create notification" });
  }
};
