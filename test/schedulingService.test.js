import assert from "assert";
import { generateCandidateSlots, scoreCandidateSlots } from "../src/services/scheduling/schedulingService.js";

const run = async () => {
  const schedule = {
    auditWindowStart: new Date("2026-01-01T00:00:00Z"),
    auditWindowEnd: new Date("2026-01-05T23:59:59Z"),
    durationDays: 1,
    dailyStart: "09:00",
    dailyEnd: "17:00",
    mode: "REMOTE",
  };

  const candidates = generateCandidateSlots(schedule);
  assert.ok(candidates.length >= 3, "should generate multiple candidate slots");

  const blocks = [
    {
      ownerType: "auditor",
      blockType: "blackout",
      start: new Date("2026-01-02T00:00:00Z"),
      end: new Date("2026-01-02T23:59:59Z"),
    },
    {
      ownerType: "supplierSite",
      blockType: "available",
      start: new Date("2026-01-01T00:00:00Z"),
      end: new Date("2026-01-05T23:59:59Z"),
    },
  ];

  const scored = scoreCandidateSlots(candidates, schedule, blocks);
  assert.ok(scored.length < candidates.length, "blackout should remove candidates");
  scored.forEach((slot) => {
    assert.ok(slot.scoreTotal >= 0 && slot.scoreTotal <= 100, "scoreTotal should be 0-100");
  });
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
