const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const computeNetworkExposure = ({ links = [], neighborScores = {} }) => {
  if (!links.length) return { score: 0, exposurePaths: [] };

  const pathScores = links.map((link) => {
    const neighborScore = Number(neighborScores[String(link.toSupplierId)] || 0);
    const riskPenalty = clamp((100 - neighborScore) / 100, 0, 1);
    const weighted = (Number(link.strength || 0) || 0) * riskPenalty;
    return {
      toSupplierId: link.toSupplierId,
      linkType: link.linkType,
      strength: link.strength,
      score: weighted,
    };
  });

  const exposureRaw = pathScores.reduce((acc, item) => acc + item.score, 0);
  const score = clamp(exposureRaw * 100, 0, 100);

  const exposurePaths = pathScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((path) => ({
      toSupplierId: path.toSupplierId,
      linkType: path.linkType,
      strength: path.strength,
    }));

  return { score, exposurePaths };
};
