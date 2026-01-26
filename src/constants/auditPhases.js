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

export const ARTIFACT_STATUSES = ["draft", "sent", "in_progress", "complete"];

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
];

export const PHASE_ARTIFACT_DEFAULTS = {
  INITIATED: ["INTIMATION_LETTER", "RFQ"],
  PREP: ["PRE_AUDIT_QUESTIONNAIRE", "DRL"],
  PLANNING: ["SCOPE"],
  EXECUTION: ["EXECUTION_QUESTIONNAIRE", "GMP_CHECKLIST"],
  FINDINGS: ["FINDINGS_LOG"],
  CAPA: ["CAPA_PLAN"],
  CLOSURE: ["FINAL_REPORT"],
  SURVEILLANCE: [],
};
