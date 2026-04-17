export const PHASE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"];

export const AUDIT_PHASES = [
  { key: "INITIATED", label: "Initiated", ownerRole: "buyer" },
  { key: "PREP", label: "Preparation", ownerRole: "supplier" },
  { key: "PLANNING", label: "Planning", ownerRole: "auditor" },
  { key: "EXECUTION", label: "Execution", ownerRole: "auditor" },
  { key: "FINDINGS", label: "Findings", ownerRole: "auditor" },
  { key: "CAPA", label: "CAPA", ownerRole: "supplier" },
  { key: "CLOSURE", label: "Closure", ownerRole: "buyer" },
  { key: "SURVEILLANCE", label: "Surveillance", ownerRole: "auditor" },
];

export const AUDIT_PHASE_KEYS = AUDIT_PHASES.map((phase) => phase.key);

export const ARTIFACT_STATUSES = ["draft", "sent", "in_progress", "pending_review", "pending_approval", "approved", "complete"];

export const AUDIT_ARTIFACT_TYPES = [
  "INTIMATION_LETTER",
  "RFQ",
  "SCOPE",
  "AGENDA",
  "PRE_AUDIT_QUESTIONNAIRE",
  "DRL",
  "EXECUTION_QUESTIONNAIRE",
  "GMP_CHECKLIST",
  "FINDINGS_LOG",
  "CAPA_PLAN",
  "FINAL_REPORT",
  // ── Phase 0 GxP additions ──────────────────────────────────────────────────
  "COI_DECLARATION",              // Auditor conflict-of-interest declaration (PLANNING)
  "OPENING_MEETING_MINUTES",      // Formal opening meeting record (EXECUTION)
  "PRELIMINARY_DEFICIENCY_REPORT",// PDR issued at closing meeting (FINDINGS)
  "CLOSING_MEETING_MINUTES",      // Formal closing meeting record (FINDINGS)
  "AUDIT_CLOSURE_CERTIFICATE",    // Formal audit closure document (CLOSURE)
];

// GMP observation classification per WHO/EU GMP/PIC/S — applied per finding
export const GMP_OBSERVATION_CLASSIFICATIONS = ["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"];

// 3-tier facility outcome (GxP gap fix)
export const FACILITY_OUTCOME_VALUES = [
  "SATISFACTORY",
  "CONDITIONALLY_SATISFACTORY",
  "UNSATISFACTORY",
];

export const PHASE_ARTIFACT_TYPES = {
  INITIATED: ["INTIMATION_LETTER", "RFQ"],
  PREP: ["PRE_AUDIT_QUESTIONNAIRE", "DRL"],
  PLANNING: ["SCOPE", "AGENDA", "COI_DECLARATION"],
  EXECUTION: ["EXECUTION_QUESTIONNAIRE", "GMP_CHECKLIST", "OPENING_MEETING_MINUTES"],
  FINDINGS: ["FINDINGS_LOG", "PRELIMINARY_DEFICIENCY_REPORT", "CLOSING_MEETING_MINUTES"],
  CAPA: ["CAPA_PLAN"],
  CLOSURE: ["FINAL_REPORT", "AUDIT_CLOSURE_CERTIFICATE"],
  SURVEILLANCE: [],
};

export const PHASE_ARTIFACT_DEFAULTS = {
  INITIATED: ["INTIMATION_LETTER", "RFQ"],
  PREP: ["PRE_AUDIT_QUESTIONNAIRE", "DRL"],
  PLANNING: ["SCOPE", "COI_DECLARATION"],
  EXECUTION: ["EXECUTION_QUESTIONNAIRE", "OPENING_MEETING_MINUTES"],
  FINDINGS: ["FINDINGS_LOG", "PRELIMINARY_DEFICIENCY_REPORT", "CLOSING_MEETING_MINUTES"],
  CAPA: ["CAPA_PLAN"],
  CLOSURE: ["FINAL_REPORT", "AUDIT_CLOSURE_CERTIFICATE"],
  SURVEILLANCE: [],
};
