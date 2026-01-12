import { IntegrationConnection } from "../../models/integrationConnectionModel.js";
import { encryptSecret } from "./crypto.js";

const sanitizeAuthPayload = (body = {}) => {
  const authType = body.authType || body.auth?.authType || "NONE";
  const credentials = body.credentials || body.auth?.credentials || null;
  const tokenExpiresAt = body.tokenExpiresAt || body.auth?.tokenExpiresAt;
  const auth = { authType, tokenExpiresAt };
  if (credentials) {
    auth.credentialsRef = encryptSecret(credentials);
  }
  return auth;
};

const pickConnectionFields = (body = {}) => {
  const payload = {};
  [
    "providerKey",
    "name",
    "status",
    "endpoint",
    "selectedFeeds",
    "syncMode",
    "schedule",
    "visibilityPolicy",
    "demoMode",
  ].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  });
  if (body.auth || body.credentials || body.authType) {
    payload.auth = sanitizeAuthPayload(body);
  }
  return payload;
};

export const createConnection = async ({ tenantId, supplierId, body, userId }) => {
  const payload = pickConnectionFields(body);
  payload.tenantId = tenantId || null;
  payload.supplierId = supplierId || null;
  payload.createdBy = userId;
  payload.updatedBy = userId;
  return IntegrationConnection.create(payload);
};

export const updateConnection = async ({ connectionId, body, userId }) => {
  const payload = pickConnectionFields(body);
  payload.updatedBy = userId;
  return IntegrationConnection.findByIdAndUpdate(connectionId, { $set: payload }, { new: true });
};

export const setConnectionStatus = async ({ connectionId, status, userId, schedule }) => {
  const update = { status, updatedBy: userId };
  if (schedule) update.schedule = schedule;
  return IntegrationConnection.findByIdAndUpdate(connectionId, { $set: update }, { new: true });
};
