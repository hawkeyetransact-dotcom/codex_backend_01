export const createStubProvider = (providerKey, displayName) => ({
  providerKey,
  displayName,
  supportsWebhook: false,
  supportsPolling: false,
  async testConnection() {
    return { ok: false, details: `${displayName} connector is not implemented in V1.` };
  },
  async fetchDelta(_connection, cursor) {
    return { events: [], nextCursor: cursor || null };
  },
  normalize(rawEvent) {
    return { canonical: {}, payload: rawEvent?.payload || rawEvent || {} };
  },
  getDefaultMappingTemplates() {
    return [];
  },
});
