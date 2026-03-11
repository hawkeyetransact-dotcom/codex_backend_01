import "../../src/config/loadEnv.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../../src/config/database.js";
import Tenant from "../../src/models/tenantModel.js";
import { User } from "../../src/models/userModel.js";
import { BuyerProfile } from "../../src/models/buyerProfileModel.js";
import { SupplierProfile } from "../../src/models/supplierProfileModel.js";
import { SupplierUserProfile } from "../../src/models/supplierUserProfileModel.js";
import { SupplierSite } from "../../src/models/supplierSiteDataModel.js";
import { SupplierMasterProducts } from "../../src/models/supplierMasterProductModel.js";
import { ProductSiteMappings } from "../../src/models/productSiteMappingModel.js";
import { TenantModuleConfig } from "../../src/models/tenantModuleConfigModel.js";
import { Organization } from "../../src/models/organizationModel.js";
import { OrgClaim } from "../../src/models/orgClaimModel.js";
import { OrgSite } from "../../src/models/orgSiteModel.js";
import { OrgUnit } from "../../src/models/orgUnitModel.js";
import { Engagement, EngagementParticipant } from "../../src/models/engagementModels.js";
import { QualificationCase, QualificationMethod } from "../../src/models/qualificationModels.js";
import { MarketplaceListing, OrgCatalogItem } from "../../src/models/orgDiscoveryModels.js";
import { buildDirectoryKey, normalizeOrgName } from "../../src/services/orgDirectory/orgResolutionService.js";

const PASSWORD = process.env.SEED_PERSONA_PASSWORD || "Testing@2022";
const FLAG_SETTINGS = { orgDirectory: { enabled: true }, engagements: { enabled: true }, orgMarketplace: { enabled: true }, qualificationCases: { enabled: true } };
const BUYER_ANCHOR = "buyer1@test.com";
const DR_REDDY = "supplier1@test.com";

