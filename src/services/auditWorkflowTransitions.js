export const MilestoneCodes = [
  "AR_CREATED",
  "AR_AUDITOR_ASSIGNED",
  "AR_AUDITOR_ACCEPTANCE_PENDING",
  "AR_ACCEPTED",
  "TEMPLATE_SELECTION_PENDING",
  "QUESTIONNAIRE_PREP_IN_PROGRESS",
  "QUESTIONNAIRE_RELEASED",
  "SUPPLIER_RESPONSE_PENDING",
  "SUPPLIER_SUBMITTED",
  "AUDITOR_REVIEW_PENDING",
  "FOLLOWUP_REQUESTED",
  "FOLLOWUP_RESPONSES_SUBMITTED",
  "FINAL_REVIEW_AND_SIGNOFF",
  "REPORT_GENERATION_IN_PROGRESS",
  "REPORT_PUBLISHED",
];

export const WorkflowActions = [
  "CREATE_AUDIT",
  "ASSIGN_AUDITOR",
  "AUDITOR_ACCEPT",
  "AUDITOR_REJECT",
  "TEMPLATE_SELECTED",
  "QUESTIONNAIRE_RELEASE",
  "SUPPLIER_SUBMIT",
  "REQUEST_FOLLOWUP",
  "SUBMIT_FOLLOWUP",
  "FINAL_SIGNOFF",
  "PUBLISH_REPORT",
  "CANCEL_AUDIT",
];

export const AUDIT_WORKFLOW_TRANSITIONS = {
  CREATE_AUDIT: {
    start: ["AR_CREATED"],
  },

  ASSIGN_AUDITOR: {
    complete: ["AR_CREATED"],
    start: ["AR_AUDITOR_ASSIGNED", "AR_AUDITOR_ACCEPTANCE_PENDING"],
  },

  AUDITOR_ACCEPT: {
    complete: ["AR_AUDITOR_ACCEPTANCE_PENDING", "AR_ACCEPTED"],
    start: ["TEMPLATE_SELECTION_PENDING"],
  },

  AUDITOR_REJECT: {
    skip: [
      { code: "TEMPLATE_SELECTION_PENDING", reason: "Audit rejected" },
      { code: "QUESTIONNAIRE_PREP_IN_PROGRESS", reason: "Audit rejected" },
      { code: "QUESTIONNAIRE_RELEASED", reason: "Audit rejected" },
      { code: "SUPPLIER_RESPONSE_PENDING", reason: "Audit rejected" },
      { code: "AUDITOR_REVIEW_PENDING", reason: "Audit rejected" },
      { code: "FINAL_REVIEW_AND_SIGNOFF", reason: "Audit rejected" },
      { code: "REPORT_GENERATION_IN_PROGRESS", reason: "Audit rejected" },
      { code: "REPORT_PUBLISHED", reason: "Audit rejected" },
    ],
  },

  TEMPLATE_SELECTED: {
    complete: ["TEMPLATE_SELECTION_PENDING"],
    start: ["QUESTIONNAIRE_PREP_IN_PROGRESS"],
  },

  QUESTIONNAIRE_RELEASE: {
    complete: ["QUESTIONNAIRE_PREP_IN_PROGRESS", "QUESTIONNAIRE_RELEASED"],
    start: ["SUPPLIER_RESPONSE_PENDING"],
  },

  SUPPLIER_SUBMIT: {
    complete: ["SUPPLIER_RESPONSE_PENDING", "SUPPLIER_SUBMITTED"],
    start: ["AUDITOR_REVIEW_PENDING"],
  },

  REQUEST_FOLLOWUP: {
    complete: ["AUDITOR_REVIEW_PENDING"],
    start: ["FOLLOWUP_REQUESTED"],
  },

  SUBMIT_FOLLOWUP: {
    complete: ["FOLLOWUP_REQUESTED", "FOLLOWUP_RESPONSES_SUBMITTED"],
    start: ["AUDITOR_REVIEW_PENDING"],
  },

  FINAL_SIGNOFF: {
    complete: ["AUDITOR_REVIEW_PENDING", "FINAL_REVIEW_AND_SIGNOFF"],
    start: ["REPORT_GENERATION_IN_PROGRESS"],
  },

  PUBLISH_REPORT: {
    complete: ["REPORT_GENERATION_IN_PROGRESS", "REPORT_PUBLISHED"],
  },

  CANCEL_AUDIT: {
    skip: [
      { code: "AR_AUDITOR_ASSIGNED", reason: "Audit cancelled" },
      { code: "AR_AUDITOR_ACCEPTANCE_PENDING", reason: "Audit cancelled" },
      { code: "TEMPLATE_SELECTION_PENDING", reason: "Audit cancelled" },
      { code: "QUESTIONNAIRE_PREP_IN_PROGRESS", reason: "Audit cancelled" },
      { code: "QUESTIONNAIRE_RELEASED", reason: "Audit cancelled" },
      { code: "SUPPLIER_RESPONSE_PENDING", reason: "Audit cancelled" },
      { code: "AUDITOR_REVIEW_PENDING", reason: "Audit cancelled" },
      { code: "FOLLOWUP_REQUESTED", reason: "Audit cancelled" },
      { code: "FINAL_REVIEW_AND_SIGNOFF", reason: "Audit cancelled" },
      { code: "REPORT_GENERATION_IN_PROGRESS", reason: "Audit cancelled" },
      { code: "REPORT_PUBLISHED", reason: "Audit cancelled" },
    ],
  },
};
