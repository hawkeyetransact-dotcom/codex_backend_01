import mongoose from "mongoose";
import dotenv from "dotenv";
import Tenant from "../src/models/tenantModel.js";
import { AssessmentType } from "../src/models/assessmentTypeModel.js";
import { StatusDefinition } from "../src/models/statusDefinitionModel.js";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { PHASE_DEFINITIONS, TEMPLATE_TYPES } from "../src/constants/assessmentTracking.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URL;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI or DB_URL env.");
  process.exit(1);
}

const ASSESSMENT_KEY = "PHARMA_API_CGMP_ICHQ7";
const ASSESSMENT_NAME = "Pharma API cGMP (ICH Q7)";

const STATUS_SEED = {
  INITIATED: [
    { statusCode: "VENDOR_REGISTRATION_REQUESTED", name: "Vendor registration requested", order: 5, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
    { statusCode: "VENDOR_REGISTRATION_COMPLETE", name: "Vendor registration complete", order: 10, defaultResponsibleRole: "supplier", defaultDurationHours: 48 },
    { statusCode: "SAMPLE_BATCHES_RECEIVED", name: "Trial batches received", order: 15, defaultResponsibleRole: "buyer", defaultDurationHours: 72 },
    { statusCode: "INTERNAL_SAMPLE_TEST_COMPLETE", name: "Internal sample testing complete", order: 20, defaultResponsibleRole: "buyer", defaultDurationHours: 48 },
    { statusCode: "AUDIT_INTIMATION_SENT", name: "Audit intimation sent", order: 25, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
    { statusCode: "AUDITOR_SELECTED", name: "Auditor selected", order: 30, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
    { statusCode: "RFQ_CREATED", name: "RFQ created", order: 40, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
    { statusCode: "SCOPE_DRAFTED", name: "Scope drafted", order: 50, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "REQUEST_APPROVED", name: "Request approved", order: 60, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
  ],
  PREP: [
    { statusCode: "PREP_INVITE_SENT", name: "Prep invite sent", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "PRE_AUDIT_Q_SENT", name: "Pre-audit questionnaire sent", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "SUPPLIER_RESPONSE", name: "Supplier response received", order: 30, defaultResponsibleRole: "supplier", defaultDurationHours: 72 },
    { statusCode: "DRL_COMPLETE", name: "Document request list complete", order: 40, defaultResponsibleRole: "supplier", defaultDurationHours: 72 },
    { statusCode: "PREP_REVIEW_COMPLETE", name: "Prep review complete", order: 50, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  ],
  PLANNING: [
    { statusCode: "SUPPLIER_PROPOSED_DATE", name: "Supplier proposed dates", order: 10, defaultResponsibleRole: "supplier", defaultDurationHours: 24 },
    { statusCode: "AUDITOR_ACCEPTED_DATE", name: "Auditor accepted dates", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "AGENDA_DRAFTED", name: "Scope & agenda drafted", order: 30, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "AGENDA_CONFIRMED", name: "Scope & agenda confirmed", order: 40, defaultResponsibleRole: "supplier", defaultDurationHours: 24 },
    { statusCode: "SCOPE_AGENDA_SHARED", name: "Scope & agenda shared", order: 50, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "STAKEHOLDERS_NOTIFIED", name: "Stakeholders notified", order: 60, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  ],
  EXECUTION: [
    { statusCode: "OPENING_MEETING_DONE", name: "Opening meeting completed", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 8 },
    { statusCode: "WALKTHROUGH_DONE", name: "Walkthrough completed", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 16 },
    { statusCode: "RECORD_REVIEW_DONE", name: "Record review completed", order: 30, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "CLOSING_MEETING_DONE", name: "Closing meeting completed", order: 40, defaultResponsibleRole: "auditor", defaultDurationHours: 8 },
  ],
  FINDINGS: [
    { statusCode: "OBSERVATIONS_LOGGED", name: "Observations logged", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "CLASSIFICATION_DONE", name: "Classification completed", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "FINDINGS_PUBLISHED", name: "Findings published", order: 30, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  ],
  CAPA: [
    { statusCode: "CAPA_REQUESTED", name: "CAPA requested", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "CAPA_SUBMITTED", name: "CAPA submitted", order: 20, defaultResponsibleRole: "supplier", defaultDurationHours: 72 },
    { statusCode: "CAPA_VERIFIED", name: "CAPA verified", order: 30, defaultResponsibleRole: "auditor", defaultDurationHours: 48 },
  ],
  CLOSURE: [
    { statusCode: "REPORT_DRAFTED", name: "Report drafted", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "REPORT_PUBLISHED", name: "Report published", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "DECISION_RECORDED", name: "Decision recorded", order: 30, defaultResponsibleRole: "buyer", defaultDurationHours: 24 },
  ],
  SURVEILLANCE: [
    { statusCode: "FOLLOWUP_SCHEDULED", name: "Follow-up scheduled", order: 10, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
    { statusCode: "SURVEILLANCE_COMPLETE", name: "Surveillance completed", order: 20, defaultResponsibleRole: "auditor", defaultDurationHours: 24 },
  ],
};

const computeNextTemplateId = async () => {
  const [maxFromTemplates, maxFromQuestions] = await Promise.all([
    Template.findOne().sort({ templateId: -1 }).select("templateId").lean(),
    TemplateQuestions.findOne().sort({ templateId: -1 }).select("templateId").lean(),
  ]);
  const maxVal = Math.max(maxFromTemplates?.templateId || 0, maxFromQuestions?.templateId || 0);
  return maxVal + 1;
};

const seedAssessmentType = async ({ tenantId }) => {
  return AssessmentType.findOneAndUpdate(
    { tenantId, key: ASSESSMENT_KEY },
    {
      tenantId,
      key: ASSESSMENT_KEY,
      name: ASSESSMENT_NAME,
      workflowType: "AUDIT",
      phases: PHASE_DEFINITIONS,
      defaultGranularity: "STANDARD",
    },
    { upsert: true, new: true }
  );
};

const seedStatusDefinitions = async ({ tenantId, assessmentTypeId }) => {
  let upserted = 0;
  for (const [phaseKey, list] of Object.entries(STATUS_SEED)) {
    for (const def of list) {
      await StatusDefinition.findOneAndUpdate(
        {
          tenantId,
          assessmentTypeId,
          phaseKey,
          statusCode: def.statusCode,
        },
        {
          ...def,
          tenantId,
          assessmentTypeId,
          phaseKey,
          isActive: true,
          isDefault: true,
        },
        { upsert: true, new: true }
      );
      upserted += 1;
    }
  }
  return upserted;
};

const seedTemplates = async ({ tenantId, assessmentTypeId }) => {
  let created = 0;
  for (const templateType of TEMPLATE_TYPES) {
    const existing = await Template.findOne({ tenantId, assessmentTypeId, templateType }).lean();
    if (existing) continue;
    const templateId = await computeNextTemplateId();
    await Template.create({
      tenantId,
      templateId,
      name: `${templateType.replace(/_/g, " ")} Template`,
      templateType,
      assessmentTypeId,
      status: "DRAFT",
      version: 1,
    });
    created += 1;
  }
  return created;
};

const seedForTenant = async (tenantId) => {
  const assessmentType = await seedAssessmentType({ tenantId });
  const statusCount = await seedStatusDefinitions({ tenantId, assessmentTypeId: assessmentType._id });
  const templateCount = await seedTemplates({ tenantId, assessmentTypeId: assessmentType._id });
  return { assessmentTypeId: assessmentType._id, statusCount, templateCount };
};

async function run() {
  await mongoose.connect(MONGODB_URI);
  await AssessmentType.syncIndexes();
  await StatusDefinition.syncIndexes();
  await Template.syncIndexes();

  const tenantArg = process.argv[2] || process.env.SEED_TENANT_ID;
  const tenants = tenantArg
    ? await Tenant.find({ _id: tenantArg }).select("_id").lean()
    : await Tenant.find({}).select("_id").lean();

  if (!tenants.length) {
    console.warn("No tenants found. Seeding global defaults.");
    const result = await seedForTenant(null);
    console.log("Seeded global defaults", result);
    await mongoose.disconnect();
    return;
  }

  for (const tenant of tenants) {
    const tenantId = tenant?._id?.toString();
    const result = await seedForTenant(tenantId);
    await Tenant.findByIdAndUpdate(tenantId, { $set: { trackingGranularity: "STANDARD" } });
    console.log("Seeded tenant", tenantId, result);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("seed_tracking_mvp failed", err);
  process.exit(1);
});
