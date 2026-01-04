import Notification from "../models/notificationModel.js";

const buildFilter = (req) => {
  const { unreadOnly, severity, type, entityType, from, to } = req.query;
  const filter = {
    tenantId: req.tenantId,
    recipientUserId: req.user._id,
    isDeleted: false,
  };
  if (unreadOnly === "true") filter.isRead = false;
  if (severity) filter.severity = severity;
  if (type) filter.type = type;
  if (entityType) filter.entityType = entityType;
  if (from || to) filter.createdAt = {};
  if (from) filter.createdAt.$gte = new Date(from);
  if (to) filter.createdAt.$lte = new Date(to);
  return filter;
};

export const listNotifications = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = "-createdAt",
  } = req.query;
  const filter = buildFilter(req);
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Notification.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, meta: { total, page: Number(page), limit: Number(limit) } });
};

export const unreadCount = async (req, res) => {
  const filter = {
    tenantId: req.tenantId,
    recipientUserId: req.user._id,
    isRead: false,
    isDeleted: false,
  };
  const count = await Notification.countDocuments(filter);
  res.json({ success: true, data: { count } });
};

export const markRead = async (req, res) => {
  const notif = await Notification.findOne({ _id: req.params.id, tenantId: req.tenantId, recipientUserId: req.user._id, isDeleted: false });
  if (!notif) return res.status(404).json({ success: false, message: "Not found" });
  notif.isRead = true;
  notif.readAt = new Date();
  await notif.save();
  res.json({ success: true, data: notif });
};

export const markAllRead = async (req, res) => {
  await Notification.updateMany(
    { tenantId: req.tenantId, recipientUserId: req.user._id, isDeleted: false, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.json({ success: true, data: true });
};

export const snoozeNotification = async (req, res) => {
  const { snoozedUntil } = req.body || {};
  if (!snoozedUntil) return res.status(400).json({ success: false, message: "snoozedUntil required" });
  const notif = await Notification.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, recipientUserId: req.user._id, isDeleted: false },
    { $set: { snoozedUntil: new Date(snoozedUntil) } },
    { new: true }
  );
  if (!notif) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, data: notif });
};

export const deleteNotification = async (req, res) => {
  const notif = await Notification.findOne({ _id: req.params.id, tenantId: req.tenantId, recipientUserId: req.user._id, isDeleted: false });
  if (!notif) return res.status(404).json({ success: false, message: "Not found" });
  notif.isDeleted = true;
  await notif.save();
  res.json({ success: true, data: true });
};
