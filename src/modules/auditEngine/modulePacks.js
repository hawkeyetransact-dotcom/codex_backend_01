import { AUDIT_PHASE_KEYS } from "./constants.js";

const phase = (key, name, order, milestones) => ({
  key,
  name,
  order,
  required: true,
  milestones,
});

const milestone = (key, name, order, ownerRole, dueInDays = 2) => ({
  key,
  name,
  order,
  defaultOwnerRole: ownerRole,
  defaultDueInDays: dueInDays,
  required: true,
});

export const MODULE_PACKS = {
  cGMP: {
    module: "cGMP",
    label: "cGMP (ICH Q7)",
    preAuditQuestions: [
      { id: "CGMP_PQA_PROFILE", text: "Share current quality manual and key SOPs.", category: "Pre-reads" },
      { id: "CGMP_PQA_SCOPE", text: "Confirm scope (API/product/site) and key changes since last audit.", category: "Scope" },
      { id: "CGMP_PQA_RISK", text: "List top risks or deviations from last 12 months.", category: "Risk" },
    ],
    phases: [
      phase(AUDIT_PHASE_KEYS.PREP, "Preparation", 1, [
        milestone("CGMP_PREP_PAQ_SENT", "Pre-audit questionnaire sent", 1, "auditor", 1),
        milestone("CGMP_PREP_PREREADS_COLLECTED", "Pre-reads collected", 2, "supplier", 3),
        milestone("CGMP_PREP_RISK_REVIEW", "Pre-audit risk review", 3, "auditor", 3),
      ]),
      phase(AUDIT_PHASE_KEYS.SCOPE_AGENDA, "Scoping & Agenda", 2, [
        milestone("CGMP_SCOPE_DEFINED", "Scope defined", 1, "auditor", 2),
        milestone("CGMP_AGENDA_FINALIZED", "Agenda finalized", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.SCHEDULING, "Scheduling", 3, [
        milestone("CGMP_DATES_CONFIRMED", "Dates confirmed", 1, "buyer", 2),
        milestone("CGMP_TEAM_ASSIGNED", "Audit team assigned", 2, "auditor", 2),
        milestone("CGMP_KICKOFF_LOGISTICS", "Kickoff logistics confirmed", 3, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.EXECUTION, "Execution", 4, [
        milestone("CGMP_OPENING_MEETING", "Opening meeting held", 1, "auditor", 1),
        milestone("CGMP_QUESTIONNAIRE_EXECUTED", "Full questionnaire executed", 2, "supplier", 4),
        milestone("CGMP_EVIDENCE_CAPTURED", "Evidence captured", 3, "auditor", 4),
        milestone("CGMP_CLOSING_MEETING", "Closing meeting held", 4, "auditor", 1),
      ]),
      phase(AUDIT_PHASE_KEYS.REPORTING, "Reporting", 5, [
        milestone("CGMP_DRAFT_REPORT", "Draft report prepared", 1, "auditor", 3),
        milestone("CGMP_REVIEW_COMPLETE", "Review and sign-off", 2, "buyer", 3),
        milestone("CGMP_FINAL_REPORT", "Final report issued", 3, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.FOLLOWUP_CAPA, "Follow-up & CAPA", 6, [
        milestone("CGMP_CAPA_CREATED", "CAPA created", 1, "supplier", 5),
        milestone("CGMP_CAPA_VERIFIED", "CAPA verified", 2, "auditor", 5),
        milestone("CGMP_CAPA_CLOSED", "CAPA closed", 3, "buyer", 5),
      ]),
    ],
  },
  EQMS: {
    module: "EQMS",
    label: "EQMS (ISO 9001)",
    preAuditQuestions: [
      { id: "EQMS_PQA_CONTEXT", text: "Provide QMS scope and context of the organization.", category: "Scope" },
      { id: "EQMS_PQA_OBJECTIVES", text: "Share current quality objectives and KPIs.", category: "Performance" },
      { id: "EQMS_PQA_RISK", text: "List recent nonconformities and corrective actions.", category: "Risk" },
    ],
    phases: [
      phase(AUDIT_PHASE_KEYS.PREP, "Preparation", 1, [
        milestone("EQMS_PREP_PAQ_SENT", "PAQ sent", 1, "auditor", 1),
        milestone("EQMS_PREP_DOC_REVIEW", "Document review", 2, "auditor", 3),
      ]),
      phase(AUDIT_PHASE_KEYS.SCOPE_AGENDA, "Scoping & Agenda", 2, [
        milestone("EQMS_SCOPE_DEFINED", "Scope defined", 1, "auditor", 2),
        milestone("EQMS_AGENDA_FINALIZED", "Agenda finalized", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.SCHEDULING, "Scheduling", 3, [
        milestone("EQMS_DATES_CONFIRMED", "Dates confirmed", 1, "buyer", 2),
        milestone("EQMS_TEAM_ASSIGNED", "Audit team assigned", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.EXECUTION, "Execution", 4, [
        milestone("EQMS_OPENING_MEETING", "Opening meeting", 1, "auditor", 1),
        milestone("EQMS_PROCESS_AUDITS", "Process audits", 2, "auditor", 4),
        milestone("EQMS_CLOSING_MEETING", "Closing meeting", 3, "auditor", 1),
      ]),
      phase(AUDIT_PHASE_KEYS.REPORTING, "Reporting", 5, [
        milestone("EQMS_DRAFT_REPORT", "Draft report", 1, "auditor", 3),
        milestone("EQMS_FINAL_REPORT", "Final report issued", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.FOLLOWUP_CAPA, "Follow-up & CAPA", 6, [
        milestone("EQMS_CAPA_CREATED", "Corrective actions logged", 1, "supplier", 5),
        milestone("EQMS_CAPA_VERIFIED", "Verification completed", 2, "auditor", 5),
      ]),
    ],
  },
  EHQS: {
    module: "EHQS",
    label: "EHQS (EHS)",
    preAuditQuestions: [
      { id: "EHQS_PQA_PERMITS", text: "Provide applicable environmental permits and licenses.", category: "Compliance" },
      { id: "EHQS_PQA_INCIDENTS", text: "Share recent safety incidents or near misses.", category: "Safety" },
    ],
    phases: [
      phase(AUDIT_PHASE_KEYS.PREP, "Preparation", 1, [
        milestone("EHQS_PREP_PAQ_SENT", "PAQ sent", 1, "auditor", 1),
        milestone("EHQS_PREP_HAZARD_REVIEW", "Hazard review", 2, "auditor", 3),
      ]),
      phase(AUDIT_PHASE_KEYS.SCOPE_AGENDA, "Scoping & Agenda", 2, [
        milestone("EHQS_SCOPE_DEFINED", "Scope defined", 1, "auditor", 2),
        milestone("EHQS_AGENDA_FINALIZED", "Agenda finalized", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.SCHEDULING, "Scheduling", 3, [
        milestone("EHQS_DATES_CONFIRMED", "Dates confirmed", 1, "buyer", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.EXECUTION, "Execution", 4, [
        milestone("EHQS_OPENING_MEETING", "Opening meeting", 1, "auditor", 1),
        milestone("EHQS_SITE_WALKTHROUGH", "Site walkthrough", 2, "auditor", 3),
        milestone("EHQS_CLOSING_MEETING", "Closing meeting", 3, "auditor", 1),
      ]),
      phase(AUDIT_PHASE_KEYS.REPORTING, "Reporting", 5, [
        milestone("EHQS_DRAFT_REPORT", "Draft report", 1, "auditor", 3),
        milestone("EHQS_FINAL_REPORT", "Final report issued", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.FOLLOWUP_CAPA, "Follow-up & CAPA", 6, [
        milestone("EHQS_CAPA_CREATED", "CAPA created", 1, "supplier", 5),
        milestone("EHQS_CAPA_VERIFIED", "CAPA verified", 2, "auditor", 5),
      ]),
    ],
  },
  SAFETY: {
    module: "SAFETY",
    label: "Safety",
    preAuditQuestions: [
      { id: "SAFE_PQA_TRAINING", text: "Provide safety training completion records.", category: "Training" },
      { id: "SAFE_PQA_EMERGENCY", text: "Share emergency response plan.", category: "Emergency" },
    ],
    phases: [
      phase(AUDIT_PHASE_KEYS.PREP, "Preparation", 1, [
        milestone("SAFE_PREP_PAQ_SENT", "PAQ sent", 1, "auditor", 1),
        milestone("SAFE_PREP_RISK_REVIEW", "Safety risk review", 2, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.SCOPE_AGENDA, "Scoping & Agenda", 2, [
        milestone("SAFE_SCOPE_DEFINED", "Scope defined", 1, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.SCHEDULING, "Scheduling", 3, [
        milestone("SAFE_DATES_CONFIRMED", "Dates confirmed", 1, "buyer", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.EXECUTION, "Execution", 4, [
        milestone("SAFE_OPENING_MEETING", "Opening meeting", 1, "auditor", 1),
        milestone("SAFE_FIELD_AUDIT", "Field safety audit", 2, "auditor", 3),
        milestone("SAFE_CLOSING_MEETING", "Closing meeting", 3, "auditor", 1),
      ]),
      phase(AUDIT_PHASE_KEYS.REPORTING, "Reporting", 5, [
        milestone("SAFE_FINAL_REPORT", "Final report issued", 1, "auditor", 2),
      ]),
      phase(AUDIT_PHASE_KEYS.FOLLOWUP_CAPA, "Follow-up & CAPA", 6, [
        milestone("SAFE_CAPA_CREATED", "Corrective actions created", 1, "supplier", 5),
        milestone("SAFE_CAPA_VERIFIED", "Verification completed", 2, "auditor", 5),
      ]),
    ],
  },
};
