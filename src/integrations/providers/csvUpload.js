import { normalizeWithMapping } from "./utils.js";

export const csvUploadProvider = {
  providerKey: "csv_upload",
  displayName: "CSV Upload",
  supportsWebhook: false,
  supportsPolling: false,
  supportsCsv: true,
  async testConnection() {
    return { ok: true, details: "CSV upload is available for this provider." };
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
