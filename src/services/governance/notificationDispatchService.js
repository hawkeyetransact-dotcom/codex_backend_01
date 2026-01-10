import { NotificationOutbox } from "../../models/notificationOutboxModel.js";
import { User } from "../../models/userModel.js";
import { getEffectivePolicy } from "./notificationPolicyService.js";
import { resolvePersonaFromUser } from "./persona.js";

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
  return docs;
};
