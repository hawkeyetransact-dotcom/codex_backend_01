import dotenv from "dotenv";
import mongoose from "mongoose";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { WorkflowMilestoneDefinition } from "../src/models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../src/models/workflowMilestoneInstanceModel.js";

dotenv.config();

const MILESTONE_ORDER = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2, SKIPPED: 2 };
const DEFAULT_CODES = [
  { code: "REQUEST_REVIEW_IN_PROGRESS", name: "Request Review In Progress", order: 1 },
  { code: "REQUEST_REVIEW_COMPLETED", name: "Request Review Completed", order: 2 },
  { code: "QUESTIONNAIRE_SENT", name: "Questionnaire Sent", order: 3 },
  { code: "QUESTIONNAIRE_RECEIVED", name: "Questionnaire Received", order: 4 },
  { code: "RESPONSE_IN_PROGRESS", name: "Response In Progress", order: 5 },
  { code: "RESPONSE_COMPLETED", name: "Response Completed", order: 6 },
  { code: "RESPONSE_RECEIVED", name: "Response Received", order: 7 },
  { code: "RESPONSE_REVIEW_IN_PROGRESS", name: "Response Review In Progress", order: 8 },
  { code: "RESPONSE_REVIEW_COMPLETED", name: "Response Review Completed", order: 9 },
];

const parseObjId = (val) => {
  if (!val) return undefined;
  return mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : undefined;
};

const ensureDefinitions = async (tenantId) => {
  if (!tenantId) return;
  const count = await WorkflowMilestoneDefinition.countDocuments({ tenantId });
  if (count > 0) return;
  const defs = DEFAULT_CODES.map((d) => ({
    tenantId,
    workflowType: "AUDIT",
    ...d,
    defaultResponsibleRole: "auditor",
    defaultDurationHours: 24,
    isActive: true,
  }));
  await WorkflowMilestoneDefinition.insertMany(defs);
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
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("questionnaire") || qStatus === "in_progress") {
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "REQUEST_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "sent_to_supplier") {
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_SENT", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "QUESTIONNAIRE_RECEIVED", desiredStatus: "IN_PROGRESS" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_draft") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (qStatus === "supplier_submitted" || statusNorm.includes("response completed") || nextAuditOn === "auditor") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_COMPLETED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_RECEIVED", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "IN_PROGRESS" });
  }

  if (statusNorm.includes("review completed") || qStatus === "review_completed") {
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_IN_PROGRESS", desiredStatus: "COMPLETED" });
    await advanceMilestone({ tenantId, auditId, code: "RESPONSE_REVIEW_COMPLETED", desiredStatus: "COMPLETED" });
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
