import assert from "assert";
import { demoSimulatorProvider } from "../src/integrations/providers/demoSimulator.js";

const run = () => {
  const events = demoSimulatorProvider.generateEvents({
    connectionId: "demo-connection",
    eventType: "CAPA",
    count: 3,
    scenario: "overdue_capa_spike",
  });

  assert.strictEqual(events.length, 3);
  events.forEach((event) => {
    assert.strictEqual(event.eventType, "CAPA");
    assert.ok(event.payload);
    assert.ok(event.payload.dueDate);
  });
};

run();
