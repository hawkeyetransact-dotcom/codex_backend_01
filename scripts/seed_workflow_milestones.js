import mongoose from "mongoose";
import dotenv from "dotenv";
import { WorkflowMilestoneDefinition } from "../src/models/workflowMilestoneDefinitionModel.js";
import { WorkflowSlaConfig } from "../src/models/workflowSlaConfigModel.js";
import Notification from "../src/modules/notifications/models/notificationModel.js";
import NotificationDeliveryLog from "../src/modules/notifications/models/notificationDeliveryLogModel.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URL;
const TENANT_ID = process.argv[2] || process.env.SEED_TENANT_ID;
if (!TENANT_ID) {
  console.error("Please provide tenantId as CLI arg or SEED_TENANT_ID env");
  process.exit(1);
}

const definitions = [
  { order: 10, code: "AR_CREATED", name: "Audit request created", defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
  { order: 20, code: "AR_AUDITOR_ASSIGNED", name: "Auditor assigned", defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
  { order: 30, code: "AR_AUDITOR_ACCEPTANCE_PENDING", name: "Auditor acceptance pending", defaultResponsibleRole: "auditor", defaultDurationHours: 48 },
  { order: 40, code: "AR_ACCEPTED", name: "Audit accepted", defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  { order: 50, code: "TEMPLATE_SELECTION_PENDING", name: "Template selection pending", defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  { order: 60, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", name: "Questionnaire prep in progress", defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  { order: 70, code: "QUESTIONNAIRE_RELEASED", name: "Questionnaire released", defaultResponsibleRole: "supplier", defaultDurationHours: 12 },
  { order: 80, code: "SUPPLIER_RESPONSE_PENDING", name: "Supplier response pending", defaultResponsibleRole: "supplier", defaultDurationHours: 72 },
  { order: 90, code: "SUPPLIER_SUBMITTED", name: "Supplier submitted", defaultResponsibleRole: "supplier", defaultDurationHours: 12 },
  { order: 100, code: "AUDITOR_REVIEW_PENDING", name: "Auditor review pending", defaultResponsibleRole: "auditor", defaultDurationHours: 48 },
  { order: 110, code: "FOLLOWUP_REQUESTED", name: "Follow-up requested", defaultResponsibleRole: "supplier", defaultDurationHours: 48 },
  { order: 120, code: "FOLLOWUP_RESPONSES_SUBMITTED", name: "Follow-up responses submitted", defaultResponsibleRole: "supplier", defaultDurationHours: 12 },
  { order: 130, code: "FINAL_REVIEW_AND_SIGNOFF", name: "Final review and signoff", defaultResponsibleRole: "auditor", defaultDurationHours: 48 },
  { order: 140, code: "REPORT_GENERATION_IN_PROGRESS", name: "Report generation in progress", defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  { order: 150, code: "REPORT_PUBLISHED", name: "Report published", defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
];

const slaConfigs = [
  {
    milestoneCode: "SUPPLIER_RESPONSE",
    durationHours: 72,
    escalation: [{ afterHours: 48, notifyRoles: ["tenant_admin"], severity: "critical", channels: ["email", "inApp"] }],
    allowUserOverride: true,
  },
  {
    milestoneCode: "AUDITOR_REVIEW",
    durationHours: 48,
    escalation: [{ afterHours: 24, notifyRoles: ["tenant_admin"], severity: "warning", channels: ["inApp"] }],
    allowUserOverride: true,
  },
];

async function run() {
  await mongoose.connect(MONGODB_URI);
  await WorkflowMilestoneDefinition.syncIndexes();
  await WorkflowSlaConfig.syncIndexes();
  await Notification.syncIndexes();
  await NotificationDeliveryLog.syncIndexes();

  let defUpserted = 0;
  for (const def of definitions) {
    await WorkflowMilestoneDefinition.findOneAndUpdate(
      { tenantId: TENANT_ID, workflowType: "AUDIT", code: def.code },
      { ...def, tenantId: TENANT_ID, workflowType: "AUDIT", isActive: true },
      { upsert: true, new: true }
    );
    defUpserted++;
  }

  let slaUpserted = 0;
  for (const sla of slaConfigs) {
    await WorkflowSlaConfig.findOneAndUpdate(
      { tenantId: TENANT_ID, workflowType: "AUDIT", milestoneCode: sla.milestoneCode },
      { ...sla, tenantId: TENANT_ID, workflowType: "AUDIT" },
      { upsert: true, new: true }
    );
    slaUpserted++;
  }

  const testNotification = await Notification.create({
    tenantId: TENANT_ID,
    recipientUserId: new mongoose.Types.ObjectId(),
    type: "seed.test",
    severity: "info",
    title: "Seed test notification",
    message: "This is a seed notification",
    channels: ["inApp"],
  });
  await NotificationDeliveryLog.create({
    tenantId: TENANT_ID,
    notificationId: testNotification._id,
    channel: "inApp",
    status: "sent",
  });

  console.log("Seed complete", {
    tenantId: TENANT_ID,
    definitionsUpserted: defUpserted,
    slaUpserted,
    notificationId: testNotification._id.toString(),
  });
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
