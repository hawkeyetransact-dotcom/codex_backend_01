import NotificationDeliveryLog from "../models/notificationDeliveryLogModel.js";
import Notification from "../models/notificationModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import { renderTemplate } from "../utils/templateRenderer.js";
import { sendMail } from "../../../helpers/mailHelper.js";

const STATUS = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  SENT: "SENT",
  FAILED: "FAILED",
};

const canSendNow = (pref) => {
  if (!pref?.doNotDisturb?.startTime || !pref?.doNotDisturb?.endTime) return true;
  const now = new Date();
  const [sh, sm] = pref.doNotDisturb.startTime.split(":").map(Number);
  const [eh, em] = pref.doNotDisturb.endTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm || 0, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em || 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return !(now >= start && now <= end);
};

export const processPendingEmails = async () => {
  const pending = await NotificationDeliveryLog.find({ channel: "email", status: STATUS.PENDING }).limit(50);
  for (const log of pending) {
    try {
      const notif = await Notification.findById(log.notificationId);
      if (!notif) {
        log.status = STATUS.FAILED;
        log.error = "Notification missing";
        await log.save();
        continue;
      }
      const pref = await NotificationPreference.findOne({ tenantId: notif.tenantId, userId: notif.recipientUserId });
      if (pref && pref.channels && pref.channels.email === false) {
        log.status = STATUS.FAILED;
        log.error = "Email channel disabled";
        await log.save();
        continue;
      }
      if (!canSendNow(pref)) {
        log.status = STATUS.QUEUED;
        await log.save();
        continue;
      }
      const { html, text } = renderTemplate((notif.type || "system.alert").toUpperCase(), {
        subject: notif.title,
        header: notif.title,
        message: notif.message,
        dueDate: notif.expiresAt ? new Date(notif.expiresAt).toLocaleString() : undefined,
        action: notif.action,
      });
      const mailRes = await sendMail(notif.recipientEmail || "", notif.title, text, html);
      log.status = STATUS.SENT;
      log.metadata = { messageId: mailRes?.id || mailRes?.messageId };
      await log.save();
      notif.channelsDelivered = [...(notif.channelsDelivered || []), "email"];
      await notif.save();
    } catch (err) {
      const attempts = (log.metadata?.attempts || 0) + 1;
      const delayMs = Math.min(3, attempts) * Math.pow(2, attempts) * 1000;
      log.status = attempts >= 3 ? STATUS.FAILED : STATUS.PENDING;
      log.error = err.message;
      log.metadata = { ...(log.metadata || {}), attempts };
      if (attempts < 3) {
        log.nextAttemptAt = new Date(Date.now() + delayMs);
      }
      await log.save();
    }
  }
};
