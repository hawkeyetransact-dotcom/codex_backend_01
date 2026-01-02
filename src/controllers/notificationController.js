// controllers/notificationController.js
import {Notification} from "../models/notificationModel.js";

export const getUserNotifications = async (req, res) => {
  try {
   const { userId, page = 1, limit = 10 } = req.query;
    const notifications = await Notification.find({ receiverId: userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
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
