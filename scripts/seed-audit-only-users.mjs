/**
 * seed-audit-only-users.mjs
 *
 * Creates a complete audit-only tenant with:
 *   - 1 Buyer (QA Manager) — initiates audits
 *   - 1 External Auditor — conducts audits
 *   - 5 Supplier users (different departments) — respond to audits
 *   - 1 Supplier with products + sites
 *   - Tenant with ONLY audit modules enabled
 *
 * Usage:
 *   node scripts/seed-audit-only-users.mjs              # create users
 *   node scripts/seed-audit-only-users.mjs --dry-run     # preview only
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

const dryRun = process.argv.includes("--dry-run");
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
// USERS
// ═══════════════════════════════════════════════════════════════════════════════
const USERS = [
  // Buyer (QA Manager)
  {
    email: "qa.manager@acme-pharma.demo",
    role: "buyer",
    adminScope: "NONE",
    firstName: "Sarah",
    lastName: "Chen",
    profile: "buyer",
    profileData: {
      title: "Ms",
      firstName: "Sarah",
      lastName: "Chen",
      countryCode: "+1",
      phone: 5551001001,
      companyName: "Acme Pharma Inc.",
      addressline1: "100 Pharma Drive",
      city: "Boston",
      state: "Massachusetts",
      country: "USA",
      zipcode: "02101",
      isProfileCompleted: true,
    },
  },

  // External Auditor
  {
    email: "dr.patel@auditcorp.demo",
    role: "auditor",
    adminScope: "NONE",
    firstName: "Rajesh",
    lastName: "Patel",
    profile: "auditor",
    profileData: {
      title: "Dr",
      firstName: "Rajesh",
      lastName: "Patel",
      countryCode: "+91",
      phone: 9876543210,
      companyName: "AuditCorp International",
      addressline1: "42 Audit Lane",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      zipcode: "400001",
      isProfileCompleted: true,
    },
  },

  // Supplier — QA Head (primary contact)
  {
    email: "qa.head@globalpharma.demo",
    role: "supplier",
    adminScope: "NONE",
    firstName: "Priya",
    lastName: "Sharma",
    department: "Quality Assurance",
    profile: "supplier",
    profileData: {
      title: "Ms",
      firstName: "Priya",
      lastName: "Sharma",
      countryCode: "+91",
      phone: 9876500001,
      companyName: "Global Pharma Manufacturing Ltd.",
      addressline1: "Plot 45, MIDC Industrial Area",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      zipcode: "411018",
      isProfileCompleted: true,
    },
  },

  // Supplier — Production Manager
  {
    email: "production.mgr@globalpharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Amit",
    lastName: "Kumar",
    department: "Production",
    profile: null, // supplierUser — no separate profile
  },

  // Supplier — QC Lab Manager
  {
    email: "qc.lab@globalpharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Deepa",
    lastName: "Nair",
    department: "Quality Control Lab",
    profile: null,
  },

  // Supplier — Warehouse Manager
  {
    email: "warehouse.mgr@globalpharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Raj",
    lastName: "Verma",
    department: "Warehouse & Storage",
    profile: null,
  },

  // Supplier — Regulatory Affairs
  {
    email: "regulatory@globalpharma.demo",
    role: "supplierUser",
    adminScope: "NONE",
    firstName: "Meera",
    lastName: "Joshi",
    department: "Regulatory Affairs",
    profile: null,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER PRODUCTS + SITES
// ═══════════════════════════════════════════════════════════════════════════════
const PRODUCTS = [
  { name: "Atorvastatin Calcium", casNumber: "134523-00-5", description: "HMG-CoA reductase inhibitor API", apiTechnology: "Synthetic", dosageForm: "Tablet" },
  { name: "Metformin Hydrochloride", casNumber: "1115-70-4", description: "Biguanide antidiabetic API", apiTechnology: "Synthetic", dosageForm: "Tablet" },
  { name: "Amlodipine Besylate", casNumber: "111470-99-6", description: "Calcium channel blocker API", apiTechnology: "Synthetic", dosageForm: "Tablet" },
];

const SITES = [
  { site_name: "Global Pharma Plant 1 — API Manufacturing", address_line1: "Plot 45, MIDC Phase II", city: "Pune", state: "Maharashtra", country: "India", zipcode: "411018", plant_id: "GP-PLANT-001", gmp_audited: true },
  { site_name: "Global Pharma Plant 2 — Formulation", address_line1: "Survey No 128, Taloja MIDC", city: "Navi Mumbai", state: "Maharashtra", country: "India", zipcode: "410208", plant_id: "GP-PLANT-002", gmp_audited: true },
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
  console.log(`\nModules enabled: AUDIT_MANAGEMENT, SUPPLIER_QUALITY, CAPA_MANAGEMENT, REGULATORY_INTEL, AI_ASSISTANT, RFQ_PROCUREMENT`);
  console.log(`Modules disabled: DOCUMENT_CONTROL, CHANGE_CONTROL, EVENT_MANAGEMENT, TRAINING_MANAGEMENT, RISK_MANAGEMENT, MANAGEMENT_REVIEW, ASSET_MANAGEMENT`);
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
const supplierPrimaryId = null;

for (const u of USERS) {
  let user = await User.findOne({ email: u.email });
  if (user) {
    console.log(`User exists: ${u.email} (${user._id})`);
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

  // Create profile
  if (u.profile === "buyer") {
    const exists = await BuyerProfile.findOne({ user_id: user._id });
    if (!exists) {
      await BuyerProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → Created buyer profile`);
    }
  } else if (u.profile === "supplier") {
    const exists = await SupplierProfile.findOne({ user_id: user._id });
    if (!exists) {
      await SupplierProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → Created supplier profile`);
    }
  } else if (u.profile === "auditor") {
    const exists = await AuditorProfile.findOne({ user_id: user._id });
    if (!exists) {
      await AuditorProfile.create({ user_id: user._id, tenant_id: tenantId, ...u.profileData });
      console.log(`  → Created auditor profile`);
    }
  }

  // Link supplierUser to primary supplier
  if (u.role === "supplierUser" && createdUsers["qa.head@globalpharma.demo"]) {
    user.invitedBy = createdUsers["qa.head@globalpharma.demo"]._id;
    await user.save();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE SUPPLIER SITES + PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════
const supplierUser = createdUsers["qa.head@globalpharma.demo"];

for (const site of SITES) {
  let s = await SupplierSite.findOne({ plant_id: site.plant_id, user_id: supplierUser._id });
  if (!s) {
    s = await SupplierSite.create({
      ...site,
      tenant_id: tenantId,
      user_id: supplierUser._id,
      contact_person_title: "Ms",
      contact_person_fname: "Priya",
      contact_person_lname: "Sharma",
      contact_email: supplierUser.email,
      contact_phone_countryCode: "+91",
      contact_phone: "9876500001",
    });
    console.log(`Created site: ${s.site_name} (${s._id})`);
  }

  // Create products + mappings for this site
  for (const prod of PRODUCTS) {
    let p = await SupplierMasterProducts.findOne({ name: prod.name, plant_id: site.plant_id });
    if (!p) {
      p = await SupplierMasterProducts.create({ ...prod, plant_id: site.plant_id });
      console.log(`  Created product: ${p.name} (${p._id})`);
    }
    let mapping = await ProductSiteMappings.findOne({ user_id: supplierUser._id, site_id: s._id, product_id: p._id });
    if (!mapping) {
      await ProductSiteMappings.create({ user_id: supplierUser._id, site_id: s._id, product_id: p._id });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURE MODULE (audit-only)
// ═══════════════════════════════════════════════════════════════════════════════
try {
  const ModuleConfig = mongoose.model("ModuleConfig");
  await ModuleConfig.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        industryProfile: "PHARMA_GMP",
        modules: {
          AUDIT_MANAGEMENT: { enabled: true },
          SUPPLIER_QUALITY: { enabled: true },
          CAPA_MANAGEMENT: { enabled: true },
          REGULATORY_INTEL: { enabled: true },
          AI_ASSISTANT: { enabled: true },
          RFQ_PROCUREMENT: { enabled: true },
          DOCUMENT_CONTROL: { enabled: false },
          CHANGE_CONTROL: { enabled: false },
          EVENT_MANAGEMENT: { enabled: false },
          TRAINING_MANAGEMENT: { enabled: false },
          RISK_MANAGEMENT: { enabled: false },
          MANAGEMENT_REVIEW: { enabled: false },
          ASSET_MANAGEMENT: { enabled: false },
          CHAIN_OF_CUSTODY: { enabled: false },
          TRANSACTION_REVIEW: { enabled: false },
        },
        vocabularyOverrides: {
          audit: "GMP Audit",
          finding: "Deficiency",
          capa: "CAPA",
          report: "Audit Report",
        },
      },
    },
    { upsert: true, new: true }
  );
  console.log(`\nModule config set: Audit-only (6 modules enabled, 9 disabled)`);
} catch (e) {
  console.log(`\nModule config: skipped (${e.message})`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  AUDIT-ONLY DEMO USERS — READY                                     ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Tenant: Acme Pharma Inc. (${String(tenantId).slice(0,24)})            ║
║  Password for ALL users: ${PASSWORD}                            ║
║                                                                      ║
║  BUYER (QA Manager):                                                ║
║    qa.manager@acme-pharma.demo         Sarah Chen                   ║
║                                                                      ║
║  EXTERNAL AUDITOR:                                                  ║
║    dr.patel@auditcorp.demo             Dr. Rajesh Patel             ║
║                                                                      ║
║  SUPPLIER USERS (Global Pharma Manufacturing Ltd.):                 ║
║    qa.head@globalpharma.demo           Priya Sharma    (QA Head)    ║
║    production.mgr@globalpharma.demo    Amit Kumar      (Production) ║
║    qc.lab@globalpharma.demo            Deepa Nair      (QC Lab)     ║
║    warehouse.mgr@globalpharma.demo     Raj Verma       (Warehouse)  ║
║    regulatory@globalpharma.demo        Meera Joshi     (Regulatory) ║
║                                                                      ║
║  SUPPLIER SITES:                                                    ║
║    GP-PLANT-001 — API Manufacturing (Pune)                          ║
║    GP-PLANT-002 — Formulation (Navi Mumbai)                         ║
║                                                                      ║
║  PRODUCTS:                                                          ║
║    Atorvastatin Calcium · Metformin HCl · Amlodipine Besylate      ║
║                                                                      ║
║  MODULES ENABLED:                                                   ║
║    ✅ Audit Management                                               ║
║    ✅ Supplier Quality                                                ║
║    ✅ CAPA Management                                                 ║
║    ✅ Regulatory Intel (FDA)                                          ║
║    ✅ AI Assistant (AskHawk)                                          ║
║    ✅ RFQ Procurement                                                 ║
║    ❌ Document Control, Change Control, Deviations, Training,        ║
║       Equipment, Risk, Reviews, CoC, Transactions                   ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
`);

await mongoose.disconnect();
