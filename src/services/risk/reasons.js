const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const addReason = (reasons, label, weight) => {
  if (!weight || weight <= 0) return;
  reasons.push({ label, weight });
};

export const buildReasons = ({ publicSignals = {}, metrics = {}, penalties = {}, components = {} }) => {
  const reasons = [];

  const fda483Count = Number(publicSignals.fda483CountRecent24m || 0);
  const inspectionsOpen = Number(publicSignals.inspectionsOpenCount || 0);
  const warningLetter = Boolean(publicSignals.warningLetterRecent24m);
  const importAlert = Boolean(publicSignals.importAlertActive);
  const recalls = Array.isArray(publicSignals.recalls) ? publicSignals.recalls : [];

  if (fda483Count > 0) {
    addReason(reasons, `FDA 483 observations in last 24 months: ${fda483Count}`, penalties.fda483Penalty || 0);
  }
  if (warningLetter) {
    addReason(reasons, "Warning letter issued in last 24 months", penalties.warningPenalty || 12);
  }
  if (importAlert) {
    addReason(reasons, "Active FDA import alert", penalties.importPenalty || 12);
  }
  if (inspectionsOpen > 0) {
    addReason(reasons, `Open inspections: ${inspectionsOpen}`, penalties.inspectionsPenalty || 0);
  }
  if (recalls.length > 0) {
    const recallClasses = recalls.map((recall) => recall.class).join(", ");
    addReason(reasons, `Recent recalls recorded (${recallClasses})`, penalties.recallsPenalty || 0);
  }

  const onTimeRate = clamp(Number(metrics.questionnaireOnTimeRate || 0), 0, 1);
  if (onTimeRate < 0.85) {
    addReason(
      reasons,
      `Questionnaire on-time rate at ${(onTimeRate * 100).toFixed(0)}%`,
      clamp((0.85 - onTimeRate) * 50, 1, 15)
    );
  }

  const avgFollowupHours = Number(metrics.avgResponseHoursToFollowups || 0);
  if (avgFollowupHours > 72) {
    addReason(
      reasons,
      `Follow-up responses averaging ${Math.round(avgFollowupHours)} hours`,
      clamp((avgFollowupHours - 72) / 6, 1, 12)
    );
  }

  const overdueCount = Number(metrics.capaOverdueCount || 0);
  if (overdueCount > 0) {
    addReason(reasons, `CAPA overdue count: ${overdueCount}`, clamp(overdueCount * 3, 1, 15));
  }

  const reopenRate = clamp(Number(metrics.capaReopenRate || 0), 0, 1);
  if (reopenRate > 0.15) {
    addReason(
      reasons,
      `CAPA reopen rate at ${(reopenRate * 100).toFixed(0)}%`,
      clamp(reopenRate * 10, 1, 10)
    );
  }

  const evidenceScore = clamp(Number(metrics.evidenceQualityScore || 0), 0, 100);
  if (evidenceScore < 70) {
    addReason(
      reasons,
      `Evidence quality score ${Math.round(evidenceScore)}/100`,
      clamp((70 - evidenceScore) / 5, 1, 10)
    );
  }

  const docScore = clamp(Number(metrics.docCompletenessScore || 0), 0, 100);
  if (docScore < 70) {
    addReason(
      reasons,
      `Documentation completeness ${Math.round(docScore)}/100`,
      clamp((70 - docScore) / 5, 1, 10)
    );
  }

  const sorted = reasons.sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, 5);
  if (fda483Count > 0 && !top.some((item) => item.label.includes("FDA 483"))) {
    const fdaEntry = sorted.find((item) => item.label.includes("FDA 483"));
    if (fdaEntry) {
      top.pop();
      top.push(fdaEntry);
    }
  }

  return top.map((item) => item.label);
};
