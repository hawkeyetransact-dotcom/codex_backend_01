import { UserNotificationPreference } from "../../models/userNotificationPreferenceModel.js";
import { writeGovernanceAuditLog } from "../../services/governance/governanceAuditLogService.js";

export const listUserNotificationPreferences = async (req, res) => {
  const prefs = await UserNotificationPreference.find({ tenantId: req.tenantId, userId: req.user._id })
    .sort({ eventKey: 1 })
    .lean();
  return res.json({ data: prefs });
};

export const upsertUserNotificationPreference = async (req, res) => {
  try {
    const { eventKey, channelOverrides, mutedUntil, snoozeRules, deliveryModeOverride } = req.body || {};
    if (!eventKey) {
      return res.status(400).json({ message: "eventKey is required" });
    }
    const query = { tenantId: req.tenantId, userId: req.user._id, eventKey };
    const before = await UserNotificationPreference.findOne(query).lean();
    const update = { channelOverrides, mutedUntil, snoozeRules, deliveryModeOverride };
    const pref = await UserNotificationPreference.findOneAndUpdate(
      query,
      { ...update, tenantId: req.tenantId, userId: req.user._id, eventKey },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeGovernanceAuditLog({
      req,
      action: "USER_NOTIF_PREF_UPSERT",
      targetType: "UserNotificationPreference",
      targetId: pref._id.toString(),
      diff: { before, after: pref },
      tenantId: req.tenantId,
    });
    return res.json({ data: pref });
  } catch (err) {
    console.error("upsertUserNotificationPreference", err);
    return res.status(500).json({ message: err.message });
  }
};
