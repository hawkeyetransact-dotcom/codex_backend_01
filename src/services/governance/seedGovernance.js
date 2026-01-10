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
