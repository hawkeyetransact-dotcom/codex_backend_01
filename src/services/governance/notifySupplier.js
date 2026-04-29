import { dispatchNotification } from "./notificationDispatchService.js";
import { User } from "../../models/userModel.js";

/**
 * Thin wrapper around dispatchNotification for "buyer-side action notifies
 * one supplier". Always pass `actionUrl` so the bell can deep-link to the
 * supplier-side page for the record (e.g. "/supplier/prequalifications/<id>").
 *
 * Silent no-op if supplier is missing/inactive — callers don't need try/catch.
 */
export async function notifySupplier({
  tenantId, supplierUserId, eventKey, payload = {}, actionUrl = null,
}) {
  if (!supplierUserId || !eventKey) return [];
  const user = await User.findById(supplierUserId).select("_id status").lean();
  if (!user || user.status !== "ACTIVE") return [];
  return dispatchNotification({
    tenantId,
    eventKey,
    payload: actionUrl ? { ...payload, actionUrl } : payload,
    recipientUserIds: [supplierUserId],
  });
}

/**
 * Notify a list of users by id (assigned auditor / reviewer / approver).
 * Same actionUrl convention.
 */
export async function notifyUsers({
  tenantId, userIds = [], eventKey, payload = {}, actionUrl = null,
}) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length || !eventKey) return [];
  return dispatchNotification({
    tenantId,
    eventKey,
    payload: actionUrl ? { ...payload, actionUrl } : payload,
    recipientUserIds: ids,
  });
}
