import assert from "assert";
import { calculateBaseline, calculateHawkeye, determineRiskBand } from "../src/services/risk/scoringV1.js";
import { buildReasons } from "../src/services/risk/reasons.js";

const run = () => {
  const baseline = calculateBaseline({
    fda483CountRecent24m: 0,
    warningLetterRecent24m: false,
    importAlertActive: false,
    inspectionsOpenCount: 0,
    recalls: [],
  });
  assert.strictEqual(baseline.baselineScore, 40);

  const capped = calculateBaseline({
    fda483CountRecent24m: 10,
    inspectionsOpenCount: 0,
    recalls: [{ class: "I", date: new Date() }, { class: "I", date: new Date() }],
  });
  assert.strictEqual(capped.penalties.fda483Penalty, 16);
  assert.strictEqual(capped.penalties.recallsPenalty, 16);

  const followupFast = calculateHawkeye({
    questionnaireOnTimeRate: 1,
    avgResponseHoursToFollowups: 20,
  });
  assert.ok(followupFast.components.responsivenessScore >= 20);

  const followupSlow = calculateHawkeye({
    questionnaireOnTimeRate: 1,
    avgResponseHoursToFollowups: 100,
  });
  assert.ok(followupSlow.components.responsivenessScore < followupFast.components.responsivenessScore);

  const capaLow = calculateHawkeye({
    questionnaireOnTimeRate: 1,
    avgResponseHoursToFollowups: 10,
    capaOverdueCount: 10,
    capaReopenRate: 1,
  });
  assert.strictEqual(capaLow.components.capaScore, 0);

  const capaHigh = calculateHawkeye({
    questionnaireOnTimeRate: 1,
    avgResponseHoursToFollowups: 10,
    capaOverdueCount: 0,
    capaReopenRate: 0,
  });
  assert.strictEqual(capaHigh.components.capaScore, 20);

  assert.strictEqual(determineRiskBand(59), "High");
  assert.strictEqual(determineRiskBand(60), "Medium");
  assert.strictEqual(determineRiskBand(79), "Medium");
  assert.strictEqual(determineRiskBand(80), "Low");

  const reasons = buildReasons({
    publicSignals: { fda483CountRecent24m: 2, warningLetterRecent24m: true, inspectionsOpenCount: 1 },
    metrics: { questionnaireOnTimeRate: 0.5, avgResponseHoursToFollowups: 140, capaOverdueCount: 3 },
    penalties: { fda483Penalty: 8, warningPenalty: 12, inspectionsPenalty: 3, recallsPenalty: 0 },
    components: { responsivenessScore: 5, capaScore: 2, transparencyScore: 5 },
  });
  assert.ok(reasons.length <= 5);
  assert.ok(reasons.some((item) => item.includes("FDA 483")));
};

run();
