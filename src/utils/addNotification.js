// utils/addNotification.js
// Bridge helper: write notifications into the module schema (tenant-scoped) and legacy collection for compatibility.
import ModuleNotification from "../modules/notifications/models/notificationModel.js";
import NotificationDeliveryLog from "../modules/notifications/models/notificationDeliveryLogModel.js";
import LegacyNotification from "../models/notificationModel.js";

export const addNotification = async ({
  senderId,
  receiverId,
  senderRole,
  receiverRole,
  tenantId,
  title,
  message,
  link = "",
  entityId,
  entityType = "AuditRequest",
  severity = "info",
}) => {
  try {
    // New module-based notification (used by inbox/bell APIs)
    if (tenantId && receiverId) {
      const moduleDoc = await ModuleNotification.create({
        tenantId,
        recipientUserId: receiverId,
        recipientRole: receiverRole,
        type: "audit.status.changed",
        severity,
        title: title || message || "Notification",
        message: message || "",
        entityType,
        entityId: entityId?.toString?.() || entityId,
        action: link ? { url: link, label: "View" } : undefined,
        channels: ["inApp"],
      });
      await NotificationDeliveryLog.create({
        tenantId,
        notificationId: moduleDoc._id,
        channel: "inApp",
        status: "sent",
      });
      console.log("notification:module saved", moduleDoc._id.toString());
    } else {
      console.warn("notification:missing tenantId/receiverId, skipping module notification");
    }

    // Legacy collection for backward compatibility
    const legacyDoc = new LegacyNotification({
      senderId,
      receiverId,
      senderRole,
      receiverRole,
      message,
      link,
    });
    const saved = await legacyDoc.save();
    console.log("notification:legacy saved", saved._id.toString());
  } catch (err) {
    console.error("Error saving notification:", err.message);
  }
};
