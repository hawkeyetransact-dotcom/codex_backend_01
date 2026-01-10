import { NotificationEvent } from "../../models/notificationEventModel.js";
import { writeGovernanceAuditLog } from "../../services/governance/governanceAuditLogService.js";

export const listNotificationEvents = async (_req, res) => {
  const events = await NotificationEvent.find().sort({ category: 1, key: 1 }).lean();
  return res.json({ data: events });
};

export const createNotificationEvent = async (req, res) => {
  try {
    const { key, name, category, severity, payloadSchema, isActive } = req.body || {};
    if (!key || !name || !category) {
      return res.status(400).json({ message: "key, name, and category are required" });
    }
    const existing = await NotificationEvent.findOne({ key }).lean();
    if (existing) {
      return res.status(409).json({ message: "Event key already exists" });
    }
    const doc = await NotificationEvent.create({ key, name, category, severity, payloadSchema, isActive });
    await writeGovernanceAuditLog({
      req,
      action: "NOTIF_EVENT_CREATE",
      targetType: "NotificationEvent",
      targetId: doc._id.toString(),
      diff: { after: doc },
      tenantId: null,
    });
    return res.status(201).json({ data: doc });
  } catch (err) {
    console.error("createNotificationEvent", err);
    return res.status(500).json({ message: err.message });
  }
};

export const updateNotificationEvent = async (req, res) => {
  try {
    const before = await NotificationEvent.findById(req.params.id).lean();
    if (!before) {
      return res.status(404).json({ message: "Event not found" });
    }
    const { name, category, severity, payloadSchema, isActive } = req.body || {};
    const updated = await NotificationEvent.findByIdAndUpdate(
      req.params.id,
      { name, category, severity, payloadSchema, isActive },
      { new: true }
    );
    await writeGovernanceAuditLog({
      req,
      action: "NOTIF_EVENT_UPDATE",
      targetType: "NotificationEvent",
      targetId: updated._id.toString(),
      diff: { before, after: updated },
      tenantId: null,
    });
    return res.json({ data: updated });
  } catch (err) {
    console.error("updateNotificationEvent", err);
    return res.status(500).json({ message: err.message });
  }
};
