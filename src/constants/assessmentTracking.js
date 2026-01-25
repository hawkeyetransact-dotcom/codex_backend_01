export const TRACKING_GRANULARITY = ["BASIC", "STANDARD", "ADVANCED"];

export const TEMPLATE_TYPES = [
  "RFQ",
  "SCOPE",
  "AGENDA",
  "PRE_AUDIT_Q",
  "EXECUTION_Q",
  "CHECKLIST",
  "CAPA_NOTICE",
  "FINAL_REPORT",
];

export const PHASE_KEYS = [
  "INITIATED",
  "PREP",
  "PLANNING",
  "EXECUTION",
  "FINDINGS",
  "CAPA",
  "CLOSURE",
  "SURVEILLANCE",
];

export const PHASE_DEFINITIONS = [
  { phaseKey: "INITIATED", name: "Initiated", order: 1 },
  { phaseKey: "PREP", name: "Preparation", order: 2 },
  { phaseKey: "PLANNING", name: "Planning", order: 3 },
  { phaseKey: "EXECUTION", name: "Execution", order: 4 },
  { phaseKey: "FINDINGS", name: "Findings", order: 5 },
  { phaseKey: "CAPA", name: "CAPA", order: 6 },
  { phaseKey: "CLOSURE", name: "Closure", order: 7 },
  { phaseKey: "SURVEILLANCE", name: "Surveillance", order: 8 },
];

export const STATUS_VALUES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"];
