import { buildBreakdown } from "./breakdown.js";
import { buildReasons } from "./reasons.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sum = (values) => values.reduce((acc, val) => acc + (Number(val) || 0), 0);

const recallPenaltyFor = (recallClass) => {
  if (recallClass === "I") return 10;
  if (recallClass === "II") return 6;
  if (recallClass === "III") return 2;
  return 0;
};

export const calculateBaseline = (publicSignals = {}) => {
  const fda483Count = Number(publicSignals.fda483CountRecent24m || 0);
  const inspectionsOpen = Number(publicSignals.inspectionsOpenCount || 0);
  const warningLetter = Boolean(publicSignals.warningLetterRecent24m);
  const importAlert = Boolean(publicSignals.importAlertActive);
  const recalls = Array.isArray(publicSignals.recalls) ? publicSignals.recalls : [];

  const fda483Penalty = clamp(fda483Count * 4, 0, 16);
  const warningPenalty = warningLetter ? 12 : 0;
  const importPenalty = importAlert ? 12 : 0;
  const inspectionsPenalty = clamp(inspectionsOpen * 3, 0, 9);
  const recallsPenaltyRaw = sum(recalls.map((recall) => recallPenaltyFor(recall.class)));
  const recallsPenalty = clamp(recallsPenaltyRaw, 0, 16);

  const totalPenalty = fda483Penalty + warningPenalty + importPenalty + inspectionsPenalty + recallsPenalty;
  const baselineScore = clamp(40 - totalPenalty, 0, 40);

  return {
    baselineScore,
    penalties: {
      fda483Penalty,
      warningPenalty,
      importPenalty,
      inspectionsPenalty,
      recallsPenalty,
      totalPenalty,
    },
  };
};

export const calculateHawkeye = (metrics = {}) => {
  const onTimeRate = clamp(Number(metrics.questionnaireOnTimeRate || 0), 0, 1);
  const avgFollowupHours = Number(metrics.avgResponseHoursToFollowups || 0);
  const capaOverdueCount = Number(metrics.capaOverdueCount || 0);
  const capaReopenRate = clamp(Number(metrics.capaReopenRate || 0), 0, 1);
  const evidenceQualityScore = clamp(Number(metrics.evidenceQualityScore || 0), 0, 100);
  const docCompletenessScore = clamp(Number(metrics.docCompletenessScore || 0), 0, 100);

  const onTimeComponent = onTimeRate * 15;
  let followupComponent = 0;
  if (avgFollowupHours <= 24) followupComponent = 10;
  else if (avgFollowupHours <= 72) followupComponent = 6;
  else if (avgFollowupHours <= 120) followupComponent = 3;

  const responsivenessScore = clamp(onTimeComponent + followupComponent, 0, 25);

  const reopenComponent = (1 - capaReopenRate) * 10;
  const overduePenalty = capaOverdueCount * 3;
  const capaScore = clamp(10 + reopenComponent - overduePenalty, 0, 20);

  const evidenceComponent = evidenceQualityScore * 0.08;
  const docComponent = docCompletenessScore * 0.07;
  const transparencyScore = clamp(evidenceComponent + docComponent, 0, 15);

  const hawkeyeScore = clamp(responsivenessScore + capaScore + transparencyScore, 0, 60);

  return {
    hawkeyeScore,
    components: {
      responsivenessScore,
      capaScore,
      transparencyScore,
      onTimeRate,
      avgFollowupHours,
      capaOverdueCount,
      capaReopenRate,
      evidenceQualityScore,
      docCompletenessScore,
    },
  };
};

export const determineRiskBand = (finalScore) => {
  if (finalScore >= 80) return "Low";
  if (finalScore >= 60) return "Medium";
  return "High";
};

export const scoreV1 = ({ publicSignals = {}, metrics = {} }) => {
  const baseline = calculateBaseline(publicSignals);
  const hawkeye = calculateHawkeye(metrics);
  const finalScore = clamp(baseline.baselineScore + hawkeye.hawkeyeScore, 0, 100);
  const riskBand = determineRiskBand(finalScore);

  const breakdown = buildBreakdown({
    penalties: baseline.penalties,
    components: hawkeye.components,
  });

  const reasons = buildReasons({
    publicSignals,
    metrics,
    penalties: baseline.penalties,
    components: hawkeye.components,
  });

  return {
    baselineScore: baseline.baselineScore,
    hawkeyeScore: hawkeye.hawkeyeScore,
    finalScore,
    riskBand,
    breakdown,
    reasons,
    debug: {
      penalties: baseline.penalties,
      components: hawkeye.components,
    },
  };
};
