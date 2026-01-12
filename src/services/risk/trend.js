const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const stdDev = (values) => {
  if (!values.length) return 0;
  const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

export const computeTrend = (snapshots = [], latestScore) => {
  const scores = snapshots.map((snap) => Number(snap.finalScore || 0));
  const baseline = scores.length ? scores[0] : latestScore || 0;
  const previous = scores.length > 1 ? scores[1] : baseline;
  const delta = baseline - previous;

  let riskTrendSlope = "FLAT";
  if (delta >= 5) riskTrendSlope = "UP";
  if (delta <= -5) riskTrendSlope = "DOWN";

  const volatility = stdDev(scores.slice(0, 6));
  const trendScore = clamp(50 + delta, 0, 100);

  const earlyWarnings = [];
  if (delta <= -8) earlyWarnings.push("Risk score dropping rapidly");
  if (volatility > 10) earlyWarnings.push("Score volatility is high");

  return {
    riskTrendSlope,
    volatility: Number(volatility.toFixed(2)),
    earlyWarnings,
    trendScore,
  };
};
