import { normalizeWithMapping } from "./utils.js";

export const genericWebhookProvider = {
  providerKey: "generic_webhook",
  displayName: "Generic Webhook",
  supportsWebhook: true,
  supportsPolling: false,
  async testConnection() {
    return { ok: true, details: "Webhook connections are validated on first event." };
  },
  async fetchDelta(_connection, cursor) {
    return { events: [], nextCursor: cursor || null };
  },
  normalize(rawEvent, mappingConfig) {
    const { canonical, payload } = normalizeWithMapping(rawEvent, mappingConfig);
    return { canonical, payload };
  },
  getDefaultMappingTemplates() {
    return [];
  },
};
