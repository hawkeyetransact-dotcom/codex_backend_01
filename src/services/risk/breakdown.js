const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ratioScore = (value, max) => {
  if (!max) return 0;
  return clamp((value / max) * 100, 0, 100);
};

export const buildBreakdown = ({ penalties, components }) => {
  const regulatoryPenalty = (penalties.warningPenalty || 0) + (penalties.importPenalty || 0);
  const inspectionsPenalty = (penalties.fda483Penalty || 0) + (penalties.inspectionsPenalty || 0);
  const recallsPenalty = penalties.recallsPenalty || 0;

  const regulatoryScore = clamp(100 - ratioScore(regulatoryPenalty, 24), 0, 100);
  const inspectionsScore = clamp(100 - ratioScore(inspectionsPenalty, 25), 0, 100);
  const recallsScore = clamp(100 - ratioScore(recallsPenalty, 16), 0, 100);

  const responsivenessScore = ratioScore(components.responsivenessScore || 0, 25);
  const capaScore = ratioScore(components.capaScore || 0, 20);
  const transparencyScore = ratioScore(components.transparencyScore || 0, 15);

  return {
    regulatory: regulatoryScore,
    inspections: inspectionsScore,
    recalls: recallsScore,
    responsiveness: responsivenessScore,
    capa: capaScore,
    transparency: transparencyScore,
  };
};
