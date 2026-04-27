/**
 * seed-audit-only-users.mjs
 *
 * Single consolidated seed for the Audit-Only module.
 *
 * Creates:
 *   - 1 BUYER tenant (Acme Pharma) with audit-only modules enabled
 *   - 3 Buyer-side personas:
 *       buyer.purchase@acme-pharma.demo   Karan Mehta    (Purchase team)
 *       audit.program@acme-pharma.demo    Priya Nair     (Audit Program Mgr)
 *       vp.quality@acme-pharma.demo       Elena Vasquez  (VP Quality, tenant_admin)
 *   - 2 Auditor personas (external auditor org):
 *       audit.lead@auditcorp.demo         Maria Santos   (Lead Auditor)
 *       auditor.co@auditcorp.demo         Rahul Kapoor   (Co-Auditor / Reviewer)
 *   - 5 Supplier personas (Global Pharma):
 *       qa.head@globalpharma.demo         Asha Sharma    (Supplier QA Head)
 *       production.mgr@globalpharma.demo  Amit Kumar     (Production)
 *       qc.lab@globalpharma.demo          Deepa Nair     (QC Lab)
 *       warehouse.mgr@globalpharma.demo   Raj Verma      (Warehouse)
 *       regulatory@globalpharma.demo      Meera Joshi    (Regulatory)
 *   - 2 Supplier sites + 3 products (Atorvastatin, Metformin, Amlodipine)
 *
 * Plus sample data for a non-empty audit register on first login:
 *   - 1 SupplierPreQualification (APPROVED, +2y validUntil)
 *   - 1 AuditorQualification with COI declaration
 *   - 4 audit-requests in DIFFERENT phases (PREP / EXECUTION / FOLLOWUP_CAPA / CLOSURE)
 *   - 2 PreAuditQuestionnaires (1 SENT for PREP audit, 1 SUBMITTED for EXECUTION audit)
 *   - 3 Capa records in NEEDS_SUPPLIER / IN_REVIEW / APPROVED states
 *   - 2 MonitoringSignals OPEN on the closed audit
 *
 * Usage:
 *   node scripts/seed-audit-only-users.mjs              # create / upsert
 *   node scripts/seed-audit-only-users.mjs --dry-run    # preview only
 *
 * Idempotent — safe to re-run.
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
import { SupplierPreQualification } from "../src/models/SupplierPreQualificationModel.js";
import { AuditorQualification } from "../src/models/AuditorQualificationModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { PreAuditQuestionnaire } from "../src/models/preAuditQuestionnaireModel.js";
import { Capa } from "../src/models/capaModel.js";
import { MonitoringSignal } from "../src/models/monitoringSignalModel.js";
import { AgentPermission } from "../src/models/agentPermissionModel.js";

const dryRun = process.argv.includes("--dry-run");
const skipSampleData = process.argv.includes("--users-only");
const PASSWORD = "AuditDemo@2026";

await mongoose.connect(process.env.MONGO_URI);
console.log("DB:", mongoose.connection.db.databaseName, dryRun ? "(DRY RUN)" : "(LIVE)");

const hash = await bcrypt.hash(PASSWORD, 10);

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT
// ═══════════════════════════════════════════════════════════════════════════════
const TENANT_NAME = "acme-pharma-audit";
const tenantData = {
  name: TENANT_NAME,
  displayName: "Acme Pharma Inc.",
  type: "BUYER",
  status: "ACTIVE",
};

// ═══════════════════════════════════════════════════════════════════════════════
// USERS — aligned with audit-only-feature-guide.mjs personas
// ═══════════════════════════════════════════════════════════════════════════════
const USERS = [
  // ── Buyer side ────────────────────────────────────────────────────────────
  {
    email: "buyer.purchase@acme-pharma.demo",
    role: "buyer",
    adminScope: "NONE",
    firstName: "Karan",
    lastName: "Mehta",
    department: "Purchase / SCM",
    profile: "buyer",
    profileData: {
      title: "Mr", firstName: "Karan", lastName: "Mehta",
      countryCode: "+1", phone: 5551001100,
      companyName: "Acme Pharma Inc.",
      addressline1: "100 Pharma Drive", city: "Boston", state: "Massachusetts",
      country: "USA", zipcode: "02101",
      isProfileCompleted: true,
    },
  },
  {
    email: "audit.program@acme-pharma.demo",
    role: "buyer",
    adminScope: "NONE",
    firstName: "Priya",
    lastName: "Nair",
    department: "Quality Assurance — Audit Programme",
    profile: "buyer",
    profileData: {
      title: "Ms", firstName: "Priya", lastName: "Nair",
      countryCode: "+1", phone: 5551001200,
      companyName: "Acme Pharma Inc.",
      addressline1: "100 Pharma Drive", city: "Boston", state: "Massachusetts",
      country: "USA", zipcode: "02101",
      isProfileCompleted: true,
    },
  },
  {
    email: "vp.quality@acme-pharma.demo",
    role: "buyer",
    adminScope: "TENANT",
    firstName: "Elena",
    lastName: "Vasquez",
    department: "Quality Assurance — Leadership",
    profile: "buyer",
    profileData: {
      title: "Dr", firstName: "Elena", lastName: "Vasquez",
      countryCode: "+1", phone: 5551001300,
      companyName: "Acme Pharma Inc.",
      addressline1: "100 Pharma Drive", city: "Boston", state: "Massachusetts",
      country: "USA", zipcode: "02101",
      isProfileCompleted: true,
    },
  },

  // ── Auditor side (3rd-party auditor org) ──────────────────────────────────
  {
    email: "audit.lead@auditcorp.demo",
    role: "auditor",
    adminScope: "NONE",
    firstName: "Maria",
    lastName: "Santos",
    profile: "auditor",
    profileData: {
      title: "Ms", firstName: "Maria", lastName: "Santos",
      countryCode: "+34", phone: 600100100,
      companyName: "AuditCorp International",
      addressline1: "42 Audit Lane", city: "Madrid", state: "Madrid",
      country: "Spain", zipcode: "28001",
      isProfileCompleted: true,
    },
  },
  {
    email: "auditor.co@auditcorp.demo",
    role: "auditor",
    adminScope: "NONE",
    firstName: "Rahul",
    lastName: "Kapoor",
    profile: "auditor",
    profileData: {
      title: "Mr", firstName: "Rahul", lastName: "Kapoor",
      countryCode: "+91", phone: 9876543220,
      companyName: "AuditCorp International",
      addressline1: "42 Audit Lane", city: "Mumbai", state: "Maharashtra",
      country: "India", zipcode: "400001",
      isProfileCompleted: true,
    },
  },

  // ── Supplier side (Global Pharma Mfg Ltd) ─────────────────────────────────
  {
    email: "qa.head@globalpharma.demo",
    role: "supplier",
    adminScope: "NONE",
    firstName: "Asha",
    lastName: "Sharma",
    department: "Quality Assurance",
    profile: "supplier",
    profileData: {
      title: "Ms", firstName: "Asha", lastName: "Sharma",
      countryCode: "+91", phone: 9876500001,
      companyName: "Global Pharma Manufacturing Ltd.",
      addressline1: "Plot 45, MIDC Industrial Area", city: "Pune", state: "Maharashtra",
      country: "India", zipcode: "411018",
      isProfileCompleted: true,
    },
  },
  { email: "production.mgr@globalpharma.demo", role: "supplierUser", adminScope: "NONE",
    firstName: "Amit",  lastName: "Kumar",  department: "Production",            profile: null },
  { email: "qc.lab@globalpharma.demo",         role: "supplierUser", adminScope: "NONE",
    firstName: "Deepa", lastName: "Nair",   department: "Quality Control Lab",   profile: null },
  { email: "warehouse.mgr@globalpharma.demo",  role: "supplierUser", adminScope: "NONE",
    firstName: "Raj",   lastName: "Verma",  department: "Warehouse & Storage",   profile: null },
  { email: "regulatory@globalpharma.demo",     role: "supplierUser", adminScope: "NONE",
    firstName: "Meera", lastName: "Joshi",  department: "Regulatory Affairs",    profile: null },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER PRODUCTS + SITES
// ═══════════════════════════════════════════════════════════════════════════════
const PRODUCTS = [
  { name: "Atorvastatin Calcium",   casNumber: "134523-00-5", description: "HMG-CoA reductase inhibitor API", apiTechnology: "Synthetic", dosageForm: "Tablet" },
  { name: "Metformin Hydrochloride", casNumber: "1115-70-4",   description: "Biguanide antidiabetic API",       apiTechnology: "Synthetic", dosageForm: "Tablet" },
  { name: "Amlodipine Besylate",     casNumber: "111470-99-6", description: "Calcium channel blocker API",      apiTechnology: "Synthetic", dosageForm: "Tablet" },
];

const SITES = [
  { site_name: "Global Pharma Plant 1 — API Manufacturing", address_line1: "Plot 45, MIDC Phase II", city: "Pune", state: "Maharashtra", country: "India", zipcode: "411018", plant_id: "GP-PLANT-001", gmp_audited: true },
  { site_name: "Global Pharma Plant 2 — Formulation",       address_line1: "Survey No 128, Taloja MIDC", city: "Navi Mumbai", state: "Maharashtra", country: "India", zipcode: "410208", plant_id: "GP-PLANT-002", gmp_audited: true },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DRY RUN OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════
if (dryRun) {
  console.log("\n=== DRY RUN — No changes ===\n");
  console.log(`Tenant: ${tenantData.displayName} (${TENANT_NAME})`);
  console.log(`Password for all users: ${PASSWORD}\n`);
  console.log("Users:");
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(40)} ${u.role.padEnd(14)} ${u.firstName} ${u.lastName}${u.department ? ` (${u.department})` : ''}`);
  }
  console.log(`\nProducts: ${PRODUCTS.map(p => p.name).join(', ')}`);
  console.log(`Sites: ${SITES.map(s => s.site_name).join(', ')}`);
  console.log(`\nSample data: ${skipSampleData ? "SKIPPED (--users-only)" : "1 PQ · 1 AuditorQual w/COI · 4 audits (PREP/EXEC/CAPA/CLOSED) · 2 PreAuditQ · 3 CAPAs · 2 MonitoringSignals"}`);
  console.log(`\nModules enabled: AUDIT_MANAGEMENT, SUPPLIER_QUALITY, CAPA_MANAGEMENT, REGULATORY_INTEL, AI_ASSISTANT, RFQ_PROCUREMENT`);
  await mongoose.disconnect();
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE TENANT
// ═══════════════════════════════════════════════════════════════════════════════
let tenant = await Tenant.findOne({ name: TENANT_NAME });
if (tenant) {
  console.log(`Tenant exists: ${tenant._id}`);
} else {
  tenant = await Tenant.create(tenantData);
  console.log(`Created tenant: ${tenant._id} (${tenant.displayName})`);
}
const tenantId = tenant._id;
const tenantOrgKey = TENANT_NAME; // string-key used by V1 tenantOrgId fields

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE USERS + PROFILES
// ═══════════════════════════════════════════════════════════════════════════════
const createdUsers = {};

for (const u of USERS) {
  let user = await User.findOne({ email: u.email });
  if (user) {
    // Refresh password + role + tenant binding to make re-runs forgiving.
    user.password = hash;
    user.role = u.role;
    user.tenant_id = tenantId;
    user.adminScope = u.adminScope;
    user.status = "ACTIVE";
    user.isEmailVerified = true;
    user.firstName = u.firstName;
    user.lastName = u.lastName;
    await user.save();
    console.log(`User refreshed: ${u.email} (${user._id})`);
  } else {
    user = await User.create({
      email: u.email,
      password: hash,
      role: u.role,
      tenant_id: tenantId,
      adminScope: u.adminScope,
      status: "ACTIVE",
      isEmailVerified: true,
      firstName: u.firstName,
      lastName: u.lastName,
      permissions: [],
      ...(u.role === "supplierUser" ? { invitedBy: null } : {}),
    });
    console.log(`Created user: ${u.email} (${user._id}) [${u.role}]`);
  }
  createdUsers[u.email] = user;

  if (u.profile === "buyer") {
    const exists = await BuyerProfile.findOne({ user_id: user._id });
    if (!exists) {
      await BuyerProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  -> buyer profile`);
    }
  } else if (u.profile === "supplier") {
    const exists = await SupplierProfile.findOne({ user_id: user._id });
    if (!exists) {
      await SupplierProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  -> supplier profile`);
    }
  } else if (u.profile === "auditor") {
    const exists = await AuditorProfile.findOne({ user_id: user._id });
    if (!exists) {
      await AuditorProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  -> auditor profile`);
    }
  }
}

// Link supplierUser rows to the supplier QA head
const supplierHead = createdUsers["qa.head@globalpharma.demo"];
for (const u of USERS) {
  if (u.role !== "supplierUser") continue;
  const usr = createdUsers[u.email];
  if (!usr.invitedBy) {
    usr.invitedBy = supplierHead._id;
    await usr.save();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER SITES + PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════
const siteDocs = {};
const productDocs = {};
for (const site of SITES) {
  let s = await SupplierSite.findOne({ plant_id: site.plant_id, user_id: supplierHead._id });
  if (!s) {
    s = await SupplierSite.create({
      ...site,
      tenant_id: tenantId,
      user_id: supplierHead._id,
      contact_person_title: "Ms",
      contact_person_fname: "Asha",
      contact_person_lname: "Sharma",
      contact_email: supplierHead.email,
      contact_phone_countryCode: "+91",
      contact_phone: "9876500001",
    });
    console.log(`Created site: ${s.site_name} (${s._id})`);
  }
  siteDocs[site.plant_id] = s;

  for (const prod of PRODUCTS) {
    // casNumber is uniquely indexed — reuse any pre-existing row before trying to create.
    let p = await SupplierMasterProducts.findOne({ casNumber: prod.casNumber });
    if (!p) {
      p = await SupplierMasterProducts.create({ ...prod, plant_id: site.plant_id });
      console.log(`  product: ${p.name} (${p._id})`);
    }
    productDocs[`${site.plant_id}::${prod.name}`] = p;
    let mapping = await ProductSiteMappings.findOne({ user_id: supplierHead._id, site_id: s._id, product_id: p._id });
    if (!mapping) {
      try {
        await ProductSiteMappings.create({ user_id: supplierHead._id, site_id: s._id, product_id: p._id });
      } catch (e) {
        if (e?.code !== 11000) throw e; // tolerate the unique-index collision on (user_id, site_id, apiMasterId:null)
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE CONFIG (audit-only)
// ═══════════════════════════════════════════════════════════════════════════════
try {
  await ModuleConfig.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        industryProfile: "PHARMA_GMP",
        modules: {
          AUDIT_MANAGEMENT:    { enabled: true },
          SUPPLIER_QUALITY:    { enabled: true },
          CAPA_MANAGEMENT:     { enabled: true },
          REGULATORY_INTEL:    { enabled: true },
          AI_ASSISTANT:        { enabled: true },
          RFQ_PROCUREMENT:     { enabled: true },
          DOCUMENT_CONTROL:    { enabled: false },
          CHANGE_CONTROL:      { enabled: false },
          EVENT_MANAGEMENT:    { enabled: false },
          TRAINING_MANAGEMENT: { enabled: false },
          RISK_MANAGEMENT:     { enabled: false },
          MANAGEMENT_REVIEW:   { enabled: false },
          ASSET_MANAGEMENT:    { enabled: false },
          CHAIN_OF_CUSTODY:    { enabled: false },
          TRANSACTION_REVIEW:  { enabled: false },
        },
        vocabularyOverrides: {
          audit: "GMP Audit", finding: "Deficiency", capa: "CAPA", report: "Audit Report",
        },
      },
    },
    { upsert: true, new: true }
  );
  console.log(`Module config set: Audit-only (6 modules enabled)`);
} catch (e) {
  console.log(`Module config: skipped (${e.message})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE DATA — only if not --users-only
// ═══════════════════════════════════════════════════════════════════════════════
if (!skipSampleData) {
  console.log("\n--- Sample data ---");

  const buyerKaran  = createdUsers["buyer.purchase@acme-pharma.demo"];
  const buyerPriya  = createdUsers["audit.program@acme-pharma.demo"];
  const buyerElena  = createdUsers["vp.quality@acme-pharma.demo"];
  const auditorMaria = createdUsers["audit.lead@auditcorp.demo"];
  const auditorRahul = createdUsers["auditor.co@auditcorp.demo"];

  const apiSite     = siteDocs["GP-PLANT-001"];
  const formSite    = siteDocs["GP-PLANT-002"];
  const atorvastatin = productDocs["GP-PLANT-001::Atorvastatin Calcium"];
  const metformin    = productDocs["GP-PLANT-001::Metformin Hydrochloride"];
  const amlodipine   = productDocs["GP-PLANT-001::Amlodipine Besylate"];

  // ── 1. SupplierPreQualification (APPROVED) ─────────────────────────────
  try {
    const PreQ = SupplierPreQualification;
    const pqExists = await PreQ.findOne({ supplierId: supplierHead._id, tenantId: tenantOrgKey });
    if (!pqExists) {
      const validUntil = new Date(); validUntil.setFullYear(validUntil.getFullYear() + 2);
      const pq = await PreQ.create({
        tenantId: tenantOrgKey,
        supplierId: supplierHead._id,
        initiatedBy: buyerPriya._id,
        supplierName: "Global Pharma Manufacturing Ltd.",
        scope: "Pre-qualification of API manufacturer for Atorvastatin / Metformin / Amlodipine.",
        initialRiskBand: "MEDIUM",
        regulatoryStandards: ["ICH Q7", "21 CFR 211", "EU GMP Part II"],
        productCategories: ["API", "Raw material"],
        status: "APPROVED",
        decision: "APPROVED",
        decisionBy: auditorMaria._id,
        decisionAt: new Date(Date.now() - 60 * 86400000),
        decisionNotes: "Pre-qualification approved. Facility meets baseline standards. Full audit recommended.",
        validUntil,
        submittedAt: new Date(Date.now() - 75 * 86400000),
      });
      console.log(`  PQ: ${pq.pqNumber || pq._id}`);
    } else {
      console.log(`  PQ exists (${pqExists.pqNumber || pqExists._id})`);
    }
  } catch (e) {
    console.log(`  PQ: skipped (${e.message})`);
  }

  // ── 2. AuditorQualification with COI ──────────────────────────────────
  try {
    const AuditorQual = AuditorQualification;
    const exists = await AuditorQual.findOne({ auditorUserId: auditorMaria._id });
    if (!exists) {
      const auditorProfile = await AuditorProfile.findOne({ user_id: auditorMaria._id });
      await AuditorQual.create({
        auditorUserId: auditorMaria._id,
        tenantId,
        auditorProfileId: auditorProfile?._id,
        highestEducation: "Master of Science",
        fieldOfStudy: "Pharmaceutical Sciences",
        totalYearsExperience: 14,
        totalAuditsCompleted: 47,
        totalAuditsAsLead: 32,
        eligibleAsLead: true,
        eligibleAsCoAuditor: true,
        eligibleAsReviewer: true,
        qualificationStatus: "QUALIFIED",
        qualifiedAt: new Date("2023-06-01"),
        qualifiedBy: buyerElena._id,
        nextReviewDue: new Date("2026-06-01"),
        languages: ["English", "Spanish", "Hindi"],
        regulatoryExpertise: ["FDA_21CFR", "EU_GMP", "ICH_Q7", "WHO_GMP", "PIC_S"],
        coiDeclarations: [
          { declaredAt: new Date(), hasConflict: false, conflictDetails: "" },
        ],
      });
      console.log(`  AuditorQualification (Maria) + COI declaration`);
    } else {
      console.log(`  AuditorQualification exists`);
    }
  } catch (e) {
    console.log(`  AuditorQualification: skipped (${e.message})`);
  }

  // ── 3. AuditRequestMaster — 4 sample audits in different phases ───────
  let prepAudit, execAudit, capaAudit, closedAudit;
  try {
    const AuditMaster = AuditRequestMaster;

    const buildPhases = (currentPhase) => {
      const phases = ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"];
      const idx = phases.indexOf(currentPhase);
      const map = {};
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        if (i < idx)        map[phase] = { status: "COMPLETED",  startedAt: new Date(Date.now() - (90 - i*10) * 86400000), completedAt: new Date(Date.now() - (80 - i*10) * 86400000), ownerRole: "auditor" };
        else if (i === idx) map[phase] = { status: "IN_PROGRESS", startedAt: new Date(Date.now() - 5 * 86400000), completedAt: null, ownerRole: "auditor" };
        else                map[phase] = { status: "NOT_STARTED", startedAt: null, completedAt: null, ownerRole: "auditor" };
      }
      // SURVEILLANCE is always NOT_STARTED for these samples
      map.SURVEILLANCE = { status: "NOT_STARTED", startedAt: null, completedAt: null, ownerRole: "auditor" };
      return { currentPhase, phases: map };
    };

    const baseAudit = (overrides) => ({
      supplier_id: supplierHead._id,
      create_by_buyer_id: buyerPriya._id,
      auditor_id: auditorMaria._id,
      site_id: apiSite._id,
      supplier_product_id: atorvastatin._id,
      complianceDate: new Date(Date.now() + 30 * 86400000),
      tenantOrgId: tenantOrgKey,
      auditorDecision: "ACCEPTED",
      supplierDecision: "ACCEPTED",
      complianceStatus: "non-complient",
      ...overrides,
    });

    const probe = async (filter) => AuditMaster.findOne(filter);

    // Distinct sequences avoid the (supplier_id, supplierSequence) compound-unique-index collision on null.
    // PREP — supplier just received pre-audit questionnaire
    prepAudit = await probe({ tenantOrgId: tenantOrgKey, "phaseState.currentPhase": "PREP", supplier_product_id: atorvastatin._id });
    if (!prepAudit) {
      prepAudit = await AuditMaster.create(baseAudit({
        supplierSequence: 9001, supplierRequestId: "AUDIT-DEMO-9001",
        questionnaireStatus: "sent_to_supplier",
        trackStatus: "Awaiting Pre-Audit Questionnaire",
        phaseState: buildPhases("PREP"),
      }));
      console.log(`  Audit (PREP): ${prepAudit._id}`);
    } else {
      console.log(`  Audit (PREP) exists`);
    }

    // EXECUTION — auditor doing onsite audit now
    execAudit = await probe({ tenantOrgId: tenantOrgKey, "phaseState.currentPhase": "EXECUTION", supplier_product_id: metformin._id });
    if (!execAudit) {
      execAudit = await AuditMaster.create(baseAudit({
        supplierSequence: 9002, supplierRequestId: "AUDIT-DEMO-9002",
        supplier_product_id: metformin._id,
        questionnaireStatus: "review_completed",
        trackStatus: "On-site Audit in Progress",
        phaseState: buildPhases("EXECUTION"),
      }));
      console.log(`  Audit (EXECUTION): ${execAudit._id}`);
    } else {
      console.log(`  Audit (EXECUTION) exists`);
    }

    // FOLLOWUP_CAPA — supplier responding to findings
    capaAudit = await probe({ tenantOrgId: tenantOrgKey, "phaseState.currentPhase": "CAPA", supplier_product_id: amlodipine._id });
    if (!capaAudit) {
      capaAudit = await AuditMaster.create(baseAudit({
        supplierSequence: 9003, supplierRequestId: "AUDIT-DEMO-9003",
        supplier_product_id: amlodipine._id,
        questionnaireStatus: "auditor_submitted",
        trackStatus: "CAPA Submission Awaited",
        phaseState: buildPhases("CAPA"),
      }));
      console.log(`  Audit (CAPA): ${capaAudit._id}`);
    } else {
      console.log(`  Audit (CAPA) exists`);
    }

    // CLOSURE — closed, on monitoring (formulation site)
    closedAudit = await probe({ tenantOrgId: tenantOrgKey, "phaseState.currentPhase": "CLOSURE", site_id: formSite._id });
    if (!closedAudit) {
      const closedPhases = buildPhases("CLOSURE");
      closedPhases.phases.CLOSURE = { status: "COMPLETED", startedAt: new Date(Date.now() - 30 * 86400000), completedAt: new Date(Date.now() - 20 * 86400000), ownerRole: "buyer" };
      closedAudit = await AuditMaster.create(baseAudit({
        supplierSequence: 9004, supplierRequestId: "AUDIT-DEMO-9004",
        site_id: formSite._id,
        supplier_product_id: atorvastatin._id,
        questionnaireStatus: "auditor_submitted",
        trackStatus: "Audit Closed",
        complianceStatus: "complient",
        facilityOutcome: "SATISFACTORY",
        facilityOutcomeSetAt: new Date(Date.now() - 20 * 86400000),
        facilityOutcomeSetBy: auditorMaria._id,
        high_status: 5,
        phaseState: closedPhases,
      }));
      console.log(`  Audit (CLOSED): ${closedAudit._id}`);
    } else {
      console.log(`  Audit (CLOSED) exists`);
    }
  } catch (e) {
    console.log(`  Audits: skipped (${e.message})`);
  }

  // ── 4. PreAuditQuestionnaire (SENT for PREP, SUBMITTED for EXECUTION) ─
  try {
    const PreQ = PreAuditQuestionnaire;
    if (prepAudit) {
      const exists = await PreQ.findOne({ auditId: prepAudit._id });
      if (!exists) {
        await PreQ.create({
          tenantId: tenantOrgKey, auditId: prepAudit._id, status: "SENT",
          templateId: 1, sentAt: new Date(Date.now() - 3 * 86400000),
          responses: [], version: 1, createdBy: buyerPriya._id,
        });
        console.log(`  PreAuditQuestionnaire (PREP audit) SENT`);
      }
    }
    if (execAudit) {
      const exists = await PreQ.findOne({ auditId: execAudit._id });
      if (!exists) {
        await PreQ.create({
          tenantId: tenantOrgKey, auditId: execAudit._id, status: "SUBMITTED",
          templateId: 1,
          sentAt: new Date(Date.now() - 20 * 86400000),
          submittedAt: new Date(Date.now() - 12 * 86400000),
          submittedBy: supplierHead._id,
          responses: [], version: 1, createdBy: buyerPriya._id,
        });
        console.log(`  PreAuditQuestionnaire (EXECUTION audit) SUBMITTED`);
      }
    }
  } catch (e) {
    console.log(`  PreAuditQuestionnaire: skipped (${e.message})`);
  }

  // ── 5. CAPAs in 3 different statuses on the CAPA-phase audit ──────────
  try {
    if (capaAudit) {
      const seedCapa = async (filter, payload) => {
        const exists = await Capa.findOne(filter);
        if (exists) return exists;
        const created = await Capa.create(payload);
        console.log(`  CAPA: ${payload.title} [${payload.status}]`);
        return created;
      };

      await seedCapa(
        { auditId: capaAudit._id, title: "Implement equipment calibration schedule" },
        {
          tenantOrgId: tenantOrgKey, auditId: capaAudit._id,
          title: "Implement equipment calibration schedule",
          description: "Establish and execute annual calibration schedule for high-precision scales (Units #3 and #4). Engage approved calibration vendor.",
          severity: "critical", status: "NEEDS_SUPPLIER",
          supplierId: supplierHead._id, buyerId: buyerPriya._id, auditorId: auditorMaria._id,
          ownerId: supplierHead._id,
          targetDate: new Date(Date.now() + 30 * 86400000),
          createdBy: auditorMaria._id,
        }
      );

      await seedCapa(
        { auditId: capaAudit._id, title: "Update change control procedure" },
        {
          tenantOrgId: tenantOrgKey, auditId: capaAudit._id,
          title: "Update change control procedure",
          description: "Revise QMS-CC-2024 to include detailed impact-assessment requirements for non-routine changes to API synthesis route.",
          severity: "major", status: "IN_REVIEW",
          supplierId: supplierHead._id, buyerId: buyerPriya._id, auditorId: auditorMaria._id,
          ownerId: supplierHead._id,
          targetDate: new Date(Date.now() + 14 * 86400000),
          actions: [{
            actorId: supplierHead._id, actorRole: "supplier", visibility: "external",
            message: "Procedure revised and approved by management. Document attached.",
            createdAt: new Date(Date.now() - 1 * 86400000), attachments: [],
          }],
          createdBy: auditorMaria._id, updatedBy: supplierHead._id,
        }
      );

      await seedCapa(
        { auditId: capaAudit._id, title: "Re-train QC analysts on dissolution method" },
        {
          tenantOrgId: tenantOrgKey, auditId: capaAudit._id,
          title: "Re-train QC analysts on dissolution method",
          description: "Conduct refresher training on USP <711> dissolution methodology for all QC analysts; capture quiz score >= 80%.",
          severity: "minor", status: "APPROVED",
          supplierId: supplierHead._id, buyerId: buyerPriya._id, auditorId: auditorMaria._id,
          ownerId: supplierHead._id,
          targetDate: new Date(Date.now() - 5 * 86400000),
          closedAt: new Date(Date.now() - 2 * 86400000),
          createdBy: auditorMaria._id,
        }
      );
    }
  } catch (e) {
    console.log(`  CAPAs: skipped (${e.message})`);
  }

  // ── 6. MonitoringSignals on the closed audit's supplier ───────────────
  try {
    const Sig = MonitoringSignal;
    if (closedAudit) {
      const exists1 = await Sig.findOne({ auditId: closedAudit._id, type: "IMPORT_ALERT" });
      if (!exists1) {
        await Sig.create({
          tenantId: tenantOrgKey, auditId: closedAudit._id, siteId: formSite._id,
          source: "FDA_AUTOMATED", type: "IMPORT_ALERT",
          severity: "MEDIUM", status: "OPEN",
          payload: {
            alertId: "IA-2026-001234", country: "India",
            product: "Atorvastatin Calcium API",
            reason: "Sample monitoring signal seeded for demo.",
            issuedDate: "2026-04-15",
          },
          detectedAt: new Date(Date.now() - 7 * 86400000),
        });
        console.log(`  MonitoringSignal: IMPORT_ALERT (MEDIUM)`);
      }
      const exists2 = await Sig.findOne({ auditId: closedAudit._id, type: "FDA_WARNING_LETTER" });
      if (!exists2) {
        await Sig.create({
          tenantId: tenantOrgKey, auditId: closedAudit._id, siteId: formSite._id,
          source: "FDA_WARNING_LETTER", type: "FDA_WARNING_LETTER",
          severity: "HIGH", status: "OPEN",
          payload: {
            warningLetterId: "WL-2026-5678",
            recipientFacility: "Global Pharma Plant 2 — Formulation",
            date: "2026-03-10",
            violations: [
              "Failure to ensure batch production records meet specification (21 CFR 211.194(a)(2))",
              "Failure to establish specifications for components (21 CFR 211.86)",
            ],
          },
          detectedAt: new Date(Date.now() - 14 * 86400000),
        });
        console.log(`  MonitoringSignal: FDA_WARNING_LETTER (HIGH)`);
      }
    }
  } catch (e) {
    console.log(`  MonitoringSignals: skipped (${e.message})`);
  }

  // ── 7. AgentPermission policy — let the audit-only roles invoke AI agents ──
  try {
    const exists = await AgentPermission.findOne({ tenantId: tenantOrgKey });
    if (!exists) {
      // Generous quotas for demo; production tenants tune in Admin Panel.
      const fullAuditPolicy = {
        "audit.draft_observation":   { allow: true, dailyQuota: 200, monthlyQuota: 4000 },
        "audit.report.assemble":     { allow: true, dailyQuota: 50,  monthlyQuota: 1000 },
        "audit.preaudit.prefill":    { allow: true, dailyQuota: 50,  monthlyQuota: 600  },
        "audit.autofill_form":       { allow: true, dailyQuota: 100, monthlyQuota: 2000 },
        "audit.supplier_intel":      { allow: true, dailyQuota: 50,  monthlyQuota: 800  },
        "capa.draft_rca":            { allow: true, dailyQuota: 50,  monthlyQuota: 500  },
        "risk.scenario_brainstorm":  { allow: true, dailyQuota: 30,  monthlyQuota: 300  },
        "complaint.triage":          { allow: true, dailyQuota: 50,  monthlyQuota: 500  },
        "deviation.five_why":        { allow: true, dailyQuota: 50,  monthlyQuota: 500  },
        "change.classify_impact":    { allow: true, dailyQuota: 30,  monthlyQuota: 300  },
        "training.auto_assign":      { allow: true, dailyQuota: 30,  monthlyQuota: 300  },
        "mrm.populate_inputs":       { allow: true, dailyQuota: 10,  monthlyQuota: 100  },
      };
      const supplierPolicy = {
        "audit.preaudit.prefill":    { allow: true, dailyQuota: 30,  monthlyQuota: 300 },
        "audit.autofill_form":       { allow: true, dailyQuota: 50,  monthlyQuota: 500 },
        "capa.draft_rca":            { allow: true, dailyQuota: 30,  monthlyQuota: 300 },
      };
      await AgentPermission.create({
        tenantId: tenantOrgKey,
        defaultPolicy: "deny",
        laborRateUsd: 40,
        permissions: {
          tenant_admin: fullAuditPolicy,
          buyer:        fullAuditPolicy,
          buyer_admin:  fullAuditPolicy,
          auditor:      fullAuditPolicy,
          auditor_lead: fullAuditPolicy,
          supplier:     supplierPolicy,
          supplierUser: supplierPolicy,
        },
        tenantQuota: {
          monthlyTokenLimit: 10_000_000,
          monthlyCostLimitUsd: 500,
          enforcement: "soft",
          alertAt: [0.7, 0.9, 1.0],
        },
      });
      console.log(`  AgentPermission policy seeded (audit-only tenant · deny default · 7 roles configured)`);
    } else {
      console.log(`  AgentPermission policy exists`);
    }
  } catch (e) {
    console.log(`  AgentPermission: skipped (${e.message})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  AUDIT-ONLY DEMO — READY                                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Tenant: Acme Pharma Inc. (${String(tenantId).slice(0,24)})                  ║
║  Password for ALL users: ${PASSWORD}                                         ║
║                                                                              ║
║  BUYER (Acme Pharma):                                                        ║
║    buyer.purchase@acme-pharma.demo    Karan Mehta    (Purchase / SCM)        ║
║    audit.program@acme-pharma.demo     Priya Nair     (Audit Program Mgr)     ║
║    vp.quality@acme-pharma.demo        Dr Elena Vasquez (VP Quality, admin)   ║
║                                                                              ║
║  AUDITOR (AuditCorp Intl):                                                   ║
║    audit.lead@auditcorp.demo          Maria Santos   (Lead Auditor)          ║
║    auditor.co@auditcorp.demo          Rahul Kapoor   (Co-Auditor / Reviewer) ║
║                                                                              ║
║  SUPPLIER (Global Pharma Mfg Ltd):                                           ║
║    qa.head@globalpharma.demo          Asha Sharma    (QA Head)               ║
║    production.mgr@globalpharma.demo   Amit Kumar     (Production)            ║
║    qc.lab@globalpharma.demo           Deepa Nair     (QC Lab)                ║
║    warehouse.mgr@globalpharma.demo    Raj Verma      (Warehouse)             ║
║    regulatory@globalpharma.demo       Meera Joshi    (Regulatory)            ║
║                                                                              ║
║  SUPPLIER SITES: GP-PLANT-001 (API · Pune) · GP-PLANT-002 (Formulation)      ║
║  PRODUCTS: Atorvastatin Calcium · Metformin HCl · Amlodipine Besylate        ║
║                                                                              ║
║  MODULES: Audit · Supplier Quality · CAPA · Reg Intel · AI · RFQ             ║
║                                                                              ║
║  SAMPLE DATA${skipSampleData ? " (SKIPPED)" : ""}:                                                    ║
║    1 PQ APPROVED · 1 AuditorQual w/COI                                       ║
║    4 audits: PREP · EXECUTION · FOLLOWUP_CAPA · CLOSED                       ║
║    2 PreAuditQ (SENT, SUBMITTED) · 3 CAPAs (NEEDS_SUPPLIER, IN_REVIEW, APPR) ║
║    2 MonitoringSignals (IMPORT_ALERT MEDIUM, WARNING_LETTER HIGH)            ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

await mongoose.disconnect();
