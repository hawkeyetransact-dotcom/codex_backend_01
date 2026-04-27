/**
 * ROI calculator for AI agent usage.
 * Pure function — same shape as the spec in docs/06-go-to-market/05-ai-roi-pricing-calculator.md.
 */
import { getAgentMeta } from "./agentCatalog.js";

/**
 * @param {Object} params
 * @param {Array<Object>} params.events     - agent-usage-events (typically last 30d)
 * @param {number} params.laborRateUsd      - tenant's loaded labour rate ($/hr)
 * @param {number} [params.periodDays=30]
 * @returns {Object} ROI report
 */
export function computeRoi({ events = [], laborRateUsd = 40, periodDays = 30 } = {}) {
  let totalCalls = 0;
  let totalCost = 0;
  let totalTimeSavedMin = 0;
  let totalLaborSaved = 0;
  let acceptedCalls = 0;
  let blockedCalls = 0;
  const perAgent = {};

  for (const e of events) {
    totalCalls++;
    totalCost += Number(e.costUsd || 0);

    if (e.outcome === "success") {
      const meta = getAgentMeta(e.agentKey);
      const tMin = Number(e.estimatedTimeSavedMin ?? meta.estimatedTimeSavedMin ?? 0);
      // Acceptance weight: kept-verbatim = 1.0, edited 50% = 0.75, fully rewritten = 0.5
      // No accept signal yet (null) = assume 0.7 (mild positive)
      let acceptanceWeight = 0.7;
      if (e.userAccepted === true) {
        acceptanceWeight = 1 - (Number(e.userEditedRatio || 0) * 0.5);
      } else if (e.userAccepted === false) {
        acceptanceWeight = 0.2;
      }
      const adjustedMin = tMin * acceptanceWeight;
      totalTimeSavedMin += adjustedMin;
      totalLaborSaved += (adjustedMin / 60) * laborRateUsd;
      if (e.userAccepted) acceptedCalls++;
    } else if (String(e.outcome || "").startsWith("blocked_")) {
      blockedCalls++;
    }

    const k = e.agentKey;
    if (!perAgent[k]) perAgent[k] = { calls: 0, cost: 0, timeSavedMin: 0, accepted: 0, blocked: 0 };
    perAgent[k].calls++;
    perAgent[k].cost += Number(e.costUsd || 0);
    if (e.outcome === "success") perAgent[k].timeSavedMin += Number(e.estimatedTimeSavedMin || 0);
    if (e.userAccepted) perAgent[k].accepted++;
    if (String(e.outcome || "").startsWith("blocked_")) perAgent[k].blocked++;
  }

  const roiMultiple = totalCost > 0 ? totalLaborSaved / totalCost : null;
  const acceptanceRate = totalCalls > 0 ? acceptedCalls / totalCalls : 0;

  return {
    period: { days: periodDays },
    laborRateUsd,
    headline: {
      totalCalls,
      totalTimeSavedHours: Math.round(totalTimeSavedMin / 60),
      totalLaborSavedUsd: Math.round(totalLaborSaved),
      totalCostUsd: Math.round(totalCost * 100) / 100,
      roiMultiple: roiMultiple == null ? null : Math.round(roiMultiple * 10) / 10,
      acceptanceRate: Math.round(acceptanceRate * 100),
      blockedCalls,
    },
    perAgent: Object.entries(perAgent)
      .map(([key, v]) => ({
        agentKey: key,
        displayName: getAgentMeta(key).displayName,
        module: getAgentMeta(key).module,
        calls: v.calls,
        costUsd: Math.round(v.cost * 100) / 100,
        timeSavedHours: Math.round(v.timeSavedMin / 60),
        laborSavedUsd: Math.round((v.timeSavedMin / 60) * laborRateUsd),
        acceptanceRate: v.calls > 0 ? Math.round((v.accepted / v.calls) * 100) : 0,
        blocked: v.blocked,
      }))
      .sort((a, b) => b.laborSavedUsd - a.laborSavedUsd),
    projection: {
      monthlyTimeSavedHours: Math.round((totalTimeSavedMin / 60) * (30 / Math.max(periodDays, 1))),
      monthlyLaborSavedUsd: Math.round(totalLaborSaved * (30 / Math.max(periodDays, 1))),
      annualLaborSavedUsd: Math.round(totalLaborSaved * (365 / Math.max(periodDays, 1))),
    },
  };
}
