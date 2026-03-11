import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Tenant from "../models/tenantModel.js";
import { User } from "../models/userModel.js";
import { SupplierProfile } from "../models/supplierProfileModel.js";
import { AuditorProfile } from "../models/auditorProfileModel.js";
import { BuyerProfile } from "../models/buyerProfileModel.js";
import { SupplierSite } from "../models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../models/productSiteMappingModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../models/auditQuestionsModels.js";
import { WorkflowMilestoneDefinition } from "../models/workflowMilestoneDefinitionModel.js";
import { WorkflowMilestoneInstance } from "../models/workflowMilestoneInstanceModel.js";
import { Document } from "../models/documentModel.js";
import { DocumentView } from "../models/documentViewModel.js";
import { SharePolicy } from "../models/sharePolicyModel.js";
import { AccessEvent } from "../models/accessEventModel.js";

const devGuard = (req) => {
  if (process.env.NODE_ENV === "production") throw new Error("Not allowed in production");
  const secret = process.env.DEV_SEED_SECRET || "devseed";
  if (req.headers["x-seed-secret"] !== secret) throw new Error("Forbidden");
};

export const resetDev = async (req, res) => {
  try {
    devGuard(req);
    await Promise.all([
      User.deleteMany({}),
      Tenant.deleteMany({}),
      SupplierProfile.deleteMany({}),
      AuditorProfile.deleteMany({}),
      BuyerProfile.deleteMany({}),
      SupplierSite.deleteMany({}),
      SupplierMasterProducts.deleteMany({}),
      ProductSiteMappings.deleteMany({}),
      AuditRequestMaster.deleteMany({}),
      AuditQuestions.deleteMany({}),
      WorkflowMilestoneDefinition.deleteMany({}),
      WorkflowMilestoneInstance.deleteMany({}),
      Document.deleteMany({}),
      DocumentView.deleteMany({}),
      SharePolicy.deleteMany({}),
      AccessEvent.deleteMany({}),
    ]);
    return res.json({ success: true, message: "Reset complete" });
  } catch (err) {
    return res.status(403).json({ success: false, message: err.message });
  }
};

