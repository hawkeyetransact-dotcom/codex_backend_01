import { NotificationOutbox } from "../../models/notificationOutboxModel.js";
import { User } from "../../models/userModel.js";
import ModuleNotification from "../../modules/notifications/models/notificationModel.js";
import { getEffectivePolicy } from "./notificationPolicyService.js";
import { resolvePersonaFromUser } from "./persona.js";

// Human-friendly text per event key for the bell. Falls back to the key itself.
const EVENT_LABELS = {
  PQ_REQUESTED: { title: "Pre-qualification request", body: "A buyer has opened a pre-qualification on you." },
  PQ_DECISION: { title: "Pre-qualification decision", body: "Your pre-qualification has a decision." },
  DEVIATION_REPORTED: { title: "Deviation reported", body: "A deviation was attributed to your supply." },
  DEVIATION_ASSIGNED: { title: "Deviation assigned", body: "A deviation has been assigned to you for investigation." },
  COMPLAINT_REPORTED: { title: "Complaint reported", body: "A complaint was attributed to your supply." },
  COMPLAINT_ASSIGNED: { title: "Complaint assigned", body: "A complaint has been assigned to you for investigation." },
  CHANGE_CONTROL_OPENED: { title: "Change control opened", body: "A change control affecting you has been opened." },
  CHANGE_CONTROL_DECISION: { title: "Change control decision", body: "A change control has a final decision." },
  CAPA_INTAKE_OPENED: { title: "CAPA intake opened", body: "A CAPA has been opened against you." },
  CAPA_ASSIGNED: { title: "CAPA assigned to you", body: "You have been assigned ownership of a CAPA." },
};

const severityForEvent = (eventKey) => {
  if (/REPORTED|OPENED|REQUESTED/.test(eventKey)) return "warning";
  if (/REJECTED|FAILED/.test(eventKey)) return "critical";
  return "info";
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const computeScheduledAt = (deliveryMode) => {
  const now = new Date();
  if (deliveryMode === "DIGEST_DAILY") return addDays(now, 1);
  if (deliveryMode === "DIGEST_WEEKLY") return addDays(now, 7);
  return now;
};

const resolveRecipientsByPersona = async ({ tenantId, persona }) => {
  if (persona === "PLATFORM_ADMIN") {
    const users = await User.find({ adminScope: "PLATFORM", status: "ACTIVE" }).select("_id").lean();
    return users.map((u) => u._id);
  }
  const roleMap = {
    TENANT_ADMIN: ["tenant_admin", "admin", "superadmin"],
    AUDITOR: ["auditor"],
    SUPPLIER_ADMIN: ["supplier"],
    SUPPLIER_USER: ["supplierUser"],
    BUYER_USER: ["buyer"],
  };
  const roles = roleMap[persona] || [];
  if (!tenantId || !roles.length) return [];
  const users = await User.find({ tenant_id: tenantId, role: { $in: roles }, status: "ACTIVE" })
    .select("_id role adminScope")
    .lean();
  return users.map((u) => u._id);
};

export const dispatchNotification = async ({
  eventKey,
  payload,
  tenantId,
  recipientUserIds = [],
  persona,
  resolveRecipients,
}) => {
  let recipients = recipientUserIds || [];
  if (!recipients.length && typeof resolveRecipients === "function") {
    recipients = await resolveRecipients();
  }
  if (!recipients.length && persona) {
    recipients = await resolveRecipientsByPersona({ tenantId, persona });
  }
  if (!recipients.length) return [];

  const outboxDocs = [];
  for (const userId of recipients) {
    const user = await User.findById(userId).select("role adminScope").lean();
    const resolvedPersona = persona || resolvePersonaFromUser(user);
    const policy = await getEffectivePolicy({ tenantId, persona: resolvedPersona, eventKey, userId });
    if (!policy?.isEnabled) continue;
    const scheduledAt = computeScheduledAt(policy.deliveryMode);
    for (const channel of policy.allowedChannels || []) {
      outboxDocs.push({
        tenantId,
        userId,
        eventKey,
        payload,
        channel,
        status: "PENDING",
        scheduledAt,
      });
    }
  }

  if (!outboxDocs.length) return [];
  const docs = await NotificationOutbox.insertMany(outboxDocs);

  // Bridge into the module Notification collection so the in-app bell shows it.
  // One row per IN_APP recipient (dedup by userId).
  const inAppUsers = [...new Set(outboxDocs.filter((d) => d.channel === "IN_APP").map((d) => String(d.userId)))];
  if (inAppUsers.length) {
    const label = EVENT_LABELS[eventKey] || { title: eventKey, body: eventKey };
    const actionUrl = payload?.actionUrl || null;
    const moduleRows = inAppUsers.map((uid) => ({
      tenantId,
      recipientUserId: uid,
      type: eventKey,
      severity: severityForEvent(eventKey),
      title: label.title,
      message: label.body,
      action: actionUrl ? { url: actionUrl, label: "Open" } : undefined,
      metadata: payload || {},
      channels: ["inApp"],
      isRead: false,
    }));
    try {
      await ModuleNotification.insertMany(moduleRows, { ordered: false });
    } catch (e) {
      console.error("ModuleNotification bridge insert failed:", e?.message);
    }
  }

  return docs;
};
