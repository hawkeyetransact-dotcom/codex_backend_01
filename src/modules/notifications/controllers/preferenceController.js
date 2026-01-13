import NotificationPreference from "../models/notificationPreferenceModel.js";

const defaultPrefs = (tenantId, userId) => ({
  tenantId,
  userId,
  channels: { inApp: true, email: true },
  digestMode: "immediate",
  doNotDisturb: { startTime: null, endTime: null },
  mutedTypes: [],
  subscribedTypes: [],
  minimumSeverity: "info",
});

export const getPreferences = async (req, res) => {
  let prefs = await NotificationPreference.findOne({ tenantId: req.tenantId, userId: req.user._id });
  if (!prefs) {
    prefs = await NotificationPreference.create(defaultPrefs(req.tenantId, req.user._id));
  }
  res.json({ success: true, data: prefs });
};

export const updatePreferences = async (req, res) => {
  const update = req.body || {};
  if (update.digest) {
    update.digestMode = update.digest;
    delete update.digest;
  }
  if (update.dnd) {
    update.doNotDisturb = update.dnd;
    delete update.dnd;
  }
  let prefs = await NotificationPreference.findOne({ tenantId: req.tenantId, userId: req.user._id });
  if (!prefs) {
    prefs = await NotificationPreference.create(defaultPrefs(req.tenantId, req.user._id));
  }
  Object.assign(prefs, update);
  await prefs.save();
  res.json({ success: true, data: prefs });
};
