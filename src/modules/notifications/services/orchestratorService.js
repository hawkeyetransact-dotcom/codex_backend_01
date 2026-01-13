import crypto from "crypto";
import Notification from "../models/notificationModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import NotificationDeliveryLog from "../models/notificationDeliveryLogModel.js";
import { User } from "../../../models/userModel.js";
import { AuditRequestMaster } from "../../../models/auditRequestsMasterModel.js";
import { notificationRules, throttleWindows } from "../notificationRules.js";
import { emitNotification } from "./socket.js";

const hashKey = (str) => crypto.createHash("sha256").update(str).digest("hex");

const applyThrottle = async (rule, key, tenantId, recipientUserId) => {
  const windowMs = throttleWindows[rule.throttle || "none"] || 0;
  if (!windowMs) return false;
  const since = new Date(Date.now() - windowMs);
  const existing = await Notification.findOne({
    tenantId,
    recipientUserId,
    idempotencyKey: key,
    createdAt: { $gte: since },
    isDeleted: false,
  });
  return !!existing;
};

const resolveRecipients = async (strategy, context) => {
  const { tenantId, recipientUserIds, role } = context;
  if (strategy === "explicit" && recipientUserIds?.length) return recipientUserIds;
  if (strategy === "role" && role) {
    const users = await User.find({ tenant_id: tenantId, role, status: "ACTIVE" }, { _id: 1 });
    return users.map((u) => u._id);
  }
  if (strategy === "tenant_admins") {
    const users = await User.find({ tenant_id: tenantId, role: { $in: ["tenant_admin", "superadmin"] }, status: "ACTIVE" }, { _id: 1 });
    return users.map((u) => u._id);
  }
  if (strategy === "assigned_auditor" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.auditor_id) return [audit.auditor_id];
  }
  if (strategy === "buyer_owner" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.create_by_buyer_id) return [audit.create_by_buyer_id];
  }
  if (strategy === "supplier_owner" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.supplier_id) return [audit.supplier_id];
  }
  return [];
};

const shouldDeliver = (pref, eventType, severity, rule, actionRequired) => {
  if (pref.mutedTypes?.includes(eventType)) return false;
  if (rule?.requiresSubscription) {
    const subscribed = pref.subscribedTypes || [];
    if (!actionRequired && !subscribed.includes(eventType)) return false;
  }
  const order = { info: 1, warning: 2, critical: 3 };
  if (order[severity] < order[pref.minimumSeverity || "info"]) return false;
  return true;
};

const computeDndSnooze = (pref) => {
  if (!pref.doNotDisturb?.startTime || !pref.doNotDisturb?.endTime) return null;
  const now = new Date();
  const [sh, sm] = pref.doNotDisturb.startTime.split(":").map(Number);
  const [eh, em] = pref.doNotDisturb.endTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm || 0, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em || 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  if (now >= start && now <= end) return end;
  return null;
};

const resolveRule = (eventName) => {
  if (notificationRules[eventName]) return notificationRules[eventName];
  if (eventName && eventName.startsWith("milestone.")) {
    return { severity: "info", channels: ["inApp"], throttle: "once_per_24h", requiresSubscription: true };
  }
  return {};
};

export const NotificationOrchestratorService = {
  emitEvent: async (eventName, payload, context) => {
    const rule = resolveRule(eventName);
    const severity = payload.severity || rule.severity || "info";
    const channels = payload.channels || rule.channels || ["inApp"];
    const tenantId = context.tenantId;
    const strategy = payload.recipientStrategy || rule.recipientStrategy || "explicit";
    const recipientUserIds =
      payload.recipientUserIds || (await resolveRecipients(strategy, { ...context, entityType: payload.entityType, entityId: payload.entityId, role: payload.role }));

    const created = [];

    for (const recipientId of recipientUserIds) {
      const idKey = hashKey(
        [
          tenantId || "",
          recipientId || "",
          eventName || "",
          payload.entityType || "",
          payload.entityId || "",
          payload.step || "",
        ].join("|")
      );
      const throttled = await applyThrottle(rule, idKey, tenantId, recipientId);
      if (throttled) continue;

      const pref = await NotificationPreference.findOne({ tenantId, userId: recipientId });
      const preferences = pref || {};
      const dndUntil = pref ? computeDndSnooze(pref) : null;
      const deliver = pref
        ? shouldDeliver(pref, eventName, severity, rule, payload.actionRequired)
        : !rule.requiresSubscription || payload.actionRequired;
      if (!deliver) continue;

      const doc = await Notification.create({
        tenantId,
        recipientUserId: recipientId,
        recipientRole: context.role,
        type: eventName,
        severity,
        title: payload.title || eventName,
        message: payload.message || "",
        entityType: payload.entityType,
        entityId: payload.entityId,
        action: payload.action,
        channels,
        snoozedUntil: dndUntil,
        idempotencyKey: idKey,
      });
      await NotificationDeliveryLog.create({
        tenantId,
        notificationId: doc._id,
        channel: "inApp",
        status: "sent",
      });
      emitNotification(tenantId, recipientId, doc);
      created.push(doc);
    }
    return created;
  },
};
