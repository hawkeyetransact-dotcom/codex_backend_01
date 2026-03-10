export const CAPA_V2_SOURCE_TYPES = [
  "INTERNAL_AUDIT",
  "EXTERNAL_SUPPLIER_AUDIT",
  "CUSTOMER_AUDIT",
  "REGULATORY_OBSERVATION",
  "TREND_SIGNAL",
  "COMPLAINT_SIGNAL",
  "QUESTIONNAIRE_REVIEW",
  "MANUAL",
];

export const CAPA_V2_CLASSIFICATIONS = [
  "CORRECTION_ONLY",
  "FULL_CAPA",
];

export const CAPA_V2_TRIAGE_DECISIONS = [
  "NO_CAPA_NEEDED",
  "CORRECTION_ONLY",
  "FORMAL_CAPA_REQUIRED",
];

export const CAPA_V2_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const CAPA_V2_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const CAPA_V2_STATUSES = [
  "DRAFT_CANDIDATE",
  "INTAKE_DRAFT",
  "UNDER_TRIAGE",
  "TRIAGE_NO_CAPA",
  "CORRECTION_ONLY",
  "CAPA_OPEN",
  "INVESTIGATION_IN_PROGRESS",
  "RCA_PENDING_APPROVAL",
  "ACTION_PLAN_PENDING_APPROVAL",
  "ACTION_PLAN_APPROVED",
  "IN_IMPLEMENTATION",
  "AWAITING_EFFECTIVENESS_CHECK",
  "EFFECTIVENESS_REVIEW_IN_PROGRESS",
  "CLOSED_EFFECTIVE",
  "CLOSED_INEFFECTIVE",
  "REOPENED",
  "CANCELLED",
  "SUPERSEDED",
  "MERGED",
];

export const CAPA_V2_APPROVAL_STAGES = [
  "TRIAGE",
  "RCA",
  "ACTION_PLAN",
  "EFFECTIVENESS",
  "CLOSURE",
];

export const CAPA_V2_APPROVAL_DECISIONS = [
  "APPROVED",
  "REJECTED",
  "NEEDS_REWORK",
];

export const CAPA_V2_OWNER_ROLES = [
  "auditor",
  "lead_auditor",
  "supplier",
  "supplier_quality_lead",
  "buyer_quality",
  "qa",
  "capa_coordinator",
  "tenant_admin",
  "admin",
  "superadmin",
];

export const CAPA_V2_EDITABLE_STAGES = [
  "INTAKE",
  "INVESTIGATION",
  "RCA",
  "ACTION_PLAN",
  "IMPLEMENTATION",
  "EFFECTIVENESS",
];

export const CAPA_V2_AUTOFILL_STATUSES = [
  "exact_match",
  "supported_inference",
  "partial_evidence",
  "no_evidence",
  "needs_human_review",
];

