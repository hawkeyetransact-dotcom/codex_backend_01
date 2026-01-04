export const NotificationEvent = {
  Security: {
    PASSWORD_RESET: "security.password_reset",
    MFA_ENROLLED: "security.mfa_enrolled",
    MFA_CHALLENGE: "security.mfa_challenge",
    ACCOUNT_DISABLED: "security.account_disabled",
  },
  Onboarding: {
    WELCOME: "onboarding.welcome",
    PROFILE_COMPLETE: "onboarding.profile_complete",
    SUPPLIER_INVITED: "onboarding.supplier_invited",
    SUPPLIER_INCOMPLETE: "onboarding.supplier_incomplete",
    CERT_EXPIRING: "onboarding.cert_expiring",
    KYS_PASS: "onboarding.kys_pass",
    KYS_FAIL: "onboarding.kys_fail",
  },
  Audit: {
    AUDIT_CREATED: "audit.created",
    AUDIT_ASSIGNED: "audit.assigned",
    AUDIT_STATUS_CHANGED: "audit.status_changed",
  },
  Questionnaire: {
    QUESTIONNAIRE_SENT: "questionnaire.sent",
    QUESTIONNAIRE_SUBMITTED: "questionnaire.submitted",
    QUESTIONNAIRE_REVIEWED: "questionnaire.reviewed",
  },
  Evidence: {
    EVIDENCE_REQUESTED: "evidence.requested",
    EVIDENCE_UPLOADED: "evidence.uploaded",
    EVIDENCE_APPROVED: "evidence.approved",
  },
  Risk: {
    RISK_RAISED: "risk.raised",
    RISK_UPDATED: "risk.updated",
    RISK_RESOLVED: "risk.resolved",
  },
  SLA: {
    SLA_BREACH_IMMINENT: "sla.breach_imminent",
    SLA_BREACHED: "sla.breached",
  },
  System: {
    SYSTEM_ALERT: "system.alert",
    SYSTEM_MAINTENANCE: "system.maintenance",
  },
};

export const NotificationEventFlat = Object.freeze([
  ...Object.values(NotificationEvent.Security),
  ...Object.values(NotificationEvent.Onboarding),
  ...Object.values(NotificationEvent.Audit),
  ...Object.values(NotificationEvent.Questionnaire),
  ...Object.values(NotificationEvent.Evidence),
  ...Object.values(NotificationEvent.Risk),
  ...Object.values(NotificationEvent.SLA),
  ...Object.values(NotificationEvent.System),
]);
