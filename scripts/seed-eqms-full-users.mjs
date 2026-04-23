/**
 * seed-eqms-full-users.mjs
 *
 * Creates a PHARMA-MANUFACTURING tenant with:
 *   - ALL 15 EQMS modules enabled (incl. Deviations, Doc Control, Change Control,
 *     Training, Risk, Management Review, Asset Mgmt, CAPA, Supplier Quality,
 *     Audit Management for INTERNAL audits, Regulatory Intel, AI Assistant, RFQ,
 *     Chain of Custody, Transaction Review)
 *   - 10 persona users spanning QA leadership, EQMS specialists, internal audit,
 *     and auditee departments (Production, QC Lab, Maintenance)
 *   - 2 internal sites + 2 internal products so audit/CAPA/deviation records
 *     have something to reference
 *
 * Internal-audit workflow mapping (existing buyer/supplier/auditor roles reused):
 *   - buyer         → Internal Audit Program Manager (initiates internal audits)
 *   - auditor       → Internal Auditor (executes)
 *   - supplier      → Auditee Department Head (accepts + fans out sections)
 *   - supplierUser  → Auditee dept team members (respond to sections)
 *   - admin         → Head of QA (operational admin, approves CAPA/deviations)
 *   - tenant_admin  → VP of Quality (tenant owner, MRM chair, top approver)
 *   - user          → EQMS specialists (doc control, training, QA analyst)
 *
 * Usage:
 *   node scripts/seed-eqms-full-users.mjs              # create users + tenant
 *   node scripts/seed-eqms-full-users.mjs --dry-run    # preview only
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
// Explicit import so mongoose.model("ModuleConfig") resolves when we flip modules:
import ModuleConfig from "../src/models/moduleConfigModel.js";

const dryRun = process.argv.includes("--dry-run");
const PASSWORD = process.env.SEED_EQMS_PASSWORD || "EqmsDemo@2026";

await mongoose.connect(process.env.MONGO_URI);
console.log("DB:", mongoose.connection.db.databaseName, dryRun ? "(DRY RUN)" : "(LIVE)");

const hash = await bcrypt.hash(PASSWORD, 10);

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT — full-EQMS pharma manufacturer, tenant type INTERNAL
// ═══════════════════════════════════════════════════════════════════════════════
const TENANT_NAME = "novex-pharma-eqms";

const tenantData = {
  name: TENANT_NAME,
  displayName: "Novex Pharma Inc.",
  type: "INTERNAL",
  status: "ACTIVE",
  branding: { primaryColor: "#2563eb" },
  plan: "ADVANCED",
};

// ═══════════════════════════════════════════════════════════════════════════════
// USERS — 10 personas covering every EQMS workflow
// ═══════════════════════════════════════════════════════════════════════════════
const USERS = [
  // ── QA Leadership ─────────────────────────────────────────────────────────
  {
    email: "vp.quality@novex-pharma.demo",
    role: "tenant_admin",
    adminScope: "TENANT",
    firstName: "Elena",
    lastName: "Vasquez",
    title: "Dr",
    department: "Quality Assurance",
    jobTitle: "VP of Quality",
    profile: null,
    purpose:
      "Tenant owner · Management Review chair · final approver for high-risk CAPAs, change controls and audit reports",
  },
  {
    email: "qa.head@novex-pharma.demo",
    role: "admin",
    adminScope: "TENANT",
    firstName: "James",
    lastName: "Thompson",
    title: "Mr",
    department: "Quality Assurance",
    jobTitle: "Head of QA",
    profile: null,
    purpose:
      "Operational QMS admin · deviation/CAPA approver · doc-control approver · batch release",
  },

  // ── EQMS Specialists ──────────────────────────────────────────────────────
  {
    email: "qa.specialist@novex-pharma.demo",
    role: "user",
    adminScope: "NONE",
    firstName: "Kenji",
    lastName: "Tanaka",
    title: "Mr",
    department: "Quality Assurance",
    jobTitle: "Senior QA Specialist",
    profile: null,
    purpose:
      "Deviation investigator · CAPA owner · risk assessor · root-cause analysis",
  },
  {
    email: "doc.control@novex-pharma.demo",
    role: "user",
    adminScope: "NONE",
    firstName: "Sarah",
    lastName: "O'Brien",
    title: "Ms",
    department: "Document Control",
    jobTitle: "Document Control Officer",
    profile: null,
    purpose:
      "SOP author · change-control drafter · document versioning · training-material owner",
  },
  {
    email: "training.coord@novex-pharma.demo",
    role: "user",
    adminScope: "NONE",
    firstName: "Rebecca",
    lastName: "Kim",
    title: "Ms",
    department: "Training & Development",
    jobTitle: "Training Coordinator",
    profile: null,
    purpose:
      "Training plan owner · competency records · curricula · reads-and-understood assignments",
  },
  {
    email: "regulatory@novex-pharma.demo",
    role: "user",
    adminScope: "NONE",
    firstName: "Marcus",
    lastName: "Brown",
    title: "Mr",
    department: "Regulatory Affairs",
    jobTitle: "Regulatory Affairs Manager",
    profile: null,
    purpose:
      "Change-control regulatory impact assessor · regulatory intel consumer · submissions",
  },

  // ── Internal Audit ────────────────────────────────────────────────────────
  {
    email: "audit.lead@novex-pharma.demo",
    role: "auditor",
    adminScope: "NONE",
    firstName: "Maria",
    lastName: "Santos",
    title: "Ms",
    department: "Internal Audit",
    jobTitle: "Lead Internal Auditor",
    profile: "auditor",
    profileData: {
      title: "Ms",
      firstName: "Maria",
      lastName: "Santos",
      countryCode: "+1",
      phone: 5552003001,
      companyName: "Novex Pharma Inc.",
      addressline1: "200 Novex Way",
      city: "Cambridge",
      state: "Massachusetts",
      country: "USA",
      zipcode: "02139",
      isProfileCompleted: true,
    },
    purpose:
      "Executes internal GMP audits · issues findings · tracks CAPA linked to findings",
  },
  {
    email: "audit.program@novex-pharma.demo",
    role: "buyer",
    adminScope: "NONE",
    firstName: "Priya",
    lastName: "Nair",
    title: "Ms",
    department: "Internal Audit",
    jobTitle: "Internal Audit Program Manager",
    profile: "buyer",
    profileData: {
      title: "Ms",
      firstName: "Priya",
      lastName: "Nair",
      countryCode: "+1",
      phone: 5552003002,
      companyName: "Novex Pharma Inc.",
      addressline1: "200 Novex Way",
      city: "Cambridge",
      state: "Massachusetts",
      country: "USA",
      zipcode: "02139",
      isProfileCompleted: true,
    },
    purpose:
      "Internal audit scheduler · creates internal audit requests · assigns auditors · tracks the audit program",
  },

  // ── Auditee Departments ──────────────────────────────────────────────────
  {
    email: "production.head@novex-pharma.demo",
    role: "supplier",
    adminScope: "NONE",
    firstName: "Michael",
    lastName: "Foster",
    title: "Mr",
    department: "Production",
    jobTitle: "Head of Production",
    profile: "supplier",
    profileData: {
      title: "Mr",
      firstName: "Michael",
      lastName: "Foster",
      countryCode: "+1",
      phone: 5552004001,
      companyName: "Novex Pharma Inc. · Production",
      addressline1: "Building 2 · Production Floor",
      city: "Cambridge",
      state: "Massachusetts",
      country: "USA",
      zipcode: "02139",
      isProfileCompleted: true,
    },
    purpose:
      "Auditee head for Production internal audits · receives questionnaires · fans sections out to team · raises deviations · CAPA owner",
  },
  {
    email: "qc.lab@novex-pharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Aisha",
    lastName: "Patel",
    title: "Dr",
    department: "Quality Control Lab",
    jobTitle: "QC Lab Lead",
    profile: null,
    purpose:
      "QC auditee · OOS investigations · test-method deviations · responds to QC sections of internal audits",
  },
  {
    email: "maintenance@novex-pharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Lars",
    lastName: "Nilsson",
    title: "Mr",
    department: "Engineering & Maintenance",
    jobTitle: "Maintenance Engineer",
    profile: null,
    purpose:
      "Equipment CAPA owner · IQ/OQ/PQ records · responds to Engineering sections of internal audits · asset qualification",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL SITES + PRODUCTS — referenced by audit/deviation/CAPA records
// ═══════════════════════════════════════════════════════════════════════════════
const SITES = [
  {
    site_name: "Novex Pharma · Cambridge Manufacturing Plant",
    address_line1: "200 Novex Way · Building 2",
    city: "Cambridge",
    state: "Massachusetts",
    country: "USA",
    zipcode: "02139",
    plant_id: "NVX-MFG-001",
    gmp_audited: true,
  },
  {
    site_name: "Novex Pharma · QC Laboratory",
    address_line1: "200 Novex Way · Building 3",
    city: "Cambridge",
    state: "Massachusetts",
    country: "USA",
    zipcode: "02139",
    plant_id: "NVX-QC-001",
    gmp_audited: true,
  },
];

const PRODUCTS = [
  {
    name: "Novexolimus API",
    casNumber: "NVX-2026-01",
    description: "Immunosuppressant API (internal code)",
    apiTechnology: "Fermentation",
    dosageForm: "API",
  },
  {
    name: "Novexolimus 1 mg Tablet",
    casNumber: "NVX-2026-02",
    description: "Immunosuppressant drug product · 1 mg tablet",
    apiTechnology: "Direct compression",
    dosageForm: "Tablet",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DRY-RUN OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════
if (dryRun) {
  console.log("\n=== DRY RUN — No changes ===\n");
  console.log(`Tenant: ${tenantData.displayName} (${TENANT_NAME}, type=${tenantData.type})`);
  console.log(`Password for all users: ${PASSWORD}\n`);
  console.log("Users:");
  for (const u of USERS) {
    console.log(
      `  ${u.email.padEnd(38)} ${u.role.padEnd(14)} ${u.firstName} ${u.lastName.padEnd(12)} ${u.jobTitle}`
    );
  }
  console.log(`\nSites: ${SITES.map((s) => s.site_name).join(" · ")}`);
  console.log(`Products: ${PRODUCTS.map((p) => p.name).join(" · ")}`);
  console.log("\nAll 15 EQMS modules will be ENABLED (nothing disabled).");
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

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE USERS + PROFILES
// ═══════════════════════════════════════════════════════════════════════════════
const createdUsers = {};

for (const u of USERS) {
  let user = await User.findOne({ email: u.email });
  if (user) {
    // Keep existing doc but make sure it points at this tenant and the password
    // matches the current seed password — useful when rotating creds.
    let dirty = false;
    if (String(user.tenant_id) !== String(tenantId)) {
      user.tenant_id = tenantId;
      dirty = true;
    }
    if (user.role !== u.role) {
      user.role = u.role;
      dirty = true;
    }
    if (process.env.SEED_RESET_PASSWORDS === "true") {
      user.password = hash;
      dirty = true;
    }
    if (dirty) await user.save();
    console.log(`User exists: ${u.email} (${user._id})${dirty ? " [updated]" : ""}`);
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

  // Profile creation (buyer/supplier/auditor only; admin/user/tenant_admin have none)
  if (u.profile === "buyer") {
    const exists = await BuyerProfile.findOne({ user_id: user._id });
    if (!exists) {
      await BuyerProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → buyer profile created`);
    }
  } else if (u.profile === "supplier") {
    const exists = await SupplierProfile.findOne({ user_id: user._id });
    if (!exists) {
      await SupplierProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → supplier profile created`);
    }
  } else if (u.profile === "auditor") {
    const exists = await AuditorProfile.findOne({ user_id: user._id });
    if (!exists) {
      await AuditorProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → auditor profile created`);
    }
  }
}

// Link supplierUsers to the Production head (their "primary supplier" for the audit model)
const productionHead = createdUsers["production.head@novex-pharma.demo"];
for (const u of USERS) {
  if (u.role !== "supplierUser") continue;
  const user = createdUsers[u.email];
  if (!user.invitedBy || String(user.invitedBy) !== String(productionHead._id)) {
    user.invitedBy = productionHead._id;
    await user.save();
    console.log(`  → linked ${u.email} under production head`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SITES + PRODUCTS — attached to the Production head user so internal-audit
// records can reference them through the existing supplier-product-site model.
// ═══════════════════════════════════════════════════════════════════════════════
for (const site of SITES) {
  let s = await SupplierSite.findOne({ plant_id: site.plant_id, user_id: productionHead._id });
  if (!s) {
    s = await SupplierSite.create({
      ...site,
      tenant_id: tenantId,
      user_id: productionHead._id,
      contact_person_title: "Mr",
      contact_person_fname: "Michael",
      contact_person_lname: "Foster",
      contact_email: productionHead.email,
      contact_phone_countryCode: "+1",
      contact_phone: "5552004001",
    });
    console.log(`Created site: ${s.site_name}`);
  }

  for (const prod of PRODUCTS) {
    // supplier-master-products.casNumber has a GLOBAL unique index, so a
    // product with the same casNumber cannot be created twice even under a
    // different plant_id. Find by casNumber; only create once.
    let p = await SupplierMasterProducts.findOne({ casNumber: prod.casNumber });
    if (!p) {
      p = await SupplierMasterProducts.create({ ...prod, plant_id: site.plant_id });
      console.log(`  → product: ${p.name}`);
    }
    const mapping = await ProductSiteMappings.findOne({
      user_id: productionHead._id,
      site_id: s._id,
      product_id: p._id,
    });
    if (!mapping) {
      try {
        await ProductSiteMappings.create({
          user_id: productionHead._id,
          site_id: s._id,
          product_id: p._id,
          // Unique value per product so we don't collide on the sparse
          // (user_id, site_id, apiMasterId) unique index when multiple
          // products map to the same (user, site) pair.
          apiMasterId: p._id,
        });
      } catch (e) {
        if (e?.code !== 11000) throw e;
        console.log(`  → mapping for ${p.name} already exists (dup key)`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE CONFIG — ALL 15 ENABLED
// ═══════════════════════════════════════════════════════════════════════════════
const allModulesEnabled = {
  AUDIT_MANAGEMENT: { enabled: true },
  DOCUMENT_CONTROL: { enabled: true },
  CAPA_MANAGEMENT: { enabled: true },
  CHANGE_CONTROL: { enabled: true },
  EVENT_MANAGEMENT: { enabled: true },
  TRAINING_MANAGEMENT: { enabled: true },
  RISK_MANAGEMENT: { enabled: true },
  SUPPLIER_QUALITY: { enabled: true },
  MANAGEMENT_REVIEW: { enabled: true },
  ASSET_MANAGEMENT: { enabled: true },
  CHAIN_OF_CUSTODY: { enabled: true },
  TRANSACTION_REVIEW: { enabled: true },
  REGULATORY_INTEL: { enabled: true },
  AI_ASSISTANT: { enabled: true },
  RFQ_PROCUREMENT: { enabled: true },
};

await ModuleConfig.findOneAndUpdate(
  { tenantId },
  {
    $set: {
      tenantId,
      industryProfile: "PHARMA_GMP",
      modules: allModulesEnabled,
      vocabularyOverrides: {
        audit: "Internal GMP Audit",
        auditor: "Internal Auditor",
        finding: "Observation",
        capa: "CAPA",
        report: "Audit Report",
      },
      activeWorkflowKeys: [
        "INTERNAL_AUDIT",
        "DEVIATION_INVESTIGATION",
        "CAPA_LIFECYCLE",
        "CHANGE_CONTROL",
        "DOC_CONTROL_APPROVAL",
        "TRAINING_ASSIGNMENT",
        "RISK_ASSESSMENT",
        "MANAGEMENT_REVIEW",
        "ASSET_QUALIFICATION",
      ],
      complianceStandardKeys: ["ICH_Q7", "ICH_Q10", "FDA_21_CFR_210_211", "EU_GMP_ANNEX_11", "ISO_9001"],
    },
  },
  { upsert: true, new: true }
);
console.log(`\nModule config set: ALL 15 EQMS modules enabled · PHARMA_GMP profile`);

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  NOVEX PHARMA · FULL EQMS + INTERNAL AUDIT DEMO — READY                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  Tenant: Novex Pharma Inc. (INTERNAL)                                   ║
║  Tenant ID: ${String(tenantId).padEnd(56)}║
║  Password (ALL users): ${PASSWORD.padEnd(48)}║
║                                                                          ║
║  ── QA LEADERSHIP ──────────────────────────────────────────────────   ║
║    vp.quality@novex-pharma.demo       Dr Elena Vasquez  · VP Quality    ║
║    qa.head@novex-pharma.demo          James Thompson    · Head of QA    ║
║                                                                          ║
║  ── EQMS SPECIALISTS ───────────────────────────────────────────────   ║
║    qa.specialist@novex-pharma.demo    Kenji Tanaka      · Sr QA Spec    ║
║    doc.control@novex-pharma.demo      Sarah O'Brien     · Doc Control   ║
║    training.coord@novex-pharma.demo   Rebecca Kim       · Training      ║
║    regulatory@novex-pharma.demo       Marcus Brown      · Regulatory    ║
║                                                                          ║
║  ── INTERNAL AUDIT ────────────────────────────────────────────────    ║
║    audit.program@novex-pharma.demo    Priya Nair        · Audit Prog    ║
║    audit.lead@novex-pharma.demo       Maria Santos      · Lead Auditor  ║
║                                                                          ║
║  ── AUDITEE DEPARTMENTS ────────────────────────────────────────────   ║
║    production.head@novex-pharma.demo  Michael Foster    · Production    ║
║    qc.lab@novex-pharma.demo           Aisha Patel       · QC Lab        ║
║    maintenance@novex-pharma.demo      Lars Nilsson      · Maintenance   ║
║                                                                          ║
║  SITES: Cambridge Manufacturing · QC Laboratory                         ║
║  PRODUCTS: Novexolimus API · Novexolimus 1 mg Tablet                    ║
║                                                                          ║
║  ALL 15 EQMS MODULES ENABLED:                                           ║
║    Audit Mgmt · Doc Control · CAPA · Change Control · Deviations        ║
║    Training · Risk · Supplier Quality · Management Review · Asset Mgmt  ║
║    Chain of Custody · Transaction Review · Regulatory Intel · AI · RFQ  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

await mongoose.disconnect();
