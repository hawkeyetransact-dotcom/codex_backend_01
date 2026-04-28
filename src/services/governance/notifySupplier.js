import { dispatchNotification } from "./notificationDispatchService.js";
import { User } from "../../models/userModel.js";

/**
 * Thin wrapper around dispatchNotification for the common pattern of
 * "buyer-side action needs to alert one supplier".
 *
 * Usage:
 *   await notifySupplier({
 *     tenantId, supplierUserId, eventKey: "PQ_REQUESTED", payload: { pqId, scope }
 *   });
 *
 * If supplierUserId is missing/inactive the call is a silent no-op so callers
 * never have to wrap it in try/catch.
 */
export async function notifySupplier({ tenantId, supplierUserId, eventKey, payload = {} }) {
  if (!supplierUserId || !eventKey) return [];
  const user = await User.findById(supplierUserId).select("_id status").lean();
  if (!user || user.status !== "ACTIVE") return [];
  return dispatchNotification({
    tenantId,
    eventKey,
    payload,
    recipientUserIds: [supplierUserId],
  });
}

/**
 * Notify a list of users by id (e.g. assigned auditor + QA reviewers).
 */
export async function notifyUsers({ tenantId, userIds = [], eventKey, payload = {} }) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length || !eventKey) return [];
  return dispatchNotification({
    tenantId,
    eventKey,
    payload,
    recipientUserIds: ids,
  });
}
