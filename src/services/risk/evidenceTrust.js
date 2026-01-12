const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const severityPenalty = (severity) => {
  if (severity === "HIGH") return 25;
  if (severity === "MEDIUM") return 12;
  if (severity === "LOW") return 5;
  return 0;
};

export const computeEvidenceTrust = (findings = []) => {
  const penalties = findings.map((finding) => severityPenalty(finding.severity));
  const totalPenalty = penalties.reduce((acc, val) => acc + val, 0);
  const score = clamp(100 - totalPenalty, 0, 100);

  const reasons = findings.slice(0, 5).map((finding) => {
    const label = finding.findingType.replace(/_/g, " ").toLowerCase();
    return `Evidence finding: ${label} (${finding.severity})`;
  });

  return { score, reasons };
};
