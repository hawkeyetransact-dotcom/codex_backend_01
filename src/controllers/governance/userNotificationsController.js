import { NotificationOutbox } from "../../models/notificationOutboxModel.js";

export const listUserNotifications = async (req, res) => {
  const { limit = 50, page = 1 } = req.query || {};
  const take = Math.min(Number(limit) || 50, 200);
  const skip = (Number(page) - 1) * take;
  const filter = {
    tenantId: req.tenantId,
    userId: req.user._id,
    channel: "IN_APP",
  };
  const [items, total] = await Promise.all([
    NotificationOutbox.find(filter).sort({ createdAt: -1 }).skip(skip).limit(take).lean(),
    NotificationOutbox.countDocuments(filter),
  ]);
  return res.json({
    data: items,
    pagination: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  });
};
