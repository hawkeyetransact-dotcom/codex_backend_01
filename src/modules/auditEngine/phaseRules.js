import { AUDIT_PHASE_KEYS } from "./constants.js";

const milestoneDoneBySuffix = (phase, suffix) => {
  if (!phase?.milestones?.length) return false;
  return phase.milestones.some(
    (m) => typeof m.key === "string" && m.key.endsWith(suffix) && m.status === "DONE"
  );
};

export const canAdvancePhase = ({ assessment, targetPhaseKey, paqStatus, force }) => {
  if (force) return { ok: true };

  if (targetPhaseKey === AUDIT_PHASE_KEYS.SCOPE_AGENDA) {
    if (!["SENT", "WAIVED", "SUBMITTED", "REVIEWED", "CLOSED"].includes(paqStatus || "")) {
      return { ok: false, reason: "Pre-audit questionnaire must be sent (or waived) before scoping." };
    }
  }

  if (targetPhaseKey === AUDIT_PHASE_KEYS.SCHEDULING) {
    const scopePhase = assessment?.phases?.find((p) => p.key === AUDIT_PHASE_KEYS.SCOPE_AGENDA);
    if (!milestoneDoneBySuffix(scopePhase, "AGENDA_FINALIZED")) {
      return { ok: false, reason: "Agenda must be finalized before scheduling." };
    }
  }

  if (targetPhaseKey === AUDIT_PHASE_KEYS.EXECUTION) {
    const schedulingPhase = assessment?.phases?.find((p) => p.key === AUDIT_PHASE_KEYS.SCHEDULING);
    if (!milestoneDoneBySuffix(schedulingPhase, "DATES_CONFIRMED")) {
      return { ok: false, reason: "Dates must be confirmed before execution." };
    }
  }

  if (targetPhaseKey === AUDIT_PHASE_KEYS.REPORTING) {
    const executionPhase = assessment?.phases?.find((p) => p.key === AUDIT_PHASE_KEYS.EXECUTION);
    if (!milestoneDoneBySuffix(executionPhase, "CLOSING_MEETING")) {
      return { ok: false, reason: "Closing meeting must be completed before reporting." };
    }
  }

  if (targetPhaseKey === AUDIT_PHASE_KEYS.FOLLOWUP_CAPA) {
    const reportingPhase = assessment?.phases?.find((p) => p.key === AUDIT_PHASE_KEYS.REPORTING);
    if (!milestoneDoneBySuffix(reportingPhase, "FINAL_REPORT")) {
      return { ok: false, reason: "Final report must be issued before follow-up." };
    }
  }

  return { ok: true };
};
