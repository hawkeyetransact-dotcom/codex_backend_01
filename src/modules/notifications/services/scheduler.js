import cron from "node-cron";
import { NotificationOrchestratorService } from "./orchestratorService.js";
import { AuditRequestMaster } from "../../../models/auditRequestsMasterModel.js";
import { WorkflowMilestoneInstance } from "../../../models/workflowMilestoneInstanceModel.js";
import { WorkflowSlaConfig } from "../../../models/workflowSlaConfigModel.js";
import { processPendingEmails } from "./emailService.js";
import { SupplierProfile } from "../../../models/supplierProfileModel.js";
import { AuditorProfile } from "../../../models/auditorProfileModel.js";

// Simple scheduler to emit SLA reminders based on complianceDate (as due date proxy)
// Runs every hour.
export const startNotificationSchedulers = () => {
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const due48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const overdue24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const overdue5d = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Warning: this is a naive query using complianceDate; adjust when real due fields exist.
    const soonDue = await AuditRequestMaster.find({ complianceDate: { $lte: due48h, $gte: now } });
    for (const audit of soonDue) {
      await NotificationOrchestratorService.emitEvent(
        "questionnaire.due_48h",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Questionnaire due soon",
          message: "Questionnaire is due within 48 hours.",
          severity: "warning",
        },
        { tenantId: audit.tenant_id || null }
      );
    }

    const overdue24 = await AuditRequestMaster.find({ complianceDate: { $lt: now, $gte: overdue5d } });
    for (const audit of overdue24) {
      await NotificationOrchestratorService.emitEvent(
        "questionnaire.overdue",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Questionnaire overdue",
          message: "Questionnaire is overdue.",
          severity: "critical",
        },
        { tenantId: audit.tenant_id || null }
      );
    }

    const overdueEsc = await AuditRequestMaster.find({ complianceDate: { $lt: overdue5d } });
    for (const audit of overdueEsc) {
      await NotificationOrchestratorService.emitEvent(
        "questionnaire.overdue.escalate",
        {
          entityType: "audit",
          entityId: audit._id,
          title: "Questionnaire overdue 5 days",
          message: "Escalation to tenant admins.",
          severity: "critical",
        },
        { tenantId: audit.tenant_id || null }
      );
    }
  });

  // Email dispatcher every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await processPendingEmails();
  });

  // Milestone overdue checker every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();
    const staleWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch overdue milestones using index on expectedAt/status/tenant
    const overdue = await WorkflowMilestoneInstance.find({
      status: { $nin: ["COMPLETED", "SKIPPED"] },
      expectedAt: { $lt: now },
    })
      .select("_id tenantId workflowEntityType workflowEntityId milestoneCode expectedAt lastNotifiedAt status")
      .limit(500);

    for (const ms of overdue) {
      const tenantId = ms.tenantId;
      const lastNotified = ms.lastNotifiedAt;
      const shouldNotify = !lastNotified || lastNotified < staleWindow;

      if (shouldNotify) {
        await NotificationOrchestratorService.emitEvent(
          "MILESTONE_OVERDUE",
          {
            entityType: ms.workflowEntityType,
            entityId: ms.workflowEntityId,
            title: `Milestone ${ms.milestoneCode} overdue`,
            message: `Expected at ${ms.expectedAt?.toISOString?.()}`,
            severity: "critical",
          },
          { tenantId }
        );
      }

      // Escalation ladder
      const sla = await WorkflowSlaConfig.findOne({
        tenantId,
        milestoneCode: ms.milestoneCode,
        workflowType: "AUDIT",
      }).lean();
      if (sla?.escalation?.length) {
        const overdueHours = (now.getTime() - (ms.expectedAt?.getTime?.() || now.getTime())) / (1000 * 60 * 60);
        for (const esc of sla.escalation) {
          if (overdueHours >= esc.afterHours) {
            await NotificationOrchestratorService.emitEvent(
              "MILESTONE_OVERDUE_ESCALATION",
              {
                entityType: ms.workflowEntityType,
                entityId: ms.workflowEntityId,
                title: `Milestone ${ms.milestoneCode} escalation`,
                message: `Overdue by ${Math.round(overdueHours)} hours`,
                severity: esc.severity || "critical",
                channels: esc.channels || ["inApp"],
                recipientStrategy: "tenant_admins",
              },
              { tenantId }
            );
          }
        }
      }

      // update lastNotifiedAt & isOverdue flag
      await WorkflowMilestoneInstance.updateOne(
        { _id: ms._id },
        { isOverdue: true, lastNotifiedAt: now }
      );
    }
  });

  // Supplier onboarding incomplete reminders daily at 2am UTC
  cron.schedule("0 2 * * *", async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const incomplete = await SupplierProfile.find({
      isProfileCompleted: { $ne: true },
      createdAt: { $lte: cutoff },
    })
      .select("_id user_id tenant_id")
      .limit(500);

    for (const prof of incomplete) {
      await NotificationOrchestratorService.emitEvent(
        "onboarding.supplier_incomplete",
        {
          entityType: "supplier",
          entityId: prof.user_id,
          title: "Complete your onboarding",
          message: "Your profile is still incomplete.",
          action: { url: `${process.env.FE_BASE_URL || ""}/onboard?supplier=${prof.user_id}#profile` },
          recipientUserIds: [prof.user_id],
        },
        { tenantId: prof.tenant_id || null }
      );
    }
  });

  // Certification expiry reminders daily at 3am UTC
  cron.schedule("0 3 * * *", async () => {
    const now = new Date();
    const windows = [30, 15, 7];
    for (const days of windows) {
      const start = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const auditors = await AuditorProfile.find({
        "certifications.expiryDate": { $gte: start, $lt: end },
      }).select("_id user_id tenant_id certifications");

      for (const ap of auditors) {
        const expiringCerts = (ap.certifications || []).filter(
          (c) => c.expiryDate && c.expiryDate >= start && c.expiryDate < end
        );
        if (!expiringCerts.length) continue;
        await NotificationOrchestratorService.emitEvent(
          "onboarding.cert_expiring",
          {
            entityType: "auditor",
            entityId: ap.user_id,
            title: "Certification expiring soon",
            message: `You have certifications expiring in ${days} days.`,
            channels: ["email", "inApp"],
            action: { url: `${process.env.FE_BASE_URL || ""}/onboard?auditor=${ap.user_id}#certifications` },
            recipientUserIds: [ap.user_id],
          },
          { tenantId: ap.tenant_id || null }
        );
      }
    }
  });
};
