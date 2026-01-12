const score = (value) => (typeof value === "number" ? value : 0);

export const buildImprovementChecklist = (breakdown = {}) => {
  const suggestions = [];

  if (score(breakdown.responsiveness) < 70) {
    suggestions.push({
      title: "Improve responsiveness",
      detail: "Target questionnaire on-time rate of 85%+ and reduce follow-up response time.",
    });
  }
  if (score(breakdown.capa) < 70) {
    suggestions.push({
      title: "Strengthen CAPA discipline",
      detail: "Reduce overdue CAPAs and prevent reopenings through root-cause controls.",
    });
  }
  if (score(breakdown.transparency) < 70) {
    suggestions.push({
      title: "Increase transparency",
      detail: "Upload higher-quality evidence and improve documentation completeness.",
    });
  }
  if (score(breakdown.regulatory) < 70) {
    suggestions.push({
      title: "Regulatory focus",
      detail: "Address recent regulatory actions and prevent repeat findings.",
    });
  }
  if (score(breakdown.recalls) < 70) {
    suggestions.push({
      title: "Recall prevention",
      detail: "Review product quality controls to avoid repeat recall events.",
    });
  }
  if (score(breakdown.inspections) < 70) {
    suggestions.push({
      title: "Inspection readiness",
      detail: "Close open inspection items and improve audit readiness.",
    });
  }

  return suggestions;
};