const SUPPLIERS = [
  {
    key: "cdmo1", tenant: { name: "cdmo-01", displayName: "CDMO1", type: "SUPPLIER" },
    org: { legalName: "CDMO1", country: "India", entityTypes: ["CDMO", "MANUFACTURER"], roles: ["SUPPLIER", "BUYER", "PACKAGING_PROVIDER"], hq: { address1: "Industrial Area Phase 2", city: "Ahmedabad", state: "Gujarat", postalCode: "380001", country: "India" } },
    users: { supplier: { email: "cdmo1@test.com", title: "Mr", firstName: "CDMO1", lastName: "Supplier Admin", phone: 919811110001 }, buyer: { email: "cdmo1.buyer@test.com", title: "Mr", firstName: "CDMO1", lastName: "Procurement", phone: 919811110003 }, team: { email: "cdmo1.qa@test.com", title: "Ms", firstName: "CDMO1", lastName: "QA", phone: 919811110002 } },
    sites: [
      { legacyPlantId: "CDMO1-PKG-001", siteKey: "demo-cdmo1-packaging-plant", siteName: "CDMO1 Packaging Plant", siteType: "MANUFACTURING", gxpScopes: ["PACKAGING", "SERIALIZATION"], address1: "Plot 101, Packaging Estate", city: "Ahmedabad", state: "Gujarat", postalCode: "380001", country: "India" },
      { legacyPlantId: "CDMO1-SER-002", siteKey: "demo-cdmo1-serialization-center", siteName: "CDMO1 Serialization Center", siteType: "MANUFACTURING", gxpScopes: ["SERIALIZATION", "AGGREGATION"], address1: "Plot 102, Packaging Estate", city: "Ahmedabad", state: "Gujarat", postalCode: "380001", country: "India" }
    ],
    units: [["Packaging Operations", "DEPARTMENT", "demo-cdmo1-packaging-plant"], ["Quality Assurance", "DEPARTMENT", "demo-cdmo1-packaging-plant"], ["Procurement", "DEPARTMENT", ""]],
    products: [
      { name: "Secondary Packaging Service", casNumber: "SRV-CDMO1-PKG-001", plantId: "CDMO1-PKG-001", desc: "Secondary packaging service", tech: "Service", dosage: "NA", type: "SERVICE", role: "Packaging", catalogType: "PACKAGING", itemType: "SERVICE", visibility: "PUBLIC", gxp: ["GMP", "GDP"] },
      { name: "Serialization and Aggregation Service", casNumber: "SRV-CDMO1-SER-001", plantId: "CDMO1-SER-002", desc: "Serialization and aggregation service", tech: "Service", dosage: "NA", type: "SERVICE", role: "Packaging", catalogType: "OTHER", itemType: "CAPABILITY", visibility: "RESTRICTED", gxp: ["DATA_INTEGRITY", "SERIALIZATION"] }
    ],
    listing: { listingType: "ORG_PROFILE", visibility: "PUBLIC", status: "ACTIVE", headline: "CDMO1 packaging and serialization partner", summary: "Secondary packaging, aggregation, and serialized pack release support.", capabilityTags: ["Packaging", "Serialization", "GMP"] }
  },
  {
    key: "cdmo2", tenant: { name: "cdmo-02", displayName: "CDMO2", type: "SUPPLIER" },
    org: { legalName: "CDMO2", country: "India", entityTypes: ["CDMO", "SUPPLIER"], roles: ["SUPPLIER", "PACKAGING_COMPONENT_SUPPLIER"], hq: { address1: "Export Zone 8", city: "Vadodara", state: "Gujarat", postalCode: "390001", country: "India" } },
    users: { supplier: { email: "cdmo2@test.com", title: "Mr", firstName: "CDMO2", lastName: "Supplier Admin", phone: 919811120001 }, team: { email: "cdmo2.qa@test.com", title: "Ms", firstName: "CDMO2", lastName: "QA", phone: 919811120002 } },
    sites: [
      { legacyPlantId: "CDMO2-COMP-001", siteKey: "demo-cdmo2-components-plant", siteName: "CDMO2 Printed Components Plant", siteType: "MANUFACTURING", gxpScopes: ["PACKAGING_COMPONENTS", "PRINTING"], address1: "Plot 22, Industrial Components Park", city: "Vadodara", state: "Gujarat", postalCode: "390001", country: "India" },
      { legacyPlantId: "CDMO2-FOIL-002", siteKey: "demo-cdmo2-foil-plant", siteName: "CDMO2 Foil Conversion Plant", siteType: "MANUFACTURING", gxpScopes: ["PACKAGING_COMPONENTS", "FOIL_CONVERSION"], address1: "Plot 24, Industrial Components Park", city: "Vadodara", state: "Gujarat", postalCode: "390001", country: "India" }
    ],
    units: [["Packaging Components Operations", "DEPARTMENT", "demo-cdmo2-components-plant"], ["Quality Assurance", "DEPARTMENT", "demo-cdmo2-components-plant"]],
    products: [
      { name: "Printed Cartons Supply", casNumber: "PKG-CDMO2-CARTON-001", plantId: "CDMO2-COMP-001", desc: "Printed carton supply", tech: "Packaging", dosage: "NA", type: "PACKAGING", role: "Packaging", catalogType: "PACKAGING", itemType: "PRODUCT", visibility: "RESTRICTED", gxp: ["GMP"] },
      { name: "Blister Foil Supply", casNumber: "PKG-CDMO2-FOIL-001", plantId: "CDMO2-FOIL-002", desc: "Blister foil supply", tech: "Packaging", dosage: "NA", type: "PACKAGING", role: "Packaging", catalogType: "OTHER", itemType: "PRODUCT", visibility: "RESTRICTED", gxp: ["GMP"] }
    ],
    listing: { listingType: "SITE_CAPABILITY", visibility: "RESTRICTED", status: "ACTIVE", headline: "CDMO2 printed packaging components", summary: "Printed cartons and blister foil supply for pharma packaging lines.", capabilityTags: ["Printed Cartons", "Blister Foils", "Packaging"] }
  },
  {
    key: "contract-lab", tenant: { name: "contract-lab-01", displayName: "Contract Lab Org", type: "SUPPLIER" },
    org: { legalName: "Contract Lab Org", country: "India", entityTypes: ["CONTRACT_LAB"], roles: ["SUPPLIER", "LAB_SERVICE_PROVIDER"], hq: { address1: "Knowledge Park 4", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" } },
    users: { supplier: { email: "contractlab@test.com", title: "Dr", firstName: "Contract", lastName: "Lab Admin", phone: 919811130001 }, team: { email: "contractlab.qa@test.com", title: "Dr", firstName: "Contract", lastName: "Lab QA", phone: 919811130002 } },
    sites: [
      { legacyPlantId: "CLAB-MICRO-001", siteKey: "demo-contract-lab-analytical-campus", siteName: "Contract Lab Org Analytical Campus", siteType: "LAB", gxpScopes: ["MICROBIOLOGY", "ANALYTICAL_SERVICE"], address1: "Building 6, Knowledge Park 4", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" },
      { legacyPlantId: "CLAB-ENDO-002", siteKey: "demo-contract-lab-endotoxin-suite", siteName: "Contract Lab Org Endotoxin Suite", siteType: "LAB", gxpScopes: ["MICROBIOLOGY", "ENDOTOXIN_TESTING"], address1: "Building 7, Knowledge Park 4", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" }
    ],
    units: [["Microbiology", "DEPARTMENT", "demo-contract-lab-analytical-campus"], ["Sample Management", "DEPARTMENT", "demo-contract-lab-analytical-campus"], ["Quality Assurance", "DEPARTMENT", "demo-contract-lab-analytical-campus"]],
    products: [
      { name: "Sterility Testing Service", casNumber: "LAB-SERVICE-STERILITY-001", plantId: "CLAB-MICRO-001", desc: "Sterility testing service", tech: "Analytical", dosage: "NA", type: "SERVICE", role: "Other", catalogType: "ANALYTICAL_SERVICE", itemType: "SERVICE", visibility: "PUBLIC", gxp: ["GMP", "GLP", "MICROBIOLOGY"] },
      { name: "Endotoxin Testing Service", casNumber: "LAB-SERVICE-ENDOTOXIN-001", plantId: "CLAB-ENDO-002", desc: "Endotoxin testing service", tech: "Analytical", dosage: "NA", type: "SERVICE", role: "Other", catalogType: "OTHER", itemType: "SERVICE", visibility: "PUBLIC", gxp: ["GMP", "GLP", "MICROBIOLOGY"] }
    ],
    listing: { listingType: "SERVICE", visibility: "PUBLIC", status: "ACTIVE", headline: "Contract Lab Org microbiology services", summary: "Sterility and endotoxin testing with outsourced GMP lab support.", capabilityTags: ["Sterility", "Endotoxin", "Microbiology"] }
  }
];

const QUALS = [
  { seedKey: "buyer1-cdmo1-packaging", owner: "buyer1", buyer: "buyer1", supplier: "cdmo1", engagementKey: "buyer1-cdmo1", criticality: "HIGH", riskBand: "HIGH", status: "IN_REVIEW", decision: "CONDITIONAL", scope: { description: "Secondary packaging and serialization support for blister-packed finished products.", scopeType: "PACKAGING_SERVICE" }, approvedScope: { description: "Conditional approval pending on-site packaging audit and line-clearance verification." }, requalDueDate: "2027-03-31", methods: [["DESK_REVIEW", "COMPLETED", "Document review of packaging SOPs, serialization controls, and training matrix.", "Acceptable for pre-audit qualification review."], ["AUDIT_REQUIRED", "PLANNED", "Packaging line clearance and aggregation controls require on-site verification.", "Audit to be scheduled."]] },
  { seedKey: "buyer1-contract-lab-qualification", owner: "buyer1", buyer: "buyer1", supplier: "contract-lab", engagementKey: "buyer1-contract-lab", criticality: "HIGH", riskBand: "MEDIUM", status: "APPROVED", decision: "APPROVED", scope: { description: "Qualification for outsourced sterility and endotoxin testing services.", scopeType: "ANALYTICAL_SERVICE" }, approvedScope: { description: "Approved for sterility and endotoxin testing at the analytical campus." }, requalDueDate: "2027-09-30", methods: [["QUESTIONNAIRE", "COMPLETED", "Supplier qualification questionnaire completed with acceptable responses.", "Questionnaire satisfactory."], ["SAMPLING_VERIFICATION", "COMPLETED", "Pilot test records and reference sample handling reviewed.", "Service accepted for qualification."]] },
  { seedKey: "buyer1-drreddy-losartan-api", owner: "buyer1", buyer: "buyer1", supplier: "dr-reddy", engagementKey: "buyer1-drreddy", criticality: "CRITICAL", riskBand: "HIGH", status: "IN_REVIEW", decision: "CONDITIONAL", scope: { description: "Qualification of Losartan Potassium API supply and finished-dose backup capability.", scopeType: "API_AND_FDF" }, approvedScope: { description: "API supply under conditional approval; finished-dose capability under separate review." }, requalDueDate: "2027-06-30", methods: [["DESK_REVIEW", "COMPLETED", "API and site master documentation reviewed.", "Proceed to supplier audit."], ["AUDIT_REQUIRED", "PLANNED", "API and finished-dose controls must be verified on-site by audit.", "Audit pending."]] },
  { seedKey: "cdmo1-cdmo2-components", owner: "cdmo1", buyer: "cdmo1", supplier: "cdmo2", engagementKey: "cdmo1-cdmo2", criticality: "MEDIUM", riskBand: "MEDIUM", status: "DRAFT", decision: "PENDING", scope: { description: "Qualification of printed cartons and blister foil suppliers for packaging operations.", scopeType: "PACKAGING_COMPONENTS" }, approvedScope: { description: "" }, requalDueDate: "2027-01-31", methods: [["DESK_REVIEW", "IN_PROGRESS", "Supplier packaging component documentation under review.", ""], ["AUDIT_REQUIRED", "PLANNED", "Site audit may be needed for printed-component controls.", ""]] }
];

const upsert = (Model, filter, set, insert = {}) => Model.findOneAndUpdate(filter, { $set: set, $setOnInsert: insert }, { upsert: true, new: true });
const ensureFlags = async (tenantId) => { const cur = await TenantModuleConfig.findOne({ tenantId }); return upsert(TenantModuleConfig, { tenantId }, { tenantId, enabledModules: cur?.enabledModules?.length ? cur.enabledModules : ["cGMP"], defaultModule: cur?.defaultModule || "cGMP", productMode: cur?.productMode || "AUDIT_ONLY", entitlements: cur?.entitlements || { audit: true, qms: false, vaultLite: true, vaultFull: false }, moduleSettings: { ...(cur?.moduleSettings || {}), ...FLAG_SETTINGS } }); };
const ensureTenant = async (t) => upsert(Tenant, { name: t.name }, { displayName: t.displayName, type: t.type, status: "ACTIVE" }, { name: t.name });
const ensureUser = async ({ email, password, role, tenantId, invitedBy = null }) => { let user = await User.findOne({ email }).select("+password"); if (!user) user = new User({ email, password, role, tenant_id: tenantId, status: "ACTIVE", isEmailVerified: true, invitedBy }); else Object.assign(user, { password, role, tenant_id: tenantId, status: "ACTIVE", isEmailVerified: true, invitedBy }); await user.save(); return user; };
const ensureBuyerProfile = (u, tenantId, p, company, hq) => upsert(BuyerProfile, { user_id: u._id }, { user_id: u._id, tenant_id: tenantId, title: p.title, firstName: p.firstName, lastName: p.lastName, countryCode: "+91", phone: p.phone, companyName: company, addressline1: hq.address1, city: hq.city, state: hq.state, country: hq.country, zipcode: hq.postalCode, isProfileCompleted: true });
const ensureSupplierProfile = (u, tenantId, p, company, hq) => upsert(SupplierProfile, { user_id: u._id }, { user_id: u._id, tenant_id: tenantId, title: p.title, firstName: p.firstName, lastName: p.lastName, countryCode: "+91", phone: p.phone, companyName: company, addressline1: hq.address1, city: hq.city, state: hq.state, country: hq.country, zipcode: hq.postalCode, isProfileCompleted: true });
const ensureSupplierUserProfile = (u, p) => upsert(SupplierUserProfile, { user_id: u._id }, { user_id: u._id, title: p.title, firstName: p.firstName, lastName: p.lastName, countryCode: "+91", phone: p.phone, isProfileCompleted: true });
const ensureOrg = ({ legalName, country, roles, entityTypes, hq, actorId, seedKey }) => upsert(Organization, { directoryKey: buildDirectoryKey(legalName, country) }, { directoryKey: buildDirectoryKey(legalName, country), legalName, normalizedLegalName: normalizeOrgName(legalName), displayName: legalName, status: "ACTIVE", entityTypes, supplyChainRoles: roles, headquarters: hq, updatedBy: actorId, legacyRefs: { seedKey } }, { createdBy: actorId });
const ensureClaim = async (orgId, tenantId, actorId) => { await OrgClaim.updateMany({ tenantId, status: "ACTIVE", orgId: { $ne: orgId } }, { $set: { isPrimary: false } }); return upsert(OrgClaim, { orgId, tenantId }, { claimType: "PRIMARY", status: "ACTIVE", confidence: 1, isPrimary: true, claimedByUserId: actorId, approvedByUserId: actorId, approvedAt: new Date() }, { sourceRefs: [{ type: "demo-seed" }] }); };
const ensureLegacySite = ({ tenantId, userId, email, site }) => upsert(SupplierSite, { user_id: userId, plant_id: site.legacyPlantId }, { tenant_id: tenantId, user_id: userId, plant_id: site.legacyPlantId, site_name: site.siteName, address_line1: site.address1, city: site.city, state: site.state, country: site.country, zipcode: site.postalCode, contact_person_title: "Mr", contact_person_fname: "Site", contact_person_lname: "Lead", contact_email: email, contact_phone_countryCode: "+91", contact_phone: "9000000000", gmp_audited: true });
const ensureLegacyProduct = (p) => upsert(SupplierMasterProducts, { casNumber: p.casNumber }, { name: p.name, casNumber: p.casNumber, description: p.desc, apiTechnology: p.tech, dosageForm: p.dosage, plant_id: p.plantId, origin: "supplier_created", normalizedName: normalizeOrgName(p.name), matchConfidence: 1, needsReview: false, productType: p.type });
const ensureMapping = (userId, siteId, productId, role) => upsert(ProductSiteMappings, { user_id: userId, site_id: siteId, product_id: productId }, { user_id: userId, site_id: siteId, product_id: productId, manufacturingRole: role, visibility: "private", verificationStatus: "claimed" });
const ensureOrgSite = (orgId, s, actorId) => upsert(OrgSite, { siteKey: s.siteKey }, { siteKey: s.siteKey, orgId, siteName: s.siteName, normalizedSiteName: normalizeOrgName(s.siteName), siteType: s.siteType, status: "ACTIVE", address: { address1: s.address1, city: s.city, state: s.state, postalCode: s.postalCode, country: s.country }, gxpScopes: s.gxpScopes, updatedBy: actorId, legacyRefs: { seedKey: s.siteKey } }, { createdBy: actorId });
const ensureOrgUnit = (orgId, siteMap, [name, unitType, siteKey], actorId) => { const siteId = siteKey ? siteMap[siteKey]?._id || null : null; return upsert(OrgUnit, { orgId, name, siteId }, { orgId, name, siteId, unitType, path: [String(orgId), siteId ? String(siteId) : null, name].filter(Boolean).join("/"), status: "ACTIVE", updatedBy: actorId }, { createdBy: actorId }); };
const ensureCatalog = (orgId, siteMap, p, actorId) => {
  const linkedSiteId = siteMap[`org:${p.plantId}`]?._id || null;
  return upsert(OrgCatalogItem, { orgId, name: p.name, catalogType: p.catalogType }, { orgId, siteIds: linkedSiteId ? [linkedSiteId] : [], itemType: p.itemType, catalogType: p.catalogType, name: p.name, normalizedName: normalizeOrgName(p.name), casNumber: p.casNumber, gxpFlags: p.gxp, visibility: p.visibility, status: "ACTIVE", updatedBy: actorId }, { createdBy: actorId });
};
const ensureListing = (orgId, tenantId, l, actorId) => upsert(MarketplaceListing, { orgId, listingType: l.listingType, headline: l.headline }, { orgId, ownerTenantId: tenantId, listingType: l.listingType, visibility: l.visibility, status: l.status, headline: l.headline, summary: l.summary, capabilityTags: l.capabilityTags, updatedBy: actorId }, { createdBy: actorId });
const ensureEngagement = async ({ ownerTenantId, buyerOrgId, supplierOrgId, seedKey, actorId, siteIds, description, classification = "shared", externalAuditorAllowed = true }) => {
  const engagement = await upsert(Engagement, { ownerTenantId, buyerOrgId, supplierOrgId }, { ownerTenantId, buyerOrgId, supplierOrgId, status: "ACTIVE", scope: { description, qualificationRequired: true, siteIds }, visibilityPolicy: { defaultClassification: classification, externalAuditorAllowed }, startDate: new Date("2026-01-01"), updatedBy: actorId, legacyRefs: { seedKey } }, { engagementCode: `ENG-DEMO-${seedKey.toUpperCase()}`, createdBy: actorId });
  await upsert(EngagementParticipant, { engagementId: engagement._id, participantType: "TENANT", tenantId: ownerTenantId, orgId: buyerOrgId, role: "BUYER_OWNER" }, { engagementId: engagement._id, participantType: "TENANT", tenantId: ownerTenantId, orgId: buyerOrgId, role: "BUYER_OWNER", permissions: ["manage", "read", "write"], status: "ACTIVE", updatedBy: actorId }, { createdBy: actorId });
  await upsert(EngagementParticipant, { engagementId: engagement._id, participantType: "ORG", orgId: supplierOrgId, role: "SUPPLIER_OWNER" }, { engagementId: engagement._id, participantType: "ORG", orgId: supplierOrgId, role: "SUPPLIER_OWNER", permissions: ["read"], status: "ACTIVE", updatedBy: actorId }, { createdBy: actorId });
  return engagement;
};
const ensureQual = async ({ q, ownerTenantId, buyerOrgId, supplierOrgId, engagementId, actorId }) => {
  const qual = await upsert(QualificationCase, { "legacyRefs.seedKey": q.seedKey }, { ownerTenantId, buyerOrgId, supplierOrgId, engagementId, criticality: q.criticality, riskBand: q.riskBand, status: q.status, decision: q.decision, scope: q.scope, approvedScope: q.approvedScope, requalDueDate: new Date(q.requalDueDate), updatedBy: actorId, legacyRefs: { seedKey: q.seedKey } }, { qualificationCode: `QUAL-DEMO-${q.seedKey.toUpperCase()}`, createdBy: actorId });
  for (const [methodType, status, rationale, outcome] of q.methods) await upsert(QualificationMethod, { qualificationCaseId: qual._id, methodType }, { qualificationCaseId: qual._id, methodType, status, rationale, outcome, performedByUserId: actorId });
  return qual;
};

const seedBuyerAnchor = async () => {
  const user = await User.findOne({ email: BUYER_ANCHOR }).lean();
  if (!user?.tenant_id) throw new Error(`Missing buyer anchor ${BUYER_ANCHOR}`);
  const profile = await BuyerProfile.findOne({ user_id: user._id }).lean();
  if (!profile?.companyName) throw new Error(`Missing buyer profile ${BUYER_ANCHOR}`);
  await ensureFlags(user.tenant_id);
  const org = await ensureOrg({ legalName: profile.companyName, country: profile.country || "India", roles: ["BUYER"], entityTypes: ["PHARMA_COMPANY"], hq: { address1: profile.addressline1 || "", city: profile.city || "", state: profile.state || "", postalCode: profile.zipcode || "", country: profile.country || "India" }, actorId: user._id, seedKey: "buyer1" });
  await ensureClaim(org._id, user.tenant_id, user._id);
  return { user, tenantId: user.tenant_id, org };
};

const seedDrReddy = async () => {
  const user = await User.findOne({ email: DR_REDDY });
  if (!user?.tenant_id) throw new Error(`Missing supplier anchor ${DR_REDDY}`);
  const profile = await SupplierProfile.findOne({ user_id: user._id });
  if (!profile) throw new Error(`Missing supplier profile ${DR_REDDY}`);
  Object.assign(profile, { companyName: "Dr Reddy's Laboratories", country: profile.country || "India", state: profile.state || "Telangana", city: profile.city || "Hyderabad", addressline1: profile.addressline1 || "8-2-337, Road No. 3, Banjara Hills", zipcode: profile.zipcode || "500034", isProfileCompleted: true });
  await profile.save();
  await ensureFlags(user.tenant_id);
  const org = await ensureOrg({ legalName: "Dr Reddy's Laboratories", country: profile.country || "India", roles: ["SUPPLIER", "MANUFACTURER", "API_MANUFACTURER", "FINISHED_GOODS_MANUFACTURER"], entityTypes: ["MANUFACTURER"], hq: { address1: profile.addressline1, city: profile.city, state: profile.state, postalCode: profile.zipcode, country: profile.country }, actorId: user._id, seedKey: "dr-reddy" });
  await ensureClaim(org._id, user.tenant_id, user._id);
  const sites = [
    { legacyPlantId: "DRL-API-001", siteKey: "demo-drreddy-api-unit-1", siteName: "Dr Reddy API Unit 1", siteType: "MANUFACTURING", gxpScopes: ["API", "SYNTHESIS"], address1: "API Industrial Area", city: "Hyderabad", state: "Telangana", postalCode: "500078", country: "India" },
    { legacyPlantId: "DRL-FDF-002", siteKey: "demo-drreddy-fdf-unit-2", siteName: "Dr Reddy Formulations Unit 2", siteType: "MANUFACTURING", gxpScopes: ["FINISHED_DOSE", "PACKAGING"], address1: "Formulations Industrial Area", city: "Hyderabad", state: "Telangana", postalCode: "500079", country: "India" }
  ];
  const siteMap = {};
  for (const s of sites) {
    const orgSite = await ensureOrgSite(org._id, s, user._id);
    siteMap[s.siteKey] = orgSite;
    siteMap[`org:${s.legacyPlantId}`] = orgSite;
    siteMap[s.legacyPlantId] = await ensureLegacySite({ tenantId: user.tenant_id, userId: user._id, email: user.email, site: s });
  }
  for (const u of [["API Manufacturing", "DEPARTMENT", "demo-drreddy-api-unit-1"], ["Finished Dose Manufacturing", "DEPARTMENT", "demo-drreddy-fdf-unit-2"], ["Quality Assurance", "DEPARTMENT", ""], ["Procurement", "DEPARTMENT", ""]]) await ensureOrgUnit(org._id, siteMap, u, user._id);
  for (const p of [
    { name: "Losartan Potassium API", casNumber: "124750-99-8", plantId: "DRL-API-001", desc: "Losartan Potassium active pharmaceutical ingredient", tech: "Synthetic", dosage: "NA", type: "API", role: "API", catalogType: "API", itemType: "PRODUCT", visibility: "PUBLIC", gxp: ["ICH_Q7", "API"] },
    { name: "Losartan Potassium Tablets 50mg", casNumber: "FDF-LOSARTAN-50MG-001", plantId: "DRL-FDF-002", desc: "Finished-dose Losartan Potassium tablets 50mg", tech: "Formulation", dosage: "Tablet", type: "FDF", role: "Other", catalogType: "OTHER", itemType: "PRODUCT", visibility: "RESTRICTED", gxp: ["FINISHED_DOSE", "PACKAGING"] }
  ]) { const product = await ensureLegacyProduct(p); await ensureMapping(user._id, siteMap[p.plantId]._id, product._id, p.role); await ensureCatalog(org._id, siteMap, p, user._id); }
  await ensureListing(org._id, user.tenant_id, { listingType: "ORG_PROFILE", visibility: "PUBLIC", status: "ACTIVE", headline: "Dr Reddy API and finished-dose manufacturing", summary: "API manufacturing and finished-dose capability available for qualification and audits.", capabilityTags: ["API", "Finished Dose", "GMP"] }, user._id);
  return { user, tenantId: user.tenant_id, org, siteMap };
};
const seedSupplierTenant = async (d, hash) => {
  const tenant = await ensureTenant(d.tenant); await ensureFlags(tenant._id);
  const supplier = await ensureUser({ email: d.users.supplier.email, password: hash, role: "supplier", tenantId: tenant._id });
  await ensureSupplierProfile(supplier, tenant._id, d.users.supplier, d.org.legalName, d.org.hq);
  if (d.users.team) { const team = await ensureUser({ email: d.users.team.email, password: hash, role: "supplierUser", tenantId: tenant._id, invitedBy: supplier._id }); await ensureSupplierUserProfile(team, d.users.team); }
  let buyer = null;
  if (d.users.buyer) { buyer = await ensureUser({ email: d.users.buyer.email, password: hash, role: "buyer", tenantId: tenant._id }); await ensureBuyerProfile(buyer, tenant._id, d.users.buyer, d.org.legalName, d.org.hq); }
  const org = await ensureOrg({ legalName: d.org.legalName, country: d.org.country, roles: d.org.roles, entityTypes: d.org.entityTypes, hq: d.org.hq, actorId: supplier._id, seedKey: d.key });
  await ensureClaim(org._id, tenant._id, supplier._id);
  const siteMap = {};
  for (const s of d.sites) {
    const orgSite = await ensureOrgSite(org._id, s, supplier._id);
    siteMap[s.siteKey] = orgSite;
    siteMap[`org:${s.legacyPlantId}`] = orgSite;
    siteMap[s.legacyPlantId] = await ensureLegacySite({ tenantId: tenant._id, userId: supplier._id, email: supplier.email, site: s });
  }
  for (const u of d.units) await ensureOrgUnit(org._id, siteMap, u, supplier._id);
  for (const p of d.products) { const product = await ensureLegacyProduct(p); await ensureMapping(supplier._id, siteMap[p.plantId]._id, product._id, p.role); await ensureCatalog(org._id, siteMap, p, supplier._id); }
  await ensureListing(org._id, tenant._id, d.listing, supplier._id);
  return { key: d.key, tenantId: tenant._id, supplier, buyer, org, siteMap };
};

const main = async () => {
  await connectDatabase();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const buyerAnchor = await seedBuyerAnchor();
  const drReddy = await seedDrReddy();
  const seeded = {};
  for (const d of SUPPLIERS) seeded[d.key] = await seedSupplierTenant(d, hash);

  const orgs = { buyer1: buyerAnchor.org, "dr-reddy": drReddy.org, cdmo1: seeded.cdmo1.org, cdmo2: seeded.cdmo2.org, "contract-lab": seeded["contract-lab"].org };
  const tenants = { buyer1: buyerAnchor.tenantId, "dr-reddy": drReddy.tenantId, cdmo1: seeded.cdmo1.tenantId, cdmo2: seeded.cdmo2.tenantId, "contract-lab": seeded["contract-lab"].tenantId };
  const actors = { buyer1: buyerAnchor.user._id, "dr-reddy": drReddy.user._id, cdmo1: seeded.cdmo1.buyer?._id || seeded.cdmo1.supplier._id, cdmo2: seeded.cdmo2.supplier._id, "contract-lab": seeded["contract-lab"].supplier._id };

  const engagements = {
    "buyer1-cdmo1": await ensureEngagement({ ownerTenantId: tenants.buyer1, buyerOrgId: orgs.buyer1._id, supplierOrgId: orgs.cdmo1._id, seedKey: "buyer1-cdmo1", actorId: actors.buyer1, description: "Packaging and serialization engagement with CDMO1.", siteIds: [seeded.cdmo1.siteMap["demo-cdmo1-packaging-plant"]?._id].filter(Boolean) }),
    "buyer1-contract-lab": await ensureEngagement({ ownerTenantId: tenants.buyer1, buyerOrgId: orgs.buyer1._id, supplierOrgId: orgs["contract-lab"]._id, seedKey: "buyer1-contract-lab", actorId: actors.buyer1, description: "Outsourced microbiology testing engagement.", siteIds: [seeded["contract-lab"].siteMap["demo-contract-lab-analytical-campus"]?._id].filter(Boolean), classification: "audit_only" }),
    "buyer1-drreddy": await ensureEngagement({ ownerTenantId: tenants.buyer1, buyerOrgId: orgs.buyer1._id, supplierOrgId: orgs["dr-reddy"]._id, seedKey: "buyer1-drreddy", actorId: actors.buyer1, description: "API and finished-dose supplier engagement with Dr Reddy.", siteIds: [drReddy.siteMap["demo-drreddy-api-unit-1"]?._id, drReddy.siteMap["demo-drreddy-fdf-unit-2"]?._id].filter(Boolean) }),
    "cdmo1-cdmo2": await ensureEngagement({ ownerTenantId: tenants.cdmo1, buyerOrgId: orgs.cdmo1._id, supplierOrgId: orgs.cdmo2._id, seedKey: "cdmo1-cdmo2", actorId: actors.cdmo1, description: "Packaging components sourcing engagement from CDMO2.", siteIds: [seeded.cdmo2.siteMap["demo-cdmo2-components-plant"]?._id].filter(Boolean), externalAuditorAllowed: false })
  };

  for (const q of QUALS) await ensureQual({ q, ownerTenantId: tenants[q.owner], buyerOrgId: orgs[q.buyer]._id, supplierOrgId: orgs[q.supplier]._id, engagementId: engagements[q.engagementKey]._id, actorId: actors[q.owner] });

  console.log(JSON.stringify({
    password: PASSWORD,
    buyerAnchor: buyerAnchor.user.email,
    drReddy: drReddy.user.email,
    seededUsers: [
      { supplier: seeded.cdmo1.supplier.email, buyer: seeded.cdmo1.buyer?.email || null },
      { supplier: seeded.cdmo2.supplier.email },
      { supplier: seeded["contract-lab"].supplier.email }
    ],
    engagements: Object.values(engagements).map((e) => e.engagementCode)
  }, null, 2));
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("seedOrgDirectoryDemo failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
