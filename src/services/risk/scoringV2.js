const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const scoreV2 = ({ baseScore, trend, evidenceTrustScore, networkExposureScore }) => {
  let adjustment = 0;

  if (trend?.riskTrendSlope === "DOWN") adjustment -= 5;
  if (trend?.riskTrendSlope === "UP") adjustment += 3;

  if (typeof evidenceTrustScore === "number") {
    const penalty = clamp((80 - evidenceTrustScore) * 0.1, 0, 8);
    adjustment -= penalty;
  }

  if (typeof networkExposureScore === "number") {
    const penalty = clamp(networkExposureScore * 0.1, 0, 10);
    adjustment -= penalty;
  }

  const finalScoreV2 = clamp((Number(baseScore) || 0) + adjustment, 0, 100);

  return { finalScoreV2, adjustment };
};
