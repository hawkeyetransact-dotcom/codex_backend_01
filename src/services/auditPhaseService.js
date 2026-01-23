import {
  AUDIT_PHASES,
  AUDIT_PHASE_KEYS,
  PHASE_STATUSES,
} from "../constants/auditPhases.js";

const phaseOrder = AUDIT_PHASE_KEYS.reduce((acc, key, idx) => {
  acc[key] = idx;
  return acc;
}, {});

const materializePhaseMap = (phases) => {
  if (!phases) return {};
  if (phases instanceof Map) return Object.fromEntries(phases);
  return phases;
};

const clonePhase = (phase) => ({
  status: phase?.status ?? "NOT_STARTED",
  startedAt: phase?.startedAt ?? null,
  completedAt: phase?.completedAt ?? null,
  ownerRole: phase?.ownerRole ?? null,
  blockers: Array.isArray(phase?.blockers) ? phase.blockers : [],
  meta: phase?.meta || {},
});

export const buildDefaultPhaseState = () => {
  const phases = {};
  AUDIT_PHASES.forEach((phase) => {
    phases[phase.key] = {
      status: "NOT_STARTED",
      startedAt: null,
      completedAt: null,
      ownerRole: phase.ownerRole || null,
      blockers: [],
      meta: {},
    };
  });
  return {
    currentPhase: "INITIATED",
    phases,
    legacyStatusMapping: {},
  };
};

export const normalizePhaseState = (phaseState) => {
  const base = buildDefaultPhaseState();
  if (!phaseState) return base;
  const phases = materializePhaseMap(phaseState.phases);
  const mergedPhases = { ...base.phases };
  AUDIT_PHASE_KEYS.forEach((key) => {
    mergedPhases[key] = clonePhase(phases[key] || base.phases[key]);
  });
  return {
    currentPhase: phaseState.currentPhase || base.currentPhase,
    phases: mergedPhases,
    legacyStatusMapping: phaseState.legacyStatusMapping || base.legacyStatusMapping,
  };
};

const markPhase = (state, key, status) => {
  if (!state?.phases?.[key]) return;
  state.phases[key].status = status;
  if (status === "IN_PROGRESS" && !state.phases[key].startedAt) {
    state.phases[key].startedAt = new Date();
  }
  if (status === "COMPLETED" && !state.phases[key].completedAt) {
    state.phases[key].completedAt = new Date();
  }
};

const advanceTo = (state, currentKey) => {
  const currentIdx = phaseOrder[currentKey] ?? 0;
  AUDIT_PHASE_KEYS.forEach((key) => {
    const idx = phaseOrder[key];
    if (idx < currentIdx) markPhase(state, key, "COMPLETED");
    if (idx === currentIdx) markPhase(state, key, "IN_PROGRESS");
  });
  state.currentPhase = currentKey;
};

export const derivePhaseStateFromLegacy = (audit) => {
  const state = buildDefaultPhaseState();
  const qStatus = String(audit?.questionnaireStatus || "").toLowerCase();
  const track = String(audit?.trackStatus || "").toLowerCase();
  const numeric = Number(audit?.high_status);
  const decision = String(audit?.auditorDecision || "").toUpperCase();

  state.legacyStatusMapping = {
    trackStatus: audit?.trackStatus || null,
    questionnaireStatus: audit?.questionnaireStatus || null,
    high_status: audit?.high_status ?? null,
    auditorDecision: audit?.auditorDecision || null,
  };

  if (decision === "REJECTED" || track.includes("rejected")) {
    markPhase(state, "INITIATED", "BLOCKED");
    state.phases.INITIATED.blockers = ["Auditor rejected"];
    state.currentPhase = "INITIATED";
    return state;
  }

  if ((Number.isFinite(numeric) && numeric >= 5) || track.includes("complete") || track.includes("closed")) {
    AUDIT_PHASE_KEYS.forEach((key) => markPhase(state, key, "COMPLETED"));
    state.currentPhase = "CLOSURE";
    return state;
  }

  if (["review_completed", "auditor_submitted"].includes(qStatus)) {
    AUDIT_PHASE_KEYS.forEach((key) => {
      if (phaseOrder[key] <= phaseOrder.EXECUTION) markPhase(state, key, "COMPLETED");
    });
    markPhase(state, "FINDINGS", "IN_PROGRESS");
    state.currentPhase = "FINDINGS";
    return state;
  }

  if (["sent_to_supplier", "supplier_draft", "supplier_submitted", "followup_requested", "followup_submitted"].includes(qStatus)) {
    AUDIT_PHASE_KEYS.forEach((key) => {
      if (phaseOrder[key] <= phaseOrder.PLANNING) markPhase(state, key, "COMPLETED");
    });
    markPhase(state, "EXECUTION", "IN_PROGRESS");
    state.currentPhase = "EXECUTION";
    return state;
  }

  if (qStatus === "in_progress" || track.includes("questionnaire")) {
    markPhase(state, "INITIATED", "COMPLETED");
    markPhase(state, "PREP", "IN_PROGRESS");
    state.currentPhase = "PREP";
    return state;
  }

  if (qStatus === "request_received" || track.includes("request")) {
    markPhase(state, "INITIATED", "IN_PROGRESS");
    state.currentPhase = "INITIATED";
    return state;
  }

  markPhase(state, "INITIATED", "IN_PROGRESS");
  state.currentPhase = "INITIATED";
  return state;
};

export const canTransition = (fromPhase, toPhase) => {
  if (!AUDIT_PHASE_KEYS.includes(fromPhase) || !AUDIT_PHASE_KEYS.includes(toPhase)) return false;
  return phaseOrder[toPhase] === phaseOrder[fromPhase] + 1;
};

export const applyPhaseTransition = (phaseState, toPhase) => {
  const state = normalizePhaseState(phaseState);
  const now = new Date();
  const fromPhase = state.currentPhase || "INITIATED";

  if (state.phases[fromPhase]) {
    state.phases[fromPhase].status = "COMPLETED";
    state.phases[fromPhase].completedAt = now;
    state.phases[fromPhase].startedAt = state.phases[fromPhase].startedAt || now;
  }

  if (state.phases[toPhase]) {
    state.phases[toPhase].status = "IN_PROGRESS";
    state.phases[toPhase].startedAt = state.phases[toPhase].startedAt || now;
    state.phases[toPhase].blockers = [];
  }

  state.currentPhase = toPhase;
  return state;
};

export const setPhaseStatus = (phaseState, phaseKey, status) => {
  const state = normalizePhaseState(phaseState);
  if (!PHASE_STATUSES.includes(status)) return state;
  if (!state.phases?.[phaseKey]) return state;
  state.phases[phaseKey].status = status;
  if (status === "IN_PROGRESS") state.phases[phaseKey].startedAt = state.phases[phaseKey].startedAt || new Date();
  if (status === "COMPLETED") state.phases[phaseKey].completedAt = state.phases[phaseKey].completedAt || new Date();
  if (status === "BLOCKED") state.phases[phaseKey].blockers = state.phases[phaseKey].blockers || ["Blocked"];
  if (status === "COMPLETED" && phaseState?.currentPhase === phaseKey) {
    const idx = phaseOrder[phaseKey];
    const nextKey = AUDIT_PHASE_KEYS[idx + 1];
    if (nextKey) {
      state.currentPhase = nextKey;
    }
  }
  return state;
};

export const resolvePhaseOrder = () => phaseOrder;
