const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const computeBuyerWeightedScore = ({ breakdown = {}, profile, productType }) => {
  const weights = profile?.weights || {};
  const entries = Object.entries(weights).filter(([key]) => typeof breakdown[key] === "number");
  if (!entries.length) return null;

  const totalWeight = entries.reduce((acc, [, weight]) => acc + (Number(weight) || 0), 0);
  if (!totalWeight) return null;

  const rawScore = entries.reduce((acc, [key, weight]) => acc + breakdown[key] * (Number(weight) || 0), 0);
  let score = rawScore / totalWeight;

  if (productType && Array.isArray(profile?.productCriticalityRules)) {
    const rule = profile.productCriticalityRules.find((item) => item.productType === productType);
    if (rule && typeof rule.multiplier === "number") {
      score *= rule.multiplier;
    }
  }

  return clamp(score, 0, 100);
};