export const seedDev = async (req, res) => {
  try {
    devGuard(req);

    const hash = async (pwd) => bcrypt.hash(pwd, 10);
    const envOr = (key, fallback) => process.env[key] || fallback;

    const pwd = await hash("Testing@2022");
    const platformAdmin = await User.create({
      email: envOr("E2E_HAWKEYE_ADMIN_EMAIL", "hawkeye-admin@test.com"),
      password: process.env.E2E_HAWKEYE_ADMIN_PWD ? await hash(process.env.E2E_HAWKEYE_ADMIN_PWD) : pwd,
      role: "superadmin",
      adminScope: "PLATFORM",
      status: "ACTIVE",
      isEmailVerified: true,
    });

    const tenantA = await Tenant.create({ name: "tenant-a", displayName: "Tenant A", type: "BUYER", status: "ACTIVE" });
    const tenantB = await Tenant.create({ name: "tenant-b", displayName: "Tenant B", type: "BUYER", status: "ACTIVE" });

    const mkUser = async ({ email, role, tenant }) =>
      User.create({
        email,
        password: process.env[`E2E_${role.toUpperCase()}_PWD`] ? await hash(process.env[`E2E_${role.toUpperCase()}_PWD`]) : pwd,
        role,
        tenant_id: tenant?._id,
        adminScope: role === "tenant_admin" ? "TENANT" : "NONE",
        status: "ACTIVE",
        isEmailVerified: true,
      });

    const tenantAdmin = await mkUser({ email: envOr("E2E_ADMIN_EMAIL", "tenant-admin@test.com"), role: "tenant_admin", tenant: tenantA });
    const buyer = await mkUser({ email: envOr("E2E_BUYER_EMAIL", "buyer@test.com"), role: "buyer", tenant: tenantA });
    const supplier = await mkUser({ email: envOr("E2E_SUPPLIER_EMAIL", "supplier@test.com"), role: "supplier", tenant: tenantA });
    const auditor = await mkUser({ email: envOr("E2E_AUDITOR_EMAIL", "auditor@test.com"), role: "auditor", tenant: tenantA });

    await BuyerProfile.create({
      user_id: buyer._id,
      tenant_id: tenantA._id,
      title: "Mr",
      firstName: "Buyer",
      lastName: "One",
      countryCode: "+1",
      phone: 1234567890,
      companyName: "Buyer Co",
      addressline1: "1 Buyer St",
      zipcode: "10001",
      isProfileCompleted: true,
    });

    await AuditorProfile.create({
      user_id: auditor._id,
      tenant_id: tenantA._id,
      title: "Mr",
      firstName: "Auditor",
      lastName: "One",
      countryCode: "+1",
      phone: 1234567890,
      companyName: "Audit Co",
      addressline1: "1 Audit St",
      zipcode: "10002",
      isProfileCompleted: true,
    });

    await SupplierProfile.create({
      user_id: supplier._id,
      tenant_id: tenantA._id,
      title: "Mr",
      firstName: "Supplier",
      lastName: "One",
      countryCode: "+1",
      phone: 1234567890,
      companyName: "Supplier Co",
      addressline1: "1 Supplier Ave",
      zipcode: "10003",
      isProfileCompleted: true,
    });

    const site = await SupplierSite.create({
      tenant_id: tenantA._id,
      user_id: supplier._id,
      site_name: "Main Plant",
      address_line1: "1 Plant Rd",
      city: "City",
      state: "State",
      country: "USA",
      zipcode: "10003",
      contact_person_title: "Mr",
      contact_person_fname: "Supplier",
      contact_person_lname: "One",
      contact_email: supplier.email,
      contact_phone_countryCode: "+1",
      contact_phone: "1234567890",
      gmp_audited: true,
      plant_id: "PLANT-001",
    });

    const product = await SupplierMasterProducts.create({
      name: "API Product",
      casNumber: "50-00-0",
      description: "Seed product",
      apiTechnology: "CHEM",
      dosageForm: "Tablet",
      plant_id: "PLANT-001",
    });

    await ProductSiteMappings.create({
      user_id: supplier._id,
      site_id: site._id,
      product_id: product._id,
    });

    const audit = await AuditRequestMaster.create({
      tenantOrgId: String(tenantA._id),
      supplier_id: supplier._id,
      auditor_id: auditor._id,
      create_by_buyer_id: buyer._id,
      supplier_product_id: product._id,
      complianceDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      site_id: site._id,
      high_status: 5,
      trackStatus: "Request Received",
      questionnaireStatus: "request_received",
      internalRequestId: "HAWK0000000001",
      supplierRequestId: "HAWK0000000001",
      internalSequence: 1,
      supplierSequence: 1,
      assignedAuditors: [
        { auditorProfileId: (await AuditorProfile.findOne({ user_id: auditor._id }))._id, role: "LEAD", assignedAt: new Date(), assignedBy: buyer._id },
      ],
    });

    const defs = [
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

    await WorkflowMilestoneDefinition.insertMany(
      defs.map((d) => ({
        tenantId: tenantA._id,
        workflowType: "AUDIT",
        ...d,
        defaultResponsibleRole: "auditor",
        defaultDurationHours: 24,
        isActive: true,
      }))
    );

    const now = new Date();
    const expected = (hours) => {
      const d = new Date(now);
      d.setHours(d.getHours() + hours);
      return d;
    };
    await WorkflowMilestoneInstance.insertMany([
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "REQUEST_REVIEW_IN_PROGRESS", status: "COMPLETED", expectedAt: expected(-72), completedAt: expected(-70) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "REQUEST_REVIEW_COMPLETED", status: "COMPLETED", expectedAt: expected(-48), completedAt: expected(-46) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "QUESTIONNAIRE_SENT", status: "COMPLETED", expectedAt: expected(-36), completedAt: expected(-34) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "QUESTIONNAIRE_RECEIVED", status: "COMPLETED", expectedAt: expected(-24), completedAt: expected(-22) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "RESPONSE_IN_PROGRESS", status: "IN_PROGRESS", expectedAt: expected(12) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "RESPONSE_COMPLETED", status: "NOT_STARTED", expectedAt: expected(36) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "RESPONSE_RECEIVED", status: "NOT_STARTED", expectedAt: expected(48) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "RESPONSE_REVIEW_IN_PROGRESS", status: "NOT_STARTED", expectedAt: expected(60) },
      { tenantId: tenantA._id, workflowType: "AUDIT", workflowEntityType: "AuditRequest", workflowEntityId: audit._id, milestoneCode: "RESPONSE_REVIEW_COMPLETED", status: "NOT_STARTED", expectedAt: expected(72) },
    ]);

    const auditTenantB = await AuditRequestMaster.create({
      tenantOrgId: String(tenantB._id),
      supplier_id: supplier._id,
      auditor_id: auditor._id,
      create_by_buyer_id: buyer._id,
      supplier_product_id: product._id,
      complianceDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      site_id: site._id,
      high_status: 2,
      trackStatus: "Request Received",
      questionnaireStatus: "request_received",
      internalRequestId: "HAWK0000000002",
      supplierRequestId: "HAWK0000000002",
      internalSequence: 2,
      supplierSequence: 2,
    });

    const seedQuestion = await AuditQuestions.create({
      question_id: new mongoose.Types.ObjectId(),
      auditRequestId: audit._id,
      question: "Provide Site Master File (SMF)",
      categoryName: "Quality",
      templateId: 1,
      categoryId: new mongoose.Types.ObjectId(),
      answerType: "attachment",
    });

    const onboardingDoc = await Document.create({
      tenantId: tenantA._id,
      uploaderUserId: supplier._id,
      contextType: "onboarding",
      contextRef: String(supplier._id),
      originalFileRef: "mock://uploads/onboarding-smf.pdf",
      fileName: "onboarding-smf.pdf",
      status: "DRAFT",
      encryptionMode: "STANDARD",
      processingConsent: true,
    });

    const auditDoc = await Document.create({
      tenantId: tenantA._id,
      uploaderUserId: supplier._id,
      contextType: "audit_question",
      contextRef: String(seedQuestion._id),
      originalFileRef: "mock://uploads/audit-evidence.pdf",
      fileName: "audit-evidence.pdf",
      status: "REDACTION_ACCEPTED",
      encryptionMode: "ENHANCED",
      processingConsent: true,
    });

    const auditView = await DocumentView.create({
      documentId: auditDoc._id,
      viewType: "AUDITOR",
      version: 1,
      redactionSpec: [],
      generatedFileRef: "mock://redacted/audit-evidence-v1.pdf",
      createdBy: supplier._id,
    });

    const sharePolicy = await SharePolicy.create({
      documentViewId: auditView._id,
      recipients: [{ type: "userId", value: String(auditor._id) }],
      startAt: new Date(Date.now() - 60 * 60 * 1000),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      controls: { allowDownload: false, watermark: true, otpRequired: false },
      status: "ACTIVE",
    });

    await AccessEvent.create({
      documentViewId: auditView._id,
      actorUserId: auditor._id,
      actionType: "VIEW",
      ts: new Date(),
      metadata: { seed: true },
    });

    return res.json({
      success: true,
      data: {
        platformAdmin,
        tenantA,
        tenantB,
        users: { tenantAdmin, buyer, supplier, auditor },
        audit: audit._id,
        auditTenantB: auditTenantB._id,
        documentDisclosure: { onboardingDoc, auditDoc, auditView, sharePolicy },
      },
    });
  } catch (err) {
    console.error("seed error", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
