import { CAPA_V2_STATUSES } from "./constants.js";

const transitions = {
  DRAFT_CANDIDATE: ["INTAKE_DRAFT", "UNDER_TRIAGE", "TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "MERGED", "CANCELLED"],
  INTAKE_DRAFT: ["UNDER_TRIAGE", "CANCELLED"],
  UNDER_TRIAGE: ["TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "CANCELLED"],
  TRIAGE_NO_CAPA: [],
  CORRECTION_ONLY: ["IN_IMPLEMENTATION", "CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED"],
  CAPA_OPEN: ["INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "IN_IMPLEMENTATION", "CANCELLED"],
  INVESTIGATION_IN_PROGRESS: ["RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "CANCELLED"],
  RCA_PENDING_APPROVAL: ["ACTION_PLAN_PENDING_APPROVAL", "INVESTIGATION_IN_PROGRESS", "CANCELLED"],
  ACTION_PLAN_PENDING_APPROVAL: ["ACTION_PLAN_APPROVED", "INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "CANCELLED"],
  ACTION_PLAN_APPROVED: ["IN_IMPLEMENTATION", "CANCELLED"],
  IN_IMPLEMENTATION: ["AWAITING_EFFECTIVENESS_CHECK", "EFFECTIVENESS_REVIEW_IN_PROGRESS", "CANCELLED"],
  AWAITING_EFFECTIVENESS_CHECK: ["EFFECTIVENESS_REVIEW_IN_PROGRESS", "CANCELLED"],
  EFFECTIVENESS_REVIEW_IN_PROGRESS: ["CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED"],
  CLOSED_EFFECTIVE: ["REOPENED", "SUPERSEDED", "MERGED"],
  CLOSED_INEFFECTIVE: ["REOPENED", "SUPERSEDED", "MERGED"],
  REOPENED: ["INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "IN_IMPLEMENTATION", "CANCELLED"],
  CANCELLED: [],
  SUPERSEDED: [],
  MERGED: [],
};

const requiredFieldsByStatus = {
  UNDER_TRIAGE: ["sourceIntakeId"],
  CAPA_OPEN: ["ownerUserId", "dueDate"],
  ACTION_PLAN_APPROVED: ["ownerUserId"],
  CLOSED_EFFECTIVE: ["closedAt", "closureOutcome"],
  CLOSED_INEFFECTIVE: ["closedAt", "closureOutcome"],
};

export const isValidCapaV2Status = (value) => CAPA_V2_STATUSES.includes(String(value || ""));

export const canTransitionCapaV2Status = (fromStatus, toStatus) => {
  const from = String(fromStatus || "");
  const to = String(toStatus || "");
  if (!isValidCapaV2Status(from) || !isValidCapaV2Status(to)) return false;
  if (from === to) return true;
  return (transitions[from] || []).includes(to);
};

export const assertCapaV2Transition = ({ fromStatus, toStatus, capa }) => {
  if (!canTransitionCapaV2Status(fromStatus, toStatus)) {
    const err = new Error(`Invalid CAPA transition: ${fromStatus || "-"} -> ${toStatus || "-"}`);
    err.status = 400;
    throw err;
  }
  const requiredFields = requiredFieldsByStatus[String(toStatus || "")] || [];
  const missing = requiredFields.filter((field) => {
    const value = capa?.[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && !value.trim()) return true;
    return false;
  });
  if (missing.length) {
    const err = new Error(`Missing required CAPA fields for status ${toStatus}: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }
};

