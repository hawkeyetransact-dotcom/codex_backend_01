/**
 * seed_workflow_definitions.js
 *
 * Seeds built-in WorkflowDefinition documents for all supported industry verticals.
 * These are platform-wide (tenantId: null) and serve as starting templates.
 *
 * Run via: npm run seed:universal:workflow-defs
 */

import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.universal") });

const BUILT_IN_DEFINITIONS = [
  // ── 1. Pharma GMP Audit ────────────────────────────────────────────────────
  {
    workflowKey: "gmp_pharma_audit",
    displayName: "GMP Pharmaceutical Supplier Audit",
    description: "ICH Q7 / WHO-GMP compliant supplier qualification and audit lifecycle",
    domainModule: "AUDIT",
    partyLabel: "Supplier",
    subjectLabel: "Drug Product / API",
    phases: [
      { key: "INITIATED",     displayName: "Initiated",       order: 1, isMandatory: true, allowedRoles: ["buyer"], exitConditions: ["auditor_assigned"] },
      { key: "PREP",          displayName: "Preparation",     order: 2, isMandatory: true, allowedRoles: ["supplier"], exitConditions: ["questionnaire_submitted"] },
      { key: "SCOPE_AGENDA",  displayName: "Scope & Agenda",  order: 3, isMandatory: true, allowedRoles: ["auditor"], exitConditions: ["agenda_finalized"] },
      { key: "SCHEDULING",    displayName: "Scheduling",      order: 4, isMandatory: true, allowedRoles: ["auditor", "supplier"], exitConditions: ["dates_confirmed"] },
      { key: "EXECUTION",     displayName: "Audit Execution", order: 5, isMandatory: true, allowedRoles: ["auditor"], exitConditions: ["closing_meeting_done"] },
      { key: "REPORTING",     displayName: "Reporting",       order: 6, isMandatory: true, allowedRoles: ["auditor"], exitConditions: ["final_report_issued"] },
      { key: "FOLLOWUP_CAPA", displayName: "CAPA Follow-up",  order: 7, isMandatory: false, allowedRoles: ["supplier", "auditor"], exitConditions: ["capa_closed"] },
      { key: "CLOSURE",       displayName: "Closure",         order: 8, isMandatory: true, allowedRoles: ["buyer"], exitConditions: [] },
    ],
    standardsLibrary: ["ICH_Q7", "WHO_GMP", "CFR_21_211", "EU_GMP_ANNEX_11"],
    reportTemplateKey: "gmp_audit_report",
    vocabularyDefaults: { audit: "Audit", supplier: "Supplier", auditor: "Auditor", report: "Audit Report", finding: "Observation", capa: "CAPA" },
    industryTags: ["pharma", "gmp", "fda", "ich", "api"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 2. Medical Device Audit ────────────────────────────────────────────────
  {
    workflowKey: "medical_device_audit",
    displayName: "Medical Device Supplier Audit",
    description: "ISO 13485 / 21 CFR Part 820 QMS supplier audit",
    domainModule: "AUDIT",
    partyLabel: "Supplier",
    subjectLabel: "Medical Device / Component",
    phases: [
      { key: "INITIATED",     displayName: "Initiated",       order: 1, isMandatory: true, allowedRoles: ["buyer"] },
      { key: "PREP",          displayName: "Pre-audit Prep",  order: 2, isMandatory: true, allowedRoles: ["supplier"] },
      { key: "SCOPE_AGENDA",  displayName: "Audit Planning",  order: 3, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "EXECUTION",     displayName: "Audit Execution", order: 4, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "REPORTING",     displayName: "Findings & Report", order: 5, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "FOLLOWUP_CAPA", displayName: "CAPA Follow-up",  order: 6, isMandatory: false, allowedRoles: ["supplier"] },
      { key: "CLOSURE",       displayName: "Closure",         order: 7, isMandatory: true, allowedRoles: ["buyer"] },
    ],
    standardsLibrary: ["ISO_13485", "CFR_21_820", "MDR_2017_745"],
    reportTemplateKey: "medical_device_audit_report",
    vocabularyDefaults: { audit: "Audit", supplier: "Supplier", finding: "Nonconformance", capa: "CAPA", report: "Audit Report" },
    industryTags: ["medical_device", "iso_13485", "fda", "mdr"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 3. Organic Farming Certification ──────────────────────────────────────
  {
    workflowKey: "organic_farming_coc",
    displayName: "Organic Farming Certification Inspection",
    description: "USDA NOP / EU Organic Regulation farm and crop certification",
    domainModule: "INSPECTION",
    partyLabel: "Farm / Producer",
    subjectLabel: "Crop Lot / Field",
    phases: [
      { key: "APPLICATION",   displayName: "Application",        order: 1, isMandatory: true, allowedRoles: ["party_admin"] },
      { key: "DOCUMENT_REVIEW", displayName: "Document Review",  order: 2, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "FIELD_INSPECTION", displayName: "Field Inspection", order: 3, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "SAMPLING",      displayName: "Sampling & Testing",  order: 4, isMandatory: false, allowedRoles: ["certifier"] },
      { key: "REVIEW",        displayName: "Certification Review", order: 5, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "DECISION",      displayName: "Decision & Issuance", order: 6, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "SURVEILLANCE",  displayName: "Annual Surveillance", order: 7, isMandatory: false, allowedRoles: ["certifier"] },
    ],
    standardsLibrary: ["USDA_NOP", "EU_ORGANIC_REGULATION", "IFOAM"],
    reportTemplateKey: "organic_certificate",
    vocabularyDefaults: { audit: "Inspection", supplier: "Farm", auditor: "Certifier", product: "Crop Lot", report: "Organic Certificate", finding: "Nonconformance", capa: "Corrective Action" },
    industryTags: ["organic", "usda", "farming", "certification", "nop"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 4. Forest Chain of Custody ─────────────────────────────────────────────
  {
    workflowKey: "forest_coc",
    displayName: "Forest Chain of Custody Certification",
    description: "FSC / PEFC forest management and chain of custody verification",
    domainModule: "CHAIN_OF_CUSTODY",
    partyLabel: "Forest Manager / Operator",
    subjectLabel: "Timber Volume / Material",
    phases: [
      { key: "APPLICATION",   displayName: "Application",        order: 1, isMandatory: true, allowedRoles: ["party_admin"] },
      { key: "INITIAL_EVAL",  displayName: "Initial Evaluation", order: 2, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "MAIN_AUDIT",    displayName: "Main Audit",         order: 3, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "CORRECTIVE",    displayName: "Corrective Actions", order: 4, isMandatory: false, allowedRoles: ["party_admin"] },
      { key: "CERTIFICATION", displayName: "Certification",      order: 5, isMandatory: true, allowedRoles: ["certifier"] },
      { key: "ANNUAL_AUDIT",  displayName: "Annual Surveillance Audit", order: 6, isMandatory: false, allowedRoles: ["certifier"] },
    ],
    standardsLibrary: ["FSC_STD_40_004", "PEFC_ST_2002", "FSC_COC"],
    reportTemplateKey: "forest_coc_certificate",
    vocabularyDefaults: { audit: "Audit", supplier: "Forest Manager", auditor: "Certifier", product: "Timber Volume", report: "CoC Certificate", finding: "Nonconformity", capa: "Corrective Action" },
    industryTags: ["forest", "fsc", "pefc", "coc", "timber", "certification"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 5. Real Estate Transaction Review ─────────────────────────────────────
  {
    workflowKey: "real_estate_p2p",
    displayName: "Real Estate Peer-to-Peer Transaction Review",
    description: "Property disclosure, due diligence, and transaction verification workflow",
    domainModule: "TRANSACTION_REVIEW",
    partyLabel: "Seller / Agent",
    subjectLabel: "Property / Parcel",
    phases: [
      { key: "LISTING",        displayName: "Listing & Disclosure", order: 1, isMandatory: true, allowedRoles: ["counterparty"] },
      { key: "DUE_DILIGENCE",  displayName: "Due Diligence",        order: 2, isMandatory: true, allowedRoles: ["buyer", "verifier"] },
      { key: "INSPECTION",     displayName: "Property Inspection",  order: 3, isMandatory: true, allowedRoles: ["verifier"] },
      { key: "LEGAL_REVIEW",   displayName: "Legal Review",         order: 4, isMandatory: true, allowedRoles: ["reviewer"] },
      { key: "NEGOTIATION",    displayName: "Negotiation",          order: 5, isMandatory: false, allowedRoles: ["buyer", "counterparty"] },
      { key: "CLOSING",        displayName: "Closing",              order: 6, isMandatory: true, allowedRoles: ["buyer"] },
    ],
    standardsLibrary: ["LOCAL_PROPERTY_DISCLOSURE", "TITLE_SEARCH"],
    reportTemplateKey: "property_disclosure_report",
    vocabularyDefaults: { audit: "Review", supplier: "Seller", auditor: "Verifier", buyer: "Buyer", product: "Property", report: "Disclosure Report", finding: "Issue", capa: "Remediation" },
    industryTags: ["real_estate", "property", "p2p", "transaction"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 6. High-Ticket Item Provenance ─────────────────────────────────────────
  {
    workflowKey: "high_ticket_provenance",
    displayName: "High-Ticket Item Provenance Verification",
    description: "Art, watches, jewellery, and luxury goods authenticity and provenance verification",
    domainModule: "VERIFICATION",
    partyLabel: "Consignor / Dealer",
    subjectLabel: "Art / Watch / Jewellery / Item",
    phases: [
      { key: "SUBMISSION",    displayName: "Item Submission",     order: 1, isMandatory: true, allowedRoles: ["counterparty"] },
      { key: "DOCUMENTATION", displayName: "Documentation Check", order: 2, isMandatory: true, allowedRoles: ["verifier"] },
      { key: "AUTHENTICATION", displayName: "Authentication",     order: 3, isMandatory: true, allowedRoles: ["verifier"] },
      { key: "VALUATION",     displayName: "Valuation",           order: 4, isMandatory: false, allowedRoles: ["verifier"] },
      { key: "REPORT_ISSUE",  displayName: "Certificate Issuance", order: 5, isMandatory: true, allowedRoles: ["verifier"] },
    ],
    standardsLibrary: ["AUTHENTICITY_STANDARD", "PROVENANCE_BEST_PRACTICE"],
    reportTemplateKey: "provenance_certificate",
    vocabularyDefaults: { audit: "Verification", supplier: "Consignor", auditor: "Verifier", product: "Item", report: "Provenance Certificate", finding: "Issue", capa: "Resolution" },
    industryTags: ["luxury", "art", "watches", "jewellery", "provenance", "authentication"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 7. ISO 9001 Internal Audit ─────────────────────────────────────────────
  {
    workflowKey: "iso9001_internal_audit",
    displayName: "ISO 9001 Internal Quality Audit",
    description: "ISO 9001:2015 QMS internal audit per Clause 9.2",
    domainModule: "AUDIT",
    partyLabel: "Department / Function",
    subjectLabel: "Process / Procedure",
    phases: [
      { key: "PLANNING",      displayName: "Audit Planning",    order: 1, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "PREPARATION",   displayName: "Preparation",       order: 2, isMandatory: true, allowedRoles: ["auditor", "supplier"] },
      { key: "EXECUTION",     displayName: "Audit Execution",   order: 3, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "REPORTING",     displayName: "Findings Report",   order: 4, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "CAPA",          displayName: "Corrective Actions", order: 5, isMandatory: false, allowedRoles: ["supplier"] },
      { key: "CLOSURE",       displayName: "Closure & Review",  order: 6, isMandatory: true, allowedRoles: ["auditor"] },
    ],
    standardsLibrary: ["ISO_9001_2015"],
    reportTemplateKey: "iso9001_audit_report",
    vocabularyDefaults: { audit: "Internal Audit", supplier: "Department", auditor: "Internal Auditor", product: "Process", report: "Audit Report", finding: "Nonconformity", capa: "Corrective Action" },
    industryTags: ["iso9001", "qms", "internal_audit"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },

  // ── 8. Food Safety HACCP Assessment ───────────────────────────────────────
  {
    workflowKey: "food_safety_haccp",
    displayName: "Food Safety & HACCP Supplier Assessment",
    description: "FSMA / Codex Alimentarius HACCP food safety supplier assessment",
    domainModule: "INSPECTION",
    partyLabel: "Food Manufacturer",
    subjectLabel: "Food Product",
    phases: [
      { key: "INITIATED",     displayName: "Initiated",           order: 1, isMandatory: true, allowedRoles: ["buyer"] },
      { key: "PREP",          displayName: "Pre-Assessment Prep", order: 2, isMandatory: true, allowedRoles: ["supplier"] },
      { key: "INSPECTION",    displayName: "Facility Inspection", order: 3, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "SAMPLING",      displayName: "Sampling & Testing",  order: 4, isMandatory: false, allowedRoles: ["auditor"] },
      { key: "REPORTING",     displayName: "Assessment Report",   order: 5, isMandatory: true, allowedRoles: ["auditor"] },
      { key: "CAPA",          displayName: "CAPA Follow-up",      order: 6, isMandatory: false, allowedRoles: ["supplier"] },
      { key: "CLOSURE",       displayName: "Closure",             order: 7, isMandatory: true, allowedRoles: ["buyer"] },
    ],
    standardsLibrary: ["CODEX_HACCP", "FSMA_PCQI", "SQF", "BRC_FOOD"],
    reportTemplateKey: "haccp_assessment_report",
    vocabularyDefaults: { audit: "Assessment", supplier: "Food Manufacturer", auditor: "Assessor", product: "Food Product", report: "HACCP Assessment Report", finding: "Finding", capa: "CAPA" },
    industryTags: ["food_safety", "haccp", "fsma", "sqf", "brc", "food"],
    isBuiltIn: true,
    isActive: true,
    tenantId: null,
  },
];

export const seedWorkflowDefinitions = async () => {
  // Dynamic import so this file can also be run standalone
  const WorkflowDefinitionModule = await import("../src/models/WorkflowDefinitionModel.js");
  const WorkflowDefinition = WorkflowDefinitionModule.default;

  let created = 0;
  let skipped = 0;

  for (const def of BUILT_IN_DEFINITIONS) {
    const existing = await WorkflowDefinition.findOne({
      workflowKey: def.workflowKey,
    });
    if (existing) {
      skipped++;
      continue;
    }
    await WorkflowDefinition.create(def);
    created++;
  }

  console.log(
    `[SEED:WorkflowDefinitions] ✓ ${created} created, ${skipped} already existed.`
  );
};

// ── Standalone execution ────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not defined");

  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(uri);
  await seedWorkflowDefinitions();
  await mongoose.disconnect();
}
