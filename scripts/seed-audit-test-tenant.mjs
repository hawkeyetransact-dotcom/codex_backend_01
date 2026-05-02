/**
 * seed-audit-test-tenant.mjs
 *
 * Creates a FRESH tenant with audit-only personas + templates + zero sample
 * data. Use this to retest the audit flow end-to-end on a clean slate without
 * polluting the existing acme-pharma-audit tenant.
 *
 * Tenant name: "acme-pharma-test"
 * Personas (all password: AuditDemo@2026):
 *   buyer.audit@acme-test.demo     Priya Nair       (Audit Program Manager)
 *   buyer.vp@acme-test.demo        Elena Vasquez    (VP Quality, tenant_admin)
 *   auditor.lead@acme-test.demo    Maria Santos     (Lead Auditor)
 *   auditor.co@acme-test.demo      Rahul Kapoor     (Co-Auditor)
 *   supplier.qa@acme-test.demo     Asha Sharma      (Supplier QA Head)
 *   supplier.prod@acme-test.demo   Amit Kumar       (Production)
 *
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/seed-audit-test-tenant.mjs
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import Tenant from "../src/models/tenantModel.js";
import { User } from "../src/models/userModel.js";
import { BuyerProfile } from "../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../src/models/supplierProfileModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";
import { SupplierSite } from "../src/models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../src/models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../src/models/productSiteMappingModel.js";
import ModuleConfig from "../src/models/ModuleConfigModel.js";
import { AuditorQualification } from "../src/models/AuditorQualificationModel.js";
import { AuditorAffiliation } from "../src/models/auditorAffiliationModel.js";
import { SupplierPreQualification } from "../src/models/SupplierPreQualificationModel.js";
import { AgentPermission } from "../src/models/agentPermissionModel.js";
import { Template } from "../src/models/templateModel.js";
import { TemplateQuestions } from "../src/models/templateQuestionsModel.js";
import { Categories } from "../src/models/categoriesModel.js";

const PASSWORD = "AuditDemo@2026";
const TENANT_NAME = "acme-pharma-test";
const TENANT_DISPLAY = "Acme Pharma Test Inc.";

await mongoose.connect(process.env.MONGO_URI);
console.log(`DB: ${mongoose.connection.db.databaseName}`);

const hash = await bcrypt.hash(PASSWORD, 10);

// 1. TENANT ────────────────────────────────────────────────────────────────
let tenant = await Tenant.findOne({ name: TENANT_NAME });
if (tenant) {
  console.log(`Tenant exists: ${tenant._id}`);
} else {
  tenant = await Tenant.create({
    name: TENANT_NAME, displayName: TENANT_DISPLAY, type: "BUYER", status: "ACTIVE",
  });
  console.log(`Created tenant: ${tenant._id} (${TENANT_DISPLAY})`);
}
const tenantId = tenant._id;

// 2. USERS ─────────────────────────────────────────────────────────────────
const USERS = [
  { email: "buyer.audit@acme-test.demo", role: "buyer", adminScope: "NONE",
    firstName: "Priya", lastName: "Nair", department: "Quality Assurance — Audit Programme",
    profile: "buyer", profileData: { title: "Ms", firstName: "Priya", lastName: "Nair",
      countryCode: "+1", phone: 5552001100, companyName: TENANT_DISPLAY,
      addressline1: "200 Test Drive", city: "Boston", state: "Massachusetts",
      country: "USA", zipcode: "02101", isProfileCompleted: true } },
  { email: "buyer.vp@acme-test.demo", role: "buyer", adminScope: "TENANT",
    firstName: "Elena", lastName: "Vasquez", department: "Quality — Leadership",
    profile: "buyer", profileData: { title: "Dr", firstName: "Elena", lastName: "Vasquez",
      countryCode: "+1", phone: 5552001200, companyName: TENANT_DISPLAY,
      addressline1: "200 Test Drive", city: "Boston", state: "Massachusetts",
      country: "USA", zipcode: "02101", isProfileCompleted: true } },
  { email: "auditor.lead@acme-test.demo", role: "auditor", adminScope: "NONE",
    firstName: "Maria", lastName: "Santos",
    profile: "auditor", profileData: { title: "Ms", firstName: "Maria", lastName: "Santos",
      countryCode: "+34", phone: 600200100, companyName: "AuditCorp Test Intl",
      addressline1: "10 Test Lane", city: "Madrid", state: "Madrid",
      country: "Spain", zipcode: "28001", isProfileCompleted: true } },
  { email: "auditor.co@acme-test.demo", role: "auditor", adminScope: "NONE",
    firstName: "Rahul", lastName: "Kapoor",
    profile: "auditor", profileData: { title: "Mr", firstName: "Rahul", lastName: "Kapoor",
      countryCode: "+91", phone: 9876512345, companyName: "AuditCorp Test Intl",
      addressline1: "10 Test Lane", city: "Mumbai", state: "Maharashtra",
      country: "India", zipcode: "400001", isProfileCompleted: true } },
  { email: "supplier.qa@acme-test.demo", role: "supplier", adminScope: "NONE",
    firstName: "Asha", lastName: "Sharma", department: "Quality Assurance",
    profile: "supplier", profileData: { title: "Ms", firstName: "Asha", lastName: "Sharma",
      countryCode: "+91", phone: 9876512300, companyName: "Global Pharma Test Mfg Ltd.",
      addressline1: "Plot 99, MIDC Test Area", city: "Pune", state: "Maharashtra",
      country: "India", zipcode: "411018", isProfileCompleted: true } },
  { email: "supplier.prod@acme-test.demo", role: "supplierUser", adminScope: "NONE",
    firstName: "Amit", lastName: "Kumar", department: "Production", profile: null },
];

const createdUsers = {};
for (const u of USERS) {
  let user = await User.findOne({ email: u.email });
  if (user) {
    user.password = hash; user.role = u.role; user.tenant_id = tenantId;
    user.adminScope = u.adminScope; user.status = "ACTIVE"; user.isEmailVerified = true;
    user.firstName = u.firstName; user.lastName = u.lastName;
    await user.save();
    console.log(`User refreshed: ${u.email}`);
  } else {
    user = await User.create({
      email: u.email, password: hash, role: u.role, tenant_id: tenantId,
      adminScope: u.adminScope, status: "ACTIVE", isEmailVerified: true,
      firstName: u.firstName, lastName: u.lastName, permissions: [],
      ...(u.role === "supplierUser" ? { invitedBy: null } : {}),
    });
    console.log(`Created user: ${u.email} [${u.role}]`);
  }
  createdUsers[u.email] = user;

  if (u.profile === "buyer") {
    const exists = await BuyerProfile.findOne({ user_id: user._id });
    if (!exists) await BuyerProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
  } else if (u.profile === "supplier") {
    const exists = await SupplierProfile.findOne({ user_id: user._id });
    if (!exists) await SupplierProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
  } else if (u.profile === "auditor") {
    const exists = await AuditorProfile.findOne({ user_id: user._id });
    if (!exists) await AuditorProfile.create({
      user_id: user._id, tenant_id: tenantId, auditorAffiliation: "external", ...u.profileData,
    });
  }
}

// Link supplierUser to QA head
const supplierHead = createdUsers["supplier.qa@acme-test.demo"];
const supplierUser = createdUsers["supplier.prod@acme-test.demo"];
if (supplierUser && !supplierUser.invitedBy) {
  supplierUser.invitedBy = supplierHead._id;
  await supplierUser.save();
}

// 3. SUPPLIER SITE + PRODUCT ───────────────────────────────────────────────
let site = await SupplierSite.findOne({ plant_id: "GP-TEST-001", user_id: supplierHead._id });
if (!site) {
  site = await SupplierSite.create({
    site_name: "Global Pharma Test — API Plant",
    address_line1: "Plot 99, MIDC Test Phase II",
    city: "Pune", state: "Maharashtra", country: "India", zipcode: "411018",
    plant_id: "GP-TEST-001", gmp_audited: true,
    tenant_id: tenantId, user_id: supplierHead._id,
    contact_person_title: "Ms", contact_person_fname: "Asha", contact_person_lname: "Sharma",
    contact_email: supplierHead.email, contact_phone_countryCode: "+91", contact_phone: "9876512300",
  });
  console.log(`Site: ${site.site_name}`);
}

// Product — reuse existing master if present (casNumber is global-unique by index).
let product = await SupplierMasterProducts.findOne({ casNumber: "134523-00-5" });
if (!product) {
  product = await SupplierMasterProducts.create({
    name: "Atorvastatin Calcium", casNumber: "134523-00-5",
    description: "HMG-CoA reductase inhibitor API",
    apiTechnology: "Synthetic", dosageForm: "Tablet", plant_id: "GP-TEST-001",
  });
  console.log(`Product created: ${product.name}`);
}
const mappingExists = await ProductSiteMappings.findOne({
  user_id: supplierHead._id, site_id: site._id, product_id: product._id,
});
if (!mappingExists) {
  try {
    await ProductSiteMappings.create({ user_id: supplierHead._id, site_id: site._id, product_id: product._id });
  } catch (e) { if (e?.code !== 11000) throw e; }
}

// 4. MODULE CONFIG ─────────────────────────────────────────────────────────
await ModuleConfig.findOneAndUpdate(
  { tenantId },
  { $set: { tenantId, industryProfile: "PHARMA_GMP", modules: {
    AUDIT_MANAGEMENT: { enabled: true }, SUPPLIER_QUALITY: { enabled: true },
    CAPA_MANAGEMENT: { enabled: true }, REGULATORY_INTEL: { enabled: true },
    AI_ASSISTANT: { enabled: true }, RFQ_PROCUREMENT: { enabled: true },
    DOCUMENT_CONTROL: { enabled: false }, CHANGE_CONTROL: { enabled: false },
    EVENT_MANAGEMENT: { enabled: false }, TRAINING_MANAGEMENT: { enabled: false },
    RISK_MANAGEMENT: { enabled: false }, MANAGEMENT_REVIEW: { enabled: false },
    ASSET_MANAGEMENT: { enabled: false }, CHAIN_OF_CUSTODY: { enabled: false },
    TRANSACTION_REVIEW: { enabled: false },
  }, vocabularyOverrides: { audit: "GMP Audit", finding: "Deficiency", capa: "CAPA", report: "Audit Report" } } },
  { upsert: true, new: true }
);
console.log(`Module config: 6 audit-only modules enabled`);

// 5. AUDIT TEMPLATE (templateId=1) ─────────────────────────────────────────
let cgmpCat = await Categories.findOne({ name: "GMP Quality Systems" });
if (!cgmpCat) cgmpCat = await Categories.create({ name: "GMP Quality Systems" });
let template = await Template.findOne({ templateId: 1 });
if (!template) {
  template = await Template.create({
    tenantId: TENANT_NAME, templateId: 1,
    name: "ICH Q7 / 21 CFR 211 Pre-Audit Questionnaire",
    Audittype: "EXTERNAL", industry: "PHARMA",
    categories: ["GMP Quality Systems"],
    phaseKey: "PREP", artifactType: "PRE_AUDIT_QUESTIONNAIRE",
    productType: "API", riskLevel: "MEDIUM",
    visibility: { roles: ["buyer", "auditor", "supplier"], tenantOnly: false },
    templateType: "PRE_AUDIT_QUESTIONNAIRE", status: "PUBLISHED", version: 1,
  });
  console.log(`Template seeded (id=1)`);
}
const qCount = await TemplateQuestions.countDocuments({ templateId: 1 });
if (qCount < 3) {
  const Q_BANK = [
    "Is the manufacturing facility licensed by the local regulatory authority? Provide license number and expiry.",
    "Does the site operate under a current Site Master File (SMF)?",
    "Date of last regulatory inspection and outcome (NAI/VAI/OAI).",
  ];
  for (let i = 0; i < Q_BANK.length; i++) {
    const q = Q_BANK[i];
    const exists = await TemplateQuestions.findOne({ templateId: 1, normalizedQuestion: q.slice(0, 80).toLowerCase() });
    if (!exists) {
      await TemplateQuestions.create({
        question: q, normalizedQuestion: q.slice(0, 80).toLowerCase(),
        categoryName: cgmpCat.name, categoryId: cgmpCat._id,
        templateId: 1, questionCode: `ICHQ7-${String(i + 1).padStart(3, "0")}`,
        Audittype: "EXTERNAL", industry: "PHARMA", answerType: "text", order: i + 1,
        cfrReference: "21 CFR 211 + ICH Q7 §17",
      });
    }
  }
  console.log(`Template questions seeded`);
}

// 5b. AUDITOR AFFILIATIONS — both auditors get ACTIVE affiliation to this
// tenant so they show up in the buyer's auditor dropdown + can be assigned.
const auditorEmails = ["auditor.lead@acme-test.demo", "auditor.co@acme-test.demo"];
for (const email of auditorEmails) {
  const u = createdUsers[email];
  if (!u) continue;
  const prof = await AuditorProfile.findOne({ user_id: u._id });
  if (!prof) continue;
  const exists = await AuditorAffiliation.findOne({
    auditorProfileId: prof._id, orgTenantId: tenantId,
  });
  if (!exists) {
    await AuditorAffiliation.create({
      auditorProfileId: prof._id,
      orgTenantId: tenantId,
      affiliationType: "EXTERNAL",
      status: "ACTIVE",
      invitedBy: createdUsers["buyer.vp@acme-test.demo"]._id,
      approvedBy: createdUsers["buyer.vp@acme-test.demo"]._id,
      scope: ["GMP_AUDIT"],
    });
    console.log(`AuditorAffiliation: ${email} ↔ ${TENANT_NAME} (ACTIVE)`);
  }
}

// 6. AUDITOR QUALIFICATION (Maria QUALIFIED, no COI) ──────────────────────
const auditorMaria = createdUsers["auditor.lead@acme-test.demo"];
const mariaProfile = await AuditorProfile.findOne({ user_id: auditorMaria._id });
const qualExists = await AuditorQualification.findOne({ auditorUserId: auditorMaria._id, tenantId });
if (!qualExists) {
  await AuditorQualification.create({
    auditorUserId: auditorMaria._id, tenantId,
    auditorProfileId: mariaProfile?._id,
    highestEducation: "Master of Science", fieldOfStudy: "Pharmaceutical Sciences",
    totalYearsExperience: 14, totalAuditsCompleted: 47, totalAuditsAsLead: 32,
    eligibleAsLead: true, eligibleAsCoAuditor: true, eligibleAsReviewer: true,
    qualificationStatus: "QUALIFIED", qualifiedAt: new Date("2024-01-01"),
    qualifiedBy: createdUsers["buyer.vp@acme-test.demo"]._id,
    nextReviewDue: new Date("2027-01-01"),
    languages: ["English", "Spanish", "Hindi"],
    regulatoryExpertise: ["FDA_21CFR", "EU_GMP", "ICH_Q7"],
    coiDeclarations: [{ declaredAt: new Date(), hasConflict: false, conflictDetails: "" }],
  });
  console.log(`AuditorQualification: Maria QUALIFIED`);
}

// 7. SUPPLIER PRE-QUALIFICATION (APPROVED) ────────────────────────────────
const pqExists = await SupplierPreQualification.findOne({ supplierId: supplierHead._id, tenantId: TENANT_NAME });
if (!pqExists) {
  const validUntil = new Date(); validUntil.setFullYear(validUntil.getFullYear() + 2);
  const pq = await SupplierPreQualification.create({
    tenantId: TENANT_NAME, supplierId: supplierHead._id,
    initiatedBy: createdUsers["buyer.audit@acme-test.demo"]._id,
    supplierName: "Global Pharma Test Mfg Ltd.",
    scope: "Pre-qualification of API manufacturer for Atorvastatin.",
    initialRiskBand: "MEDIUM",
    regulatoryStandards: ["ICH Q7", "21 CFR 211", "EU GMP Part II"],
    productCategories: ["API"],
    status: "APPROVED", decision: "APPROVED",
    decisionBy: auditorMaria._id, decisionAt: new Date(),
    decisionNotes: "Pre-qualification approved. Full audit recommended.",
    validUntil, submittedAt: new Date(),
  });
  console.log(`PQ: ${pq.pqNumber || pq._id}`);
}

// 8. AGENT PERMISSION POLICY ───────────────────────────────────────────────
const agentExists = await AgentPermission.findOne({ tenantId: TENANT_NAME });
if (!agentExists) {
  const fullPolicy = {
    "audit.draft_observation": { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
    "audit.report.assemble":   { allow: true, dailyQuota: 50,  monthlyQuota: 1000 },
    "audit.preaudit.prefill":  { allow: true, dailyQuota: 50,  monthlyQuota: 600 },
    "audit.autofill_form":     { allow: true, dailyQuota: 100, monthlyQuota: 2000 },
    "audit.supplier_intel":    { allow: true, dailyQuota: 50,  monthlyQuota: 800 },
    "capa.draft_rca":          { allow: true, dailyQuota: 50,  monthlyQuota: 500 },
    "doc.bulk_classify":            { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
    "deviation.classify_intake":    { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
    "deviation.similar_finder":     { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
    "deviation.draft_disposition":  { allow: true, dailyQuota: 100, monthlyQuota: 2000 },
    "deviation.recommend_capa":     { allow: true, dailyQuota: 100, monthlyQuota: 2000 },
    "deviation.trend_alerter":      { allow: true, dailyQuota: 50,  monthlyQuota: 1000 },
  };
  await AgentPermission.create({
    tenantId: TENANT_NAME, defaultPolicy: "deny", laborRateUsd: 40,
    permissions: { tenant_admin: fullPolicy, buyer: fullPolicy, auditor: fullPolicy,
      supplier: { "audit.preaudit.prefill": { allow: true, dailyQuota: 30, monthlyQuota: 300 },
                  "audit.autofill_form":    { allow: true, dailyQuota: 50, monthlyQuota: 500 } } },
    tenantQuota: { monthlyTokenLimit: 10_000_000, monthlyCostLimitUsd: 500, enforcement: "soft", alertAt: [0.7, 0.9, 1.0] },
  });
  console.log(`AgentPermission policy seeded`);
}

// SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  AUDIT TEST TENANT — READY                                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tenant: ${TENANT_DISPLAY.padEnd(58)}     ║
║  Tenant ID: ${String(tenantId).padEnd(60)} ║
║  Password for ALL users: ${PASSWORD.padEnd(53)}║
║                                                                                ║
║  BUYER:                                                                        ║
║    buyer.audit@acme-test.demo      Priya Nair     (Audit Program Mgr)         ║
║    buyer.vp@acme-test.demo         Elena Vasquez  (VP Quality, tenant_admin)  ║
║                                                                                ║
║  AUDITOR (AuditCorp Test Intl):                                                ║
║    auditor.lead@acme-test.demo     Maria Santos   (Lead Auditor)              ║
║    auditor.co@acme-test.demo       Rahul Kapoor   (Co-Auditor)                ║
║                                                                                ║
║  SUPPLIER (Global Pharma Test Mfg Ltd):                                        ║
║    supplier.qa@acme-test.demo      Asha Sharma    (QA Head)                   ║
║    supplier.prod@acme-test.demo    Amit Kumar     (Production)                ║
║                                                                                ║
║  SITE: GP-TEST-001 (API · Pune)   PRODUCT: Atorvastatin Calcium               ║
║  PRE-QUAL: APPROVED · AUDITOR-QUAL: Maria QUALIFIED (no COI)                  ║
║  NO sample audits — clean slate for end-to-end testing                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

await mongoose.disconnect();
process.exit(0);
