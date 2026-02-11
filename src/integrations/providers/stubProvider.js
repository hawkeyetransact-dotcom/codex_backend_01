export const createStubProvider = (
  providerKey,
  displayName,
  options = {}
) => ({
  providerKey,
  displayName,
  category: options.category || "Generic",
  capabilities: {
    supportsWebhook: Boolean(options.supportsWebhook),
    supportsPolling: Boolean(options.supportsPolling),
    supportsSftp: Boolean(options.supportsSftp),
    supportsCsv: Boolean(options.supportsCsv),
    supportsApiAuth: options.supportsApiAuth !== false,
  },
  supportsWebhook: Boolean(options.supportsWebhook),
  supportsPolling: Boolean(options.supportsPolling),
  supportsSftp: Boolean(options.supportsSftp),
  supportsCsv: Boolean(options.supportsCsv),
  async testConnection(connection) {
    const mode = connection?.auth?.authType || "NONE";
    return {
      ok: true,
      details: `${displayName} connector configured in passive mode (auth: ${mode}).`,
    };
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
