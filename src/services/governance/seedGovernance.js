import { NotificationEvent } from "../../models/notificationEventModel.js";
import { NotificationPolicy } from "../../models/notificationPolicyModel.js";

const PERSONAS = [
  "PLATFORM_ADMIN",
  "TENANT_ADMIN",
  "AUDITOR",
  "SUPPLIER_ADMIN",
  "SUPPLIER_USER",
  "BUYER_USER",
];

const EVENTS = [
  { key: "audit.created", name: "Audit created", category: "WORKFLOW", severity: "INFO" },
  { key: "auditor.assigned", name: "Auditor assigned", category: "WORKFLOW", severity: "INFO" },
  { key: "questionnaire.sent", name: "Questionnaire sent", category: "WORKFLOW", severity: "INFO" },
  { key: "supplier.response_submitted", name: "Supplier response submitted", category: "WORKFLOW", severity: "INFO" },
  { key: "auditor.review_requested", name: "Auditor review requested", category: "WORKFLOW", severity: "WARN" },
  { key: "capa.raised", name: "CAPA raised", category: "RISK", severity: "WARN" },
  { key: "capa.closed", name: "CAPA closed", category: "RISK", severity: "INFO" },
  { key: "report.issued", name: "Report issued", category: "WORKFLOW", severity: "INFO" },
  { key: "milestone.overdue", name: "Milestone overdue", category: "RISK", severity: "CRITICAL" },
  // ── EQMS supplier-collaboration events (added with notifySupplier helper) ──
  { key: "PQ_REQUESTED", name: "Pre-Qualification requested", category: "WORKFLOW", severity: "INFO" },
  { key: "PQ_DECISION", name: "Pre-Qualification decision", category: "WORKFLOW", severity: "INFO" },
  { key: "DEVIATION_REPORTED", name: "Deviation reported (supplier-attributed)", category: "RISK", severity: "WARN" },
  { key: "DEVIATION_ASSIGNED", name: "Deviation assigned for investigation", category: "WORKFLOW", severity: "INFO" },
  { key: "COMPLAINT_REPORTED", name: "Complaint reported (supplier-attributed)", category: "RISK", severity: "WARN" },
  { key: "COMPLAINT_ASSIGNED", name: "Complaint assigned for investigation", category: "WORKFLOW", severity: "INFO" },
  { key: "CHANGE_CONTROL_OPENED", name: "Change control opened (supplier impact)", category: "WORKFLOW", severity: "INFO" },
  { key: "CHANGE_CONTROL_DECISION", name: "Change control decision", category: "WORKFLOW", severity: "INFO" },
  { key: "CAPA_INTAKE_OPENED", name: "CAPA intake opened against supplier", category: "RISK", severity: "WARN" },
  { key: "CAPA_ASSIGNED", name: "CAPA assigned to owner", category: "WORKFLOW", severity: "INFO" },
  // ── Audit-module events (added with full audit-flow notification wiring) ──
  { key: "AUDIT_PLAN_SHARED", name: "Audit plan shared with supplier", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDIT_AGENDA_SHARED", name: "Audit agenda shared with supplier", category: "WORKFLOW", severity: "INFO" },
  { key: "PRE_AUDIT_QUESTIONNAIRE_SENT", name: "Pre-audit questionnaire sent to supplier", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDIT_REPORT_DRAFTED", name: "Audit report drafted, awaiting buyer review", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDIT_REPORT_REVIEWED", name: "Audit report review decision", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDIT_REPORT_APPROVED", name: "Audit report approved", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDIT_REPORT_AWAITING_SIGNATURE", name: "Audit report awaiting your signature", category: "WORKFLOW", severity: "WARN" },
  { key: "AUDIT_REPORT_COMPLETED", name: "Audit report completed and signed by all parties", category: "WORKFLOW", severity: "INFO" },
  { key: "AUDITOR_QUALIFIED", name: "Auditor qualification decision", category: "WORKFLOW", severity: "INFO" },
];

export const seedGovernance = async () => {
  for (const event of EVENTS) {
    await NotificationEvent.updateOne(
      { key: event.key },
      { $setOnInsert: { ...event, isActive: true } },
      { upsert: true }
    );
  }

  for (const event of EVENTS) {
    for (const persona of PERSONAS) {
      await NotificationPolicy.updateOne(
        { scope: "PLATFORM_DEFAULT", persona, eventKey: event.key },
        {
          $setOnInsert: {
            scope: "PLATFORM_DEFAULT",
            tenantId: null,
            persona,
            eventKey: event.key,
            allowedChannels: ["IN_APP", "EMAIL"],
            deliveryMode: "REALTIME",
            isEnabled: true,
            version: 1,
          },
        },
        { upsert: true }
      );
    }
  }
};

export const seedGovernanceIfEnabled = async () => {
  if (process.env.SEED_GOVERNANCE !== "true") return;
  await seedGovernance();
};
