import { NotificationPolicy } from "../../models/notificationPolicyModel.js";
import { UserNotificationPreference } from "../../models/userNotificationPreferenceModel.js";

const DELIVERY_MODE_ORDER = {
  REALTIME: 0,
  DIGEST_DAILY: 1,
  DIGEST_WEEKLY: 2,
};

const applyDeliveryOverride = (baseMode, override) => {
  if (!override) return baseMode;
  if (!(baseMode in DELIVERY_MODE_ORDER)) return baseMode;
  if (!(override in DELIVERY_MODE_ORDER)) return baseMode;
  return DELIVERY_MODE_ORDER[override] >= DELIVERY_MODE_ORDER[baseMode] ? override : baseMode;
};

const clampChannels = (baseChannels, overrideChannels) => {
  if (!Array.isArray(overrideChannels) || !overrideChannels.length) return baseChannels;
  const baseSet = new Set(baseChannels || []);
  return overrideChannels.filter((ch) => baseSet.has(ch));
};

export const getEffectivePolicy = async ({ tenantId, persona, eventKey, userId }) => {
  const [platformPolicy, tenantPolicy, userPref] = await Promise.all([
    NotificationPolicy.findOne({ scope: "PLATFORM_DEFAULT", persona, eventKey }).lean(),
    tenantId
      ? NotificationPolicy.findOne({ scope: "TENANT_OVERRIDE", tenantId, persona, eventKey }).lean()
      : null,
    tenantId && userId
      ? UserNotificationPreference.findOne({ tenantId, userId, eventKey }).lean()
      : null,
  ]);

  const basePolicy = tenantPolicy || platformPolicy;
  if (!basePolicy) {
    return {
      isEnabled: false,
      reason: "NO_POLICY",
      allowedChannels: [],
      deliveryMode: "REALTIME",
      source: null,
    };
  }
  if (basePolicy.isEnabled === false) {
    return {
      isEnabled: false,
      reason: "POLICY_DISABLED",
      allowedChannels: basePolicy.allowedChannels || [],
      deliveryMode: basePolicy.deliveryMode || "REALTIME",
      source: tenantPolicy ? "TENANT_OVERRIDE" : "PLATFORM_DEFAULT",
    };
  }

  let allowedChannels = basePolicy.allowedChannels || [];
  let deliveryMode = basePolicy.deliveryMode || "REALTIME";
  let isEnabled = true;
  let mutedUntil = null;

  if (userPref) {
    allowedChannels = clampChannels(allowedChannels, userPref.channelOverrides);
    deliveryMode = applyDeliveryOverride(deliveryMode, userPref.deliveryModeOverride);
    mutedUntil = userPref.mutedUntil || null;
    if (mutedUntil && mutedUntil > new Date()) {
      isEnabled = false;
    }
  }

  if (!allowedChannels.length) {
    isEnabled = false;
  }

  return {
    isEnabled,
    allowedChannels,
    deliveryMode,
    quietHours: basePolicy.quietHours,
    escalation: basePolicy.escalation,
    mutedUntil,
    source: tenantPolicy ? "TENANT_OVERRIDE" : "PLATFORM_DEFAULT",
  };
};

export const listPolicies = async ({ scope, tenantId }) => {
  const query = { scope };
  if (tenantId) query.tenantId = tenantId;
  return NotificationPolicy.find(query).sort({ eventKey: 1, persona: 1 }).lean();
};

export const upsertPlatformDefaultPolicy = async ({
  persona,
  eventKey,
  allowedChannels,
  deliveryMode,
  quietHours,
  escalation,
  isEnabled,
  createdBy,
}) => {
  const existing = await NotificationPolicy.findOne({ scope: "PLATFORM_DEFAULT", persona, eventKey });
  const version = (existing?.version || 0) + 1;
  const update = {
    scope: "PLATFORM_DEFAULT",
    tenantId: null,
    persona,
    eventKey,
    allowedChannels,
    deliveryMode,
    quietHours,
    escalation,
    isEnabled,
    version,
    createdBy,
  };
  return NotificationPolicy.findOneAndUpdate({ scope: "PLATFORM_DEFAULT", persona, eventKey }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};

export const upsertTenantOverridePolicy = async ({
  tenantId,
  persona,
  eventKey,
  allowedChannels,
  deliveryMode,
  quietHours,
  escalation,
  isEnabled,
  createdBy,
}) => {
  const platformPolicy = await NotificationPolicy.findOne({ scope: "PLATFORM_DEFAULT", persona, eventKey }).lean();
  if (!platformPolicy) {
    throw new Error("Platform default policy missing");
  }

  const allowedSet = new Set(platformPolicy.allowedChannels || []);
  const constrainedChannels = Array.isArray(allowedChannels)
    ? allowedChannels.filter((ch) => allowedSet.has(ch))
    : platformPolicy.allowedChannels;

  const existing = await NotificationPolicy.findOne({ scope: "TENANT_OVERRIDE", tenantId, persona, eventKey });
  const version = (existing?.version || 0) + 1;
  const update = {
    scope: "TENANT_OVERRIDE",
    tenantId,
    persona,
    eventKey,
    allowedChannels: constrainedChannels,
    deliveryMode: deliveryMode || platformPolicy.deliveryMode,
    quietHours: quietHours || platformPolicy.quietHours,
    escalation: escalation || platformPolicy.escalation,
    isEnabled,
    version,
    createdBy,
  };

  return NotificationPolicy.findOneAndUpdate({ scope: "TENANT_OVERRIDE", tenantId, persona, eventKey }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
};
