/**
 * Canonical AI agent catalog — keyed by `feature` string used in groundedGenerate calls.
 * Adding a new agent? Add an entry here so it appears in the Admin Panel + ROI dashboard.
 */
export const AGENT_CATALOG = {
  "audit.draft_observation": {
    displayName: "Observation Drafter (Wave-2)",
    module: "audit",
    estimatedTimeSavedMin: 7,
    description: "Suggests observation wording from cross-tenant anonymized findings",
  },
  "audit.report.assemble": {
    displayName: "Audit Report Assembler",
    module: "audit",
    estimatedTimeSavedMin: 180,
    description: "Drafts narrative report from findings + evidence + ICH Q7 framing",
  },
  "audit.preaudit.prefill": {
    displayName: "Pre-Audit Questionnaire Pre-fill",
    module: "audit",
    estimatedTimeSavedMin: 30,
    description: "Pre-fills supplier questionnaire from supplier KB + ICH Q7",
  },
  "audit.autofill_form": {
    displayName: "Generic Form Autofill",
    module: "audit",
    estimatedTimeSavedMin: 12,
    description: "Generic structured-form filler",
  },
  "audit.supplier_intel": {
    displayName: "Supplier-Intel (public-data fusion)",
    module: "audit",
    estimatedTimeSavedMin: 45,
    description: "openFDA + FDA WLs + EMA EudraGMDP + WHO PQ + verdict",
  },
  "capa.draft_rca": {
    displayName: "CAPA RCA Drafter",
    module: "capa",
    estimatedTimeSavedMin: 22,
    description: "5-Whys / fishbone scaffold from finding text",
  },
  "risk.scenario_brainstorm": {
    displayName: "Risk Scenario Brainstormer",
    module: "risk",
    estimatedTimeSavedMin: 25,
    description: "Generates top-N risk scenarios (S/O/D × category)",
  },
  "complaint.triage": {
    displayName: "Complaint Triage",
    module: "complaint",
    estimatedTimeSavedMin: 15,
    description: "Severity + MDR-reportability + recommended deadline",
  },
  "deviation.five_why": {
    displayName: "Deviation 5-Why Scaffolder",
    module: "deviation",
    estimatedTimeSavedMin: 20,
    description: "Scaffolds the 5-Why investigation from deviation description",
  },
  "change.classify_impact": {
    displayName: "Change Impact Classifier",
    module: "change-control",
    estimatedTimeSavedMin: 40,
    description: "Maps change blast radius — affected docs/processes/products/markets",
  },
  "training.auto_assign": {
    displayName: "Training Auto-Assigner",
    module: "training",
    estimatedTimeSavedMin: 30,
    description: "Recommends training assignments from SOP revisions + role definitions",
  },
  "mrm.populate_inputs": {
    displayName: "Management Review Input Populator",
    module: "management-review",
    estimatedTimeSavedMin: 90,
    description: "Auto-pulls KPIs + open CAPA + audit summary into MRM template",
  },
};

export function getAgentMeta(featureKey) {
  return AGENT_CATALOG[featureKey] ?? {
    displayName: featureKey,
    module: "unknown",
    estimatedTimeSavedMin: 10,
    description: "(uncatalogued agent — add to agentCatalog.js)",
  };
}
