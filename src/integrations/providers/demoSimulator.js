import crypto from "crypto";
import { normalizeWithMapping } from "./utils.js";

const hashSeed = (value) => {
  const hash = crypto.createHash("sha256").update(String(value || "")).digest("hex");
  return parseInt(hash.slice(0, 8), 16) || 1;
};

const createRng = (seed) => {
  let state = seed % 2147483647;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state & 2147483647) / 2147483647;
  };
};

const pickSeverity = (rand) => {
  const roll = rand();
  if (roll > 0.85) return "Critical";
  if (roll > 0.6) return "Major";
  if (roll > 0.3) return "Minor";
  return "Info";
};

const buildEventPayload = ({ index, eventType, scenario, rand }) => {
  const now = new Date();
  const openedDate = new Date(now.getTime() - (index + 1) * 86400000);
  const dueDate = new Date(openedDate.getTime() + 10 * 86400000);
  const closedDate = scenario === "normal_week" && rand() > 0.4 ? new Date(openedDate.getTime() + 6 * 86400000) : null;
  const status = closedDate ? "Closed" : "Open";
  return {
    id: `${eventType}-${scenario}-${index + 1}`,
    title: `${eventType} ${index + 1}`,
    status,
    severity: pickSeverity(rand),
    openedDate: openedDate.toISOString(),
    dueDate: dueDate.toISOString(),
    closedDate: closedDate ? closedDate.toISOString() : null,
    repeatEvent: scenario === "repeat_deviation" && rand() > 0.4,
  };
};

const applyScenarioTweaks = (payload, scenario) => {
  if (scenario === "overdue_capa_spike") {
    payload.status = "Open";
    payload.dueDate = new Date(Date.now() - 3 * 86400000).toISOString();
  }
  if (scenario === "repeat_deviation") {
    payload.repeatEvent = true;
  }
  return payload;
};

export const demoSimulatorProvider = {
  providerKey: "demo_simulator",
  displayName: "Demo Simulator",
  supportsWebhook: false,
  supportsPolling: true,
  async testConnection() {
    return { ok: true, details: "Demo simulator is always available." };
  },
  async fetchDelta(_connection, cursor) {
    return { events: [], nextCursor: cursor || null };
  },
  normalize(rawEvent, mappingConfig) {
    const { canonical, payload } = normalizeWithMapping(rawEvent, mappingConfig);
    return { canonical, payload };
  },
  generateEvents({ connectionId, eventType, count, scenario }) {
    const seed = hashSeed(`${connectionId}-${eventType}-${scenario}`);
    const rand = createRng(seed);
    const total = Math.max(1, count || 5);
    return Array.from({ length: total }).map((_val, index) => {
      const payload = buildEventPayload({ index, eventType, scenario, rand });
      const adjusted = applyScenarioTweaks(payload, scenario);
      return {
        eventType,
        sourceEventId: adjusted.id,
        payload: adjusted,
      };
    });
  },
  getDefaultMappingTemplates() {
    return [];
  },
};
