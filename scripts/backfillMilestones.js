import dotenv from "dotenv";
import mongoose from "mongoose";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { WorkflowMilestoneDefinition } from "../src/models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../src/models/workflowMilestoneInstanceModel.js";

dotenv.config();

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const DEFAULT_DEFS = [
  { code: "AR_CREATED", name: "Audit request created", order: 10, role: "buyer" },
  { code: "AR_AUDITOR_ASSIGNED", name: "Auditor assigned", order: 20, role: "buyer" },
  { code: "AR_AUDITOR_ACCEPTANCE_PENDING", name: "Auditor acceptance pending", order: 30, role: "auditor" },
  { code: "AR_ACCEPTED", name: "Audit accepted", order: 40, role: "auditor" },
  { code: "TEMPLATE_SELECTION_PENDING", name: "Template selection pending", order: 50, role: "auditor" },
  { code: "QUESTIONNAIRE_PREP_IN_PROGRESS", name: "Questionnaire prep in progress", order: 60, role: "auditor" },
  { code: "QUESTIONNAIRE_RELEASED", name: "Questionnaire released", order: 70, role: "auditor" },
  { code: "SUPPLIER_RESPONSE_PENDING", name: "Supplier response pending", order: 80, role: "supplier" },
  { code: "SUPPLIER_SUBMITTED", name: "Supplier submitted", order: 90, role: "supplier" },
  { code: "AUDITOR_REVIEW_PENDING", name: "Auditor review pending", order: 100, role: "auditor" },
  { code: "FOLLOWUP_REQUESTED", name: "Supplier follow up open", order: 110, role: "supplier" },
  { code: "FOLLOWUP_RESPONSES_SUBMITTED", name: "Follow-up responses submitted", order: 120, role: "supplier" },
  { code: "FINAL_REVIEW_AND_SIGNOFF", name: "Final review and signoff", order: 130, role: "auditor" },
  { code: "REPORT_GENERATION_IN_PROGRESS", name: "Report generation in progress", order: 140, role: "auditor" },
  { code: "REPORT_PUBLISHED", name: "Report published", order: 150, role: "auditor" },
];

const parseObjId = (val) => {
  if (!val) return undefined;
  return mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : undefined;
};

const ensureDefinitions = async (tenantId) => {
  if (!tenantId) return;
  for (const def of DEFAULT_DEFS) {
    await WorkflowMilestoneDefinition.updateOne(
      { tenantId, workflowType: "AUDIT", code: def.code },
      {
        $setOnInsert: {
          tenantId,
          workflowType: "AUDIT",
          code: def.code,
          name: def.name,
          order: def.order,
          defaultResponsibleRole: def.role,
          defaultDurationHours: 24,
          isActive: true,
        },
      },
      { upsert: true }
    );
  }
};

const ensureInstance = async (tenantId, auditId, code) => {
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const existing = await WorkflowMilestoneInstance.findOne(filter);
  if (existing) return existing;
  return WorkflowMilestoneInstance.create({ ...filter, status: "NOT_STARTED" });
};

const advanceMilestone = async ({ tenantId, auditId, code, desiredStatus }) => {
  if (!tenantId || !auditId || !code || !desiredStatus) return;
  await ensureInstance(tenantId, auditId, code);
  const filter = {
    tenantId,
    workflowType: "AUDIT",
    workflowEntityType: "AuditRequest",
    workflowEntityId: auditId,
    milestoneCode: code,
  };
  const current = await WorkflowMilestoneInstance.findOne(filter).lean();
  const currentRank = MILESTONE_ORDER[current?.status] ?? 0;
  const desiredRank = MILESTONE_ORDER[desiredStatus] ?? 0;
  if (desiredRank < currentRank) return;
  const update = { status: desiredStatus, updatedAt: new Date() };
  if (desiredStatus === "IN_PROGRESS" && !current?.startedAt) update.startedAt = new Date();
  if (desiredStatus === "COMPLETED") {
    update.completedAt = new Date();
    if (current?.expectedAt) update.isOverdue = current.expectedAt < new Date();
  }
  await WorkflowMilestoneInstance.findOneAndUpdate(filter, update, { new: true, upsert: true });
};

const syncMilestonesFromStatus = async ({ audit, trackStatus, questionnaireStatus, nextAuditOn }) => {
  const tenantId = parseObjId(audit?.tenantOrgId || audit?.tenant_id || audit?.tenantId);
  const auditId = audit?._id;
  if (!tenantId || !auditId) return;
  await ensureDefinitions(tenantId);
  const statusNorm = (trackStatus || "").toLowerCase();
  const qStatus = (questionnaireStatus || "").toLowerCase();

  if (statusNorm.includes("request") || qStatus === "request_received") {
    await advanceMilestone({ tenantId, auditId, code: "AR_CREATED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ASSIGNED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "AR_AUDITOR_ACCEPTANCE_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AR_ACCEPTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "TEMPLATE_SELECTION_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_PREP_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RELEASED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed") || nextAuditOn === "auditor") {
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_RESPONSE_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "SUPPLIER_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "followup_requested") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "followup_submitted") {
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_REQUESTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FOLLOWUP_RESPONSES_SUBMITTED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "AUDITOR_REVIEW_PENDING", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "FINAL_REVIEW_AND_SIGNOFF", desiredStatus: "IN_PROGRESS" });
  }
};

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGODB_URI/MONGO_URI missing");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const audits = await AuditRequestMaster.find({}).lean();
  console.log(`Found ${audits.length} audit requests. Backfilling milestones...`);
  for (const audit of audits) {
    await syncMilestonesFromStatus({
      audit,
      trackStatus: audit.trackStatus,
      questionnaireStatus: audit.questionnaireStatus,
      nextAuditOn: audit.nextAuditOn,
    });
  }
  console.log("Backfill complete");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
