/**
 * build-pharma-strategy-packs.mjs
 *
 * Generates TWO parallel strategic documents for the pharma vertical:
 *   - Board / Investor pack  (24-month vision, market, competitive, revenue)
 *   - Engineering pack       (architecture, epics, tech debt, validation)
 *
 * Same underlying data — different views. Output as tabbed HTML + PDF using
 * the same visual language as the Novex demo guide.
 *
 * Output:
 *   backend/docs/03-user-guides/pharma-strategy-board.html / .pdf
 *   backend/docs/03-user-guides/pharma-strategy-engineering.html / .pdf
 *
 * Usage:
 *   node scripts/build-pharma-strategy-packs.mjs              # both packs
 *   node scripts/build-pharma-strategy-packs.mjs --html-only  # skip PDF
 *   node scripts/build-pharma-strategy-packs.mjs --pack=board
 *   node scripts/build-pharma-strategy-packs.mjs --pack=engineering
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "03-user-guides");

const args = process.argv.slice(2);
const htmlOnly = args.includes("--html-only");
const only = args.find((a) => a.startsWith("--pack="))?.split("=")[1];

// ═══════════════════════════════════════════════════════════════════════════════
// DATA — all sourced from research; numeric claims carry URL citations
// ═══════════════════════════════════════════════════════════════════════════════

const MARKET = {
  headline: "Pharma QMS software is a USD 1.59B–1.87B market (2024-25) growing ~13% CAGR to USD 3–4B by 2030. Life-sciences QMS (pharma = 57–59%) is USD 3.3–3.9B today, USD 9.5–11.4B by 2030-34. Overall QMS market USD 12.5B → 31.5B by 2034 at 10.8% CAGR.",
  sizing: [
    { label: "Pharma QMS only",       y2025: 1.59, y2030: 2.98, cagr: 13.3, src: "MarketsandMarkets", url: "https://www.marketsandmarkets.com/PressReleases/pharmaceutical-quality-management-software.asp" },
    { label: "Pharma QMS only",       y2025: 1.87, y2030: 3.85, cagr: 12.99, src: "Grand View Research", url: "https://www.grandviewresearch.com/industry-analysis/pharmaceutical-quality-management-software-market-report" },
    { label: "Life-sciences QMS",     y2025: 3.27, y2030: 9.47, cagr: 12.65, src: "Grand View Research",     url: "https://www.grandviewresearch.com/industry-analysis/life-sciences-quality-management-software-market-report" },
    { label: "Life-sciences QMS",     y2025: 3.87, y2030: 11.4, cagr: 12.78, src: "Straits Research",         url: "https://straitsresearch.com/report/life-sciences-quality-management-software-market" },
    { label: "All-vertical QMS",      y2025: 12.52, y2030: 31.54, cagr: 10.81, src: "Fortune Business Insights", url: "https://www.fortunebusinessinsights.com/industry-reports/quality-management-software-market-100761" },
    { label: "All-vertical QMS",      y2025: 12.26, y2030: 28.82, cagr: 11.5, src: "Grand View Research",      url: "https://www.grandviewresearch.com/industry-analysis/quality-management-software-market" },
  ],
  geographic: {
    northAmerica: "38.6–42.8% of pharma/life-sciences QMS spend (2024)",
    europe: "~25–28% — driven by EU GMP Annex 11 revision (draft Jul 2025, final mid-2026)",
    apac: "18–22% today, fastest-growing region (China/India/Singapore biologics capex)",
  },
  tailwinds: [
    { name: "EU GMP Annex 11 revision", detail: "Draft July 2025 tripled the chapter from 5→19 pages — prescriptive cybersecurity, AI validation, audit-trail lifecycle. Final mid-2026. Forces every EU-market pharma to re-validate or replace legacy systems.", url: "https://gmpinsiders.com/2025-eu-gmp-draft-chapter-4-annex-11-annex-22/" },
    { name: "DSCSA enforcement live",   detail: "May 27 2025 (wholesale) + Nov 27 2025 (large dispensers) ended stabilisation period. Package-level electronic traceability now mandatory in US supply chain.", url: "https://www.fda.gov/drugs/drug-safety-and-availability/dscsa-compliance-policies-establish-1-year-stabilization-period-implementing-electronic-systems" },
    { name: "FDA AI-quality draft guidance (Jan 2025)", detail: "Risk-based credibility framework — AI now formally in scope of validated GxP systems. Pulls AI/LLM requirements into EQMS RFPs.", url: "https://www.mastercontrol.com/gxp-lifeline/ai-in-life-sciences-quality-management-qms-trends/" },
    { name: "CDMO consolidation + capacity", detail: "CDMO market USD 155.5B (2024) → USD 293.6B (2033) at 7.38% CAGR. Fujifilm's $3.2B Holly Springs site alone drives multi-client EQMS demand. GLP-1 + ADC + biosimilars accelerate.", url: "https://www.grandviewresearch.com/industry-analysis/pharmaceutical-cdmo-market-report" },
    { name: "FDA QMSR effective Feb 2, 2026", detail: "Harmonises US medical-device reg with ISO 13485:2016, pulling combination-product pharma into device-QMS standards.", url: "https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr" },
  ],
  sharesByCustomer: [
    { rank: 1, name: "CDMOs",            reason: "Consolidation + multi-client validation burden forces modernisation" },
    { rank: 2, name: "Cell & Gene",      reason: "New modality; greenfield QMS builds; bespoke batch-release" },
    { rank: 3, name: "Specialty/Biotech",reason: "Scale-up pre-commercial GxP mandate triggers first EQMS purchase" },
    { rank: 4, name: "Medical Device",   reason: "QMSR Feb 2026 triggers refresh cycle" },
    { rank: 5, name: "Generics",         reason: "Margin pressure; higher deviation/CAPA volume" },
    { rank: 6, name: "Big Pharma",       reason: "Largest absolute spend but replacement-cycle not greenfield" },
  ],
  buyerProfile: {
    economicBuyer: "VP/Head of Quality or CQO signs; CIO co-signs for cloud + validation scope; CFO approves >$750K; COO joins for CDMOs",
    influencers: "QA managers · Regulatory Affairs lead · CSV/GAMP 5 validation lead · IT security (Annex 11 cyber)",
    salesCycle: "6–12 months mid-market · 12–18 months enterprise",
    typicalACV: "$20K–$30K entry · $150K–$400K mid-market · $1M+ enterprise all-in",
    blockers: "'no budget / other priorities' (>50% stalls); validation effort; ERP/MES/LIMS integration scope; change-management fear",
    sources: [
      { label: "SGS Systems pricing guide", url: "https://sgsystemsglobal.com/guides/qms-pricing/" },
      { label: "Simploud cost analysis",    url: "https://simploud.com/cost-of-implementation/" },
      { label: "Zen QMS true cost",         url: "https://blog.zenqms.com/whats-the-true-cost-of-an-eqms" },
    ],
  },
  shifts: [
    { name: "Generative AI inside QMS", detail: "Veeva, MasterControl, AmpleLogic embedding LLMs for deviation summarisation, CAPA drafting, SOP generation. McKinsey-cited data: 30–40% fewer repeat incidents, 40% faster closure.", url: "https://amplelogic.com/ai-pharma-deviation-management-handling-time" },
    { name: "Cloud dominance entrenched", detail: "Cloud/web-based = 77% of pharma QMS deployments (2024). On-premises TrackWise installs are the refresh-opportunity base." },
    { name: "Platform consolidation", detail: "Buyers want single-platform doc + training + CAPA + audit + supplier. Veeva + MasterControl positioned as duopoly in new enterprise RFPs (IntuitionLabs 2026)." },
    { name: "Data residency / sovereignty", detail: "Annex 11 cyber + disaster-recovery reqs + regional cloud rules (EU/China/India) drive regional-hosting architecture." },
    { name: "Salesforce-native rise", detail: "ComplianceQuest + Dot Compliance + TrackWise Digital gain mid-market by leveraging Salesforce ecosystem. Reduces buyer IT burden; adds SF license tax." },
  ],
  tamSamSom: {
    tam: { range: "$3.5–4B by 2030", logic: "Pharma QMS $1.87B (2024) + adjacent biotech/specialty via GVR life-sciences envelope" },
    sam: { range: "~$600M/yr (2026), ~$1.1B/yr (2030)", logic: "Mid-market share estimated 30–35% of pharma QMS; 3,000–5,000 mid-market pharma + CDMO accounts globally × $150K avg ACV" },
    som: { range: "$6M–15M ARR in 5 years", logic: "1–2% SAM share achievable for well-funded entrant (Qualio/ComplianceQuest early trajectory). 50–100 accounts × $150K ACV" },
    note: "Mid-market (100–2000 FTE, $50M–$1B revenue, pharma + CDMO). Assumptions stated — verify before investor deck.",
  },
};

const COMPETITORS = [
  { id: "mastercontrol", name: "MasterControl", positioning: "Established pharma EQMS leader; LNS Research #1 (2025); ISO 42001 AI-cert.", deployment: "SaaS multi-tenant + FedRAMP Moderate + on-prem legacy", pricing: "$25K–$500K+/yr · enterprise only", strongest: ["Doc Control","Training","Quality Events"], ai: "AI-assisted document review + quality-event investigation, human-in-the-loop, 30-40% faster investigations (vendor claim). One-button validation.", integrations: "Integration Toolkit + API; SAP, LIMS, ERP, MES", validation: "Validated-ready; customer IQ/OQ/PQ with vendor kit", weakness: "Clunky reporting · steep learning curve · rigid workflows · pricey for mid-market", url: "https://www.mastercontrol.com/quality/eqms-pharma/" },
  { id: "veeva", name: "Veeva Vault QMS", positioning: "Cloud-native SaaS leader for life sciences; Vault platform spans RIM + Clinical + QMS.", deployment: "SaaS only (no on-prem)", pricing: "~$50–200/user/month + ~$25K base · implementation $10K–$50K SMB", strongest: ["Doc Control","Quality Events","Change Control"], ai: "Vault AI Agents (2025) — deviation triage, CAPA drafting, doc summarisation. Early-pilot: 15–30% faster triage, up to 75% CAPA-cycle reduction.", integrations: "Kafka event bus + rich APIs; SAP S/4HANA, Vault LIMS, CrossVault", validation: "SaaS validation package delivered; customer does risk-based OQ/PQ", weakness: "High TCO · customisation rigid outside Veeva's model · tedious setup · UX limits on advanced flows", url: "https://intuitionlabs.ai/articles/veeva-vault-pricing-module-costs-2026" },
  { id: "trackwise", name: "TrackWise Digital (Honeywell/Sparta)", positioning: "Legacy pharma QMS modernised to cloud; Honeywell acquired Sparta 2020.", deployment: "SaaS on Salesforce (Digital); classic on-prem", pricing: "Enterprise only · $100K–$1M+/yr", strongest: ["Complaints","Deviations/NC","CAPA"], ai: "TrackWise AI / QualityWise-AI — AI Auto-Categorization, Auto-Summarisation, Insights. On AWS SageMaker. Covers Complaints, Deviations, NC, CAPA, Change, Audit.", integrations: "ERP, CRM, LIMS, MES; Salesforce-adjacent for Digital", validation: "Validated; Sparta validation kits; classic needs customer validation", weakness: "Slow page refreshes · dated UI · limited customisation · costly · over-promised config", url: "https://www.spartasystems.com/qualitywise-ai/" },
  { id: "caliber", name: "Caliber EQMS", positioning: "India-origin pharma-focused integrated QMS+DMS+LMS stack; strong APAC/emerging-market.", deployment: "Hybrid — on-prem, private cloud, SaaS", pricing: "Lower than US peers · enterprise quote-based", strongest: ["Doc Control","Audit/CAPA","OOS/OOT"], ai: "Marketing mentions AI-enabled analytics; shipped AI not confirmed publicly.", integrations: "Own LIMS + ERP; tight suite integration", validation: "21 CFR 11 + EU Annex 11 + ISO 9001 built-in; customer-led validation", weakness: "Thin Western review footprint · UI dated vs Veeva/Qualio · AI story thin", url: "https://caliberuniversal.com/solutions/enterprise-platform-for-integrated-quality/" },
  { id: "dot", name: "Dot Compliance", positioning: "100% Salesforce-native, ready-to-deploy eQMS for life-science mid-market.", deployment: "SaaS on Salesforce", pricing: "~$10K–$150K/yr + Salesforce license", strongest: ["Doc Control","Training","CAPA/Deviation"], ai: "'Dottie' — industry-first quality-specific AI chat agent for workflow, authoring, compliance Q&A.", integrations: "Salesforce AppExchange · REST APIs to ERP/LIMS", validation: "Pre-validated 'ready-to-deploy' · IQ/OQ templates · customer PQ", weakness: "Salesforce learning curve for non-SF shops · SF license stack pushes TCO · config often needs partner", url: "https://www.dotcompliance.com/eqms/" },
  { id: "cq", name: "ComplianceQuest", positioning: "Salesforce-native unified QMS + EHS + PLM for life sciences + regulated manufacturing.", deployment: "SaaS on Salesforce", pricing: "Enterprise modular · $40K–$400K+/yr", strongest: ["Audit","Doc Control","Supplier Quality"], ai: "Generative AI summarisation, risk prediction, IoT telemetry for real-time insights. Specifics less documented than Dot's Dottie.", integrations: "Salesforce · SAP · PLM · IoT platforms", validation: "21 CFR 11 + audit trails + e-sigs + validation docs; customer-assisted validation", weakness: "Higher TCO (SF stack) · complex config for small teams · reporting strong but steep", url: "https://www.compliancequest.com/21-cfr-part-11-compliance/" },
  { id: "qualio", name: "Qualio", positioning: "Modern approachable eQMS for life-science startups + mid-market; fastest time-to-value in segment.", deployment: "SaaS multi-tenant", pricing: "~$12K–$120K/yr · starts ~$12K base", strongest: ["Doc Control","Training","Audit/CAPA"], ai: "'Compliance Intelligence' (Oct 2025 GA) — AI gap analysis across FDA QMSR + ISO 13485/9001/27001 + MDSAP; cross-framework monitoring; evidence-to-requirement mapping.", integrations: "Jira · Slack · Greenlight Guru · Google · REST API; thinner ERP/LIMS", validation: "Pre-validated · IQ/OQ docs ship · customer PQ", weakness: "Workflow automation limits · search gaps · not ideal for complex multi-site pharma mfg", url: "https://www.prnewswire.com/news-releases/qualio-announces-compliance-intelligence-the-ai-powered-solution-advancing-its-industry-leading-life-sciences-grc-platform-302583316.html" },
  { id: "etq", name: "ETQ Reliance", positioning: "Multi-industry EQMS (auto/med-device/pharma/food) with deep configurability; rebranding as Octave Reliance.", deployment: "SaaS + on-prem · CCU licensing", pricing: "$50K–$500K+/yr", strongest: ["Doc Control","CAPA","Audit"], ai: "Predictive quality analytics via Acerta partnership; real-time KPIs + trend/pattern detection", integrations: "ERP, LIMS, MES via APIs · broad industrial connectors", validation: "Validation package for pharma/device · customer-led", weakness: "Price creep · UI inconsistency across apps · heavy config for pharma fit · cloud tiers", url: "https://www.etq.com/" },
  { id: "valgenesis", name: "ValGenesis (VLMS 5.0)", positioning: "Validation-lifecycle leader expanding to full quality suite; only CSA-ready VLMS on market.", deployment: "SaaS (primary) + private cloud", pricing: "Enterprise only · $100K–$1M+/yr", strongest: ["Validation (iVal)","Cleaning Validation","Process Monitoring"], ai: "iVal AI-powered authoring, automated test execution, live anomaly flagging, gap-vs-SOP detection. 80% cycle reduction (vendor claim), 90% fewer observations.", integrations: "ERP · DCS/PLC (ops data) · CQV tooling · API-driven", validation: "Validation IS the product · CSA-aligned · strong 21 CFR 11 posture", weakness: "Primarily validation-focused — weaker pure-play EQMS breadth · thin public review footprint · premium pricing", url: "https://www.valgenesis.com/blog/valgenesis-vlms-5.0-next-gen-validation-lifecycle-management" },
  { id: "iqvia", name: "IQVIA SmartSolve (ex-Pilgrim)", positioning: "20+-module eQMS rebranded under IQVIA; bundled with RIM + analytics + real-world-data.", deployment: "SaaS + on-prem", pricing: "Enterprise quote-based · $75K–$750K+/yr", strongest: ["CAPA","Audit","Complaints/PMS"], ai: "AI/ML workflow automation, risk detection, compliance acceleration; overlaps with IQVIA drug-safety AI agents.", integrations: "IQVIA RIM · Vigilance · real-world-data · ERP/LIMS via APIs", validation: "Validated · validation kit delivered", weakness: "UI dated (clunky NCR notifications) · reporting setup hard · slow modernisation vs cloud-native peers", url: "https://www.iqvia.com/solutions/safety-regulatory-compliance/quality-compliance/smartsolve-eqms/smartsolve-eqms-for-pharma" },
  { id: "cwire", name: "ComplianceWire (UL)", positioning: "Training-centric compliance LMS for life sciences — 3.6M users, 600 orgs, 153 countries. Not a full EQMS.", deployment: "SaaS (validated)", pricing: "Enterprise quote-based", strongest: ["Role-based Training","Qualification Mgmt","Compliance Reporting"], ai: "Shipped AI features not confirmed on public pages (2022R2 focused on dashboards).", integrations: "Connects to Veeva/MasterControl/TrackWise as training-of-record · SSO · SCORM/xAPI", validation: "Validated platform · electronic records + audit trails + e-sigs · FDA-co-developed 400+ course catalog", weakness: "Narrow scope (no CAPA/Deviation/Change) · must pair with EQMS · UI dated · limited AI roadmap", url: "https://www.ul.com/software/ultrus/compliancewire-lms" },
];

const COMPETITOR_MATRIX = [
  { id: "mastercontrol", cloud: "Yes+on-prem",  pharma: 5, ai: 4, validation: 4, cost: "$50K–$500K+",  size: "Mid-Enterprise" },
  { id: "veeva",         cloud: "SaaS only",    pharma: 5, ai: 4, validation: 4, cost: "$75K–$1M+",    size: "Mid-Large Pharma/Biotech" },
  { id: "trackwise",     cloud: "Partial",      pharma: 5, ai: 4, validation: 3, cost: "$100K–$1M+",   size: "Large Pharma" },
  { id: "caliber",       cloud: "Hybrid",       pharma: 5, ai: 2, validation: 3, cost: "$25K–$200K",   size: "APAC Pharma, Mid-market" },
  { id: "dot",           cloud: "SF-native",    pharma: 4, ai: 4, validation: 4, cost: "$15K–$150K",   size: "SMB–Mid Life Sci" },
  { id: "cq",            cloud: "SF-native",    pharma: 4, ai: 3, validation: 4, cost: "$40K–$400K",   size: "Mid-market Multi-industry" },
  { id: "qualio",        cloud: "SaaS",         pharma: 4, ai: 4, validation: 5, cost: "$12K–$120K",   size: "Startups–Mid Bio" },
  { id: "etq",           cloud: "SaaS+on-prem", pharma: 3, ai: 3, validation: 3, cost: "$50K–$500K",   size: "Mid-Large Multi-industry" },
  { id: "valgenesis",    cloud: "SaaS",         pharma: 5, ai: 4, validation: 5, cost: "$100K–$1M+",   size: "Large Pharma/Biotech" },
  { id: "iqvia",         cloud: "SaaS+on-prem", pharma: 5, ai: 3, validation: 4, cost: "$75K–$750K",   size: "Mid-Large Pharma" },
  { id: "cwire",         cloud: "SaaS",         pharma: 5, ai: 2, validation: 4, cost: "$30K–$300K",   size: "Any size (training only)" },
];

const HAWKEYE_MATRIX_SELF = { id: "hawkeye", cloud: "SaaS (Vercel)+on-prem-ready", pharma: 4, ai: 4, validation: 3, cost: "$12K–$150K target", size: "Mid-market pharma + CDMO (ICP)" };

const MODULES = [
  {
    key: "AUDIT_MANAGEMENT", name: "Audit Management",
    currentState: "FULLY_BUILT",
    evidence: "auditPlanModel, auditRequestsMasterModel, assessmentModel, evidenceModel, full routes + frontend, RFQ-to-award flow",
    gaps: ["Internal-audit scheduling only manual", "No AI finding-drafting from evidence attachments", "No regulatory-mapping to FDA 21 CFR sections"],
    aiAutomation: [
      "LLM drafts observations from uploaded evidence + questionnaire gaps (CAPA auto-suggest)",
      "Risk-based audit-program auto-scheduler — flag suppliers/departments by deviation density",
      "Computer-vision on facility walk-through videos for compliance hotspotting",
    ],
    competitorBenchmark: "Veeva + MasterControl + TrackWise all ship AI summarisation. Hawkeye on par (AskHawk) but lacks evidence-aware finding drafting.",
    moat: "Cross-persona section-assignment + RFQ-to-auditor marketplace is unique; competitors assume in-house audit team only.",
  },
  {
    key: "DOCUMENT_CONTROL", name: "Document Control",
    currentState: "FULLY_BUILT",
    evidence: "documentControlModel + documentViewModel (redacted views) + full lifecycle routes + frontend",
    gaps: ["No AI-assisted SOP authoring", "No cross-framework evidence tagging (QMSR vs ISO 13485 vs ISO 9001)", "No structured change-impact analysis", "No Office/Google Docs round-trip"],
    aiAutomation: [
      "Draft new SOP rev from a diff of regulatory changes (FDA warning letter → SOP update)",
      "Auto-tag controlled docs against multiple frameworks (21 CFR, Annex 11, ISO 13485, ISO 9001, IATF 16949)",
      "Semantic doc search + AskHawk Q&A over controlled-doc corpus with citation",
    ],
    competitorBenchmark: "Qualio Compliance Intelligence (Oct 2025) does multi-framework gap analysis; Veeva AI drafts doc summaries. Hawkeye behind on multi-framework.",
    moat: "Redacted view model (buyer vs auditor) is a differentiator — rare in competitors.",
  },
  {
    key: "CAPA_MANAGEMENT", name: "CAPA",
    currentState: "FULLY_BUILT",
    evidence: "capaModel + capaV2Models + full routes + linkage from audit findings",
    gaps: ["Root-cause library not prebuilt", "No effectiveness-check statistical validation", "Preventive-action cross-module propagation weak"],
    aiAutomation: [
      "LLM suggests root cause + CAPA plan from deviation narrative (Veeva pilot: 75% cycle reduction)",
      "Preventive-action propagation — find similar risks across batches/lines/products, auto-open linked CAPAs",
      "Effectiveness-check scheduler with statistical-power calculator",
    ],
    competitorBenchmark: "Veeva AI Agents + AmpleLogic cite 40% faster closure, 30-40% fewer repeats. Hawkeye AskHawk can do this with additional prompting — not yet a dedicated flow.",
    moat: "CAPA→deviation→batch record linkage via cross-module audit trail is a platform edge.",
  },
  {
    key: "CHANGE_CONTROL", name: "Change Control",
    currentState: "FUNCTIONAL_BUT_BASIC",
    evidence: "changeControlModel with approvalSteps, riskLevel, impactAssessment — 6 routes — UI list view",
    gaps: ["No regulatory-impact auto-assessment", "No BOM/spec-diff engine", "No linkage to training assignment after change approval", "UI minimal — no impact-assessment detail view"],
    aiAutomation: [
      "Auto-classify change: notifiable vs. CBE-30 vs. PAS via LLM against FDA/EMA rulesets",
      "Spec-diff engine: diff BOM or batch formula between old/new rev — highlight validation triggers",
      "Auto-open training assignments when SOP rev is tied to a change",
    ],
    competitorBenchmark: "Veeva tight Vault RIM integration handles regulatory classification. ComplianceQuest has IoT-triggered change. Hawkeye needs both.",
    moat: "N/A — this is a catchup area.",
  },
  {
    key: "EVENT_MANAGEMENT", name: "Deviations / Event Mgmt",
    currentState: "FULLY_BUILT",
    evidence: "DeviationModel with FIVE_WHY, FISHBONE, FAULT_TREE methods + batch disposition + 10 routes",
    gaps: ["No AI-assisted 5-why", "No trending / signal detection across deviations", "No batch-record auto-link"],
    aiAutomation: [
      "LLM-assisted 5-why and fishbone from deviation narrative — pharma-tuned prompt library",
      "Signal detection: cluster similar deviations across batches/products, flag emerging trends to QA",
      "Automatic batch-record fetch + OOS/OOT contextualisation",
    ],
    competitorBenchmark: "TrackWise AI auto-summarisation + auto-categorisation is strong here. Veeva Agents score 75% cycle reduction claim.",
    moat: "Investigation methods (5-why, fishbone, fault-tree) modelled as structured data — can auto-populate with LLM.",
  },
  {
    key: "TRAINING_MANAGEMENT", name: "Training",
    currentState: "FULLY_BUILT",
    evidence: "TrainingRecordModel with Assessment, competencyLevel, nextRecurrenceDue + docControlId ref + frontend",
    gaps: ["No role-based curriculum auto-assignment on SOP rev", "No adaptive-difficulty assessments", "No SCORM/xAPI for external courseware", "No classroom-scheduling UI"],
    aiAutomation: [
      "Auto-generate read-and-understood assignments when an SOP rev is published",
      "LLM-drafted knowledge-check questions per SOP (with difficulty scaling)",
      "Compliance-gap dashboard: 'who hasn't trained on X rev' with auto-escalation",
    ],
    competitorBenchmark: "ComplianceWire is the training-LMS incumbent (3.6M users). Hawkeye competes on integrated training-tied-to-SOP — structurally better, feature-lighter.",
    moat: "Training tied to SOP revision graph (not just a separate LMS) — integrated approach wins when buyer wants a single platform.",
  },
  {
    key: "RISK_MANAGEMENT", name: "Risk",
    currentState: "FULLY_BUILT",
    evidence: "RiskItemModel with FMEA (Severity × Occurrence × Detectability → RPN), mitigations",
    gaps: ["No ICH Q9 quantitative Bayesian risk scoring", "No auto-trigger of CAPA on RPN threshold breach", "No risk heatmap dashboard"],
    aiAutomation: [
      "Bayesian risk scoring with prior-incident learning (feed deviation history into risk prior)",
      "Auto-CAPA when RPN crosses tenant-defined threshold",
      "LLM-generated risk scenarios from SOP + process description (scenario brainstormer)",
    ],
    competitorBenchmark: "ETQ Reliance uses Acerta for predictive risk. Hawkeye has the schema but not the modelling.",
    moat: "ICH Q9 FMEA modelled natively — easy to extend to AI-augmented scoring.",
  },
  {
    key: "SUPPLIER_QUALITY", name: "Supplier Quality",
    currentState: "FUNCTIONAL_BUT_BASIC",
    evidence: "supplierProfileModel + supplierRiskMetrics + publicSignal · read-only risk UI · network graph",
    gaps: ["No supplier-audit-to-CAPA closure loop", "No supplier scorecard trend analysis", "Risk-signal ingestion limited"],
    aiAutomation: [
      "Ingest FDA warning letters, EMA non-compliance, customs import-alerts → auto-update supplier risk score",
      "Supplier CAPA portal (supplier fills + signs; buyer reviews) — already partially built",
      "GenAI scorecard narrative generation for supplier committee review",
    ],
    competitorBenchmark: "Veeva Vault + ComplianceQuest have mature supplier quality; Hawkeye has the data model but needs closure-loop workflows.",
    moat: "Public-signal ingestion (FDA 483, warning letters) as first-class risk-score input is a differentiator.",
  },
  {
    key: "MANAGEMENT_REVIEW", name: "Management Review",
    currentState: "FULLY_BUILT",
    evidence: "ManagementReviewModel with InputSections + ActionItems + adequacyDecision — ISO 9001:2015 clause 9.3 compliant",
    gaps: ["No auto-populated KPI dashboard from cross-modules", "No AI exec-summary generator", "No recurring-MRM scheduler"],
    aiAutomation: [
      "Auto-populate MRM inputs: pull CAPA aging, audit findings, deviation trends, training gaps, supplier scorecards — all from one query",
      "LLM-drafted exec summary of quarter's quality state (read-ahead for executives)",
      "MRM recurring-schedule with Outlook/Google calendar hooks",
    ],
    competitorBenchmark: "Few competitors dedicate a module to MRM. Hawkeye is ahead structurally.",
    moat: "Native MRM module with inputs pulled from cross-module data is a structural advantage over CAPA-centric peers.",
  },
  {
    key: "ASSET_MANAGEMENT", name: "Asset / Equipment",
    currentState: "FULLY_BUILT",
    evidence: "EquipmentModel with CalibrationHistory + statuses + full CRUD · 21 CFR 211.68 tracking",
    gaps: ["No IoT telemetry ingestion (live temp/humidity/vibration)", "No auto-qualification via IoT readings", "No predictive maintenance"],
    aiAutomation: [
      "IoT ingestion (MQTT, OPC-UA) → auto-log calibration deviations + trigger CAPA",
      "Predictive maintenance: ML on run-time + vibration → MTBF prediction, open preventive-action before failure",
      "OCR on calibration certificate PDFs + auto-file against equipment",
    ],
    competitorBenchmark: "ComplianceQuest has IoT telemetry; Hawkeye needs it to match.",
    moat: "Equipment → batch-record linkage sets up IoT-to-disposition flow.",
  },
  {
    key: "CHAIN_OF_CUSTODY", name: "Chain of Custody",
    currentState: "SKELETON_ONLY",
    evidence: "workflowSubjectModel with custodyChain array · /coc-tracker page basic",
    gaps: ["No automated transfer audit trail", "No regulatory metadata per transfer", "No barcode/RFID ingestion", "No temperature-excursion alarms"],
    aiAutomation: [
      "Barcode/QR scan → auto-transfer record with timestamp + handler",
      "IoT temp-sensor integration → OOS alarm + CoC break detection",
      "LLM incident narrative generator when CoC breaks (drafts a deviation)",
    ],
    competitorBenchmark: "DSCSA-focused vendors (TraceLink, RfXcel) dominate package-level CoC. Hawkeye can position at the internal-process level.",
    moat: "Internal CoC (sample-to-lab, batch-to-warehouse) is under-served by DSCSA vendors — Hawkeye can own this niche.",
  },
  {
    key: "TRANSACTION_REVIEW", name: "Transaction Review",
    currentState: "SKELETON_ONLY",
    evidence: "TransactionReviewModel backend schema · no UI · no SAP/ERP integration",
    gaps: ["No UI", "No ERP integration", "No high-risk-transaction flagging logic", "No anti-fraud rules engine"],
    aiAutomation: [
      "Anomaly detection on procurement/sale transactions (counterparty risk)",
      "LLM-assisted due diligence for high-value transactions",
      "ERP push (SAP/NetSuite) webhook ingestion",
    ],
    competitorBenchmark: "Not a standard EQMS module — GRC-adjacent (LogicGate, NAVEX). Hawkeye can skip this or reposition as GRC.",
    moat: "N/A — consider de-scoping or re-positioning as GRC bridge.",
  },
  {
    key: "REGULATORY_INTEL", name: "Regulatory Intel",
    currentState: "FUNCTIONAL_BUT_BASIC",
    evidence: "fdaInspectionModel + fda483Model + fdaCitationModel + dashboard · FDA-only",
    gaps: ["FDA-only (no EMA, MHRA, PMDA, CDSCO)", "No change-control auto-trigger from reg update", "No supplier risk-score integration"],
    aiAutomation: [
      "Multi-agency RSS + AI summarisation (FDA, EMA, MHRA, PMDA, WHO, Health Canada, TGA)",
      "Auto-trigger change-control drafts when new regulation affects a tenant's products",
      "Warning-letter pattern mining: identify trending FDA concerns for tenant's product class",
    ],
    competitorBenchmark: "Qualio Compliance Intelligence (Oct 2025) covers FDA QMSR + ISO + MDSAP. Hawkeye's FDA dashboard is isolated — needs expansion.",
    moat: "Tenant-specific 'what applies to me' regulatory-feed with CAPA trigger is under-served industry-wide.",
  },
  {
    key: "AI_ASSISTANT", name: "AskHawk AI",
    currentState: "FULLY_BUILT",
    evidence: "Comprehensive RAG stack — 17 routes, conversations, policies, playbooks, unanswered tracking, KB ingest, evals",
    gaps: ["Single LLM vendor (OpenAI)", "In-memory embedding cache only — no vector DB (Pinecone/Weaviate)", "No tenant-specific KB isolation verified", "No feedback-loop to improve from unanswered"],
    aiAutomation: [
      "Pluggable LLM layer (Anthropic/OpenAI/Azure/local) — GxP/FDA may require on-prem LLM",
      "Dedicated vector DB (Pinecone/Weaviate/pgvector) — scale + tenant isolation",
      "Active-learning: close the unanswered-question loop into KB articles",
      "Grounding guarantees: every answer must cite a doc ID; no ungrounded generation",
    ],
    competitorBenchmark: "Dot Compliance's 'Dottie' is similar positioning. Veeva Agents + TrackWise AI are more mature.",
    moat: "AskHawk's cross-module tool invocation (getAuditSummary, listCapas, getEvidenceList) is a solid differentiator if verified grounded.",
  },
  {
    key: "RFQ_PROCUREMENT", name: "RFQ / Procurement",
    currentState: "FULLY_BUILT",
    evidence: "auditRfqModel + quoteModel + threadModel — full draft → publish → award flow",
    gaps: ["No auditor-rating-to-quote linkage", "No RFQ templates per audit type", "No auto-matching of auditor specialties"],
    aiAutomation: [
      "Auto-match auditors to RFQ by past audit performance + specialty tags",
      "LLM-drafted RFQ from audit-program context",
      "Quote-comparison dashboard with AI narrative on trade-offs",
    ],
    competitorBenchmark: "Unique in EQMS — most competitors assume in-house audit team. Hawkeye's model enables CDMOs to buy-in audits.",
    moat: "Major strategic differentiator — RFQ-to-auditor marketplace has no EQMS competitor.",
  },
];

const VERTICALS = [
  { key: "PHARMA_GMP", name: "Pharma GMP", regs: "21 CFR 210/211 · EU GMP + Annex 11 · ICH Q7 · ICH Q9 · ICH Q10 · WHO GMP · DSCSA", extrasModels: "Deviations, Batch Records, Qualification (IQ/OQ/PQ)", examples: "Big Pharma · Generics · CDMOs · Biotech", status: "Primary — live seed (Novex Pharma)" },
  { key: "MEDICAL_DEVICE", name: "Medical Device", regs: "ISO 13485:2016 · FDA QMSR (Feb 2026) · MDSAP · EU MDR/IVDR · ISO 14971 (risk)", extrasModels: "Design Controls, Complaints/PMS, Post-Market Surveillance, UDI, IFU/Labels", examples: "Class I–III devices · IVD · Combination products", status: "Module skeleton (design-controls, complaint-manager present)" },
  { key: "FOOD_SAFETY", name: "Food Safety", regs: "FSMA (US) · ISO 22000 · HACCP · SQF · BRCGS · FSSC 22000", extrasModels: "HACCP plans, Allergen management, Recall mgmt, Traceability (farm-to-fork)", examples: "Food manufacturing · beverage · ingredients", status: "Not built — module flag + industry profile ready" },
  { key: "AUTOMOTIVE", name: "Automotive", regs: "IATF 16949 · VDA 6.3 · APQP · PPAP · Core Tools (FMEA/MSA/SPC/Control Plan)", extrasModels: "APQP/PPAP packs, Control plans, Layered Process Audits, SPC", examples: "OEMs · Tier 1/2/3 suppliers", status: "Not built — module flag ready" },
  { key: "AEROSPACE", name: "Aerospace & Defence", regs: "AS9100D · AS9110C · AS9120B · NADCAP", extrasModels: "Configuration mgmt, FAI (First Article), Counterfeit-parts mgmt, Foreign Object Debris", examples: "OEM + MRO + Tier suppliers", status: "Not built" },
  { key: "ISO_9001", name: "ISO 9001 (generic)", regs: "ISO 9001:2015 · ISO 45001 (H&S) · ISO 27001 (info security) · ISO 14001 (environment)", extrasModels: "Context-of-org, Interested-parties register, Objectives tracker, Integrated-mgmt-system (IMS)", examples: "Any regulated manufacturing / services", status: "Module config + vocabulary overrides support this" },
  { key: "ORGANIC_FARMING", name: "Organic / Agri", regs: "USDA NOP · EU 2018/848 · JAS · COR · Fairtrade", extrasModels: "Field records, Input materials, Conversion-period tracking, Certifier audits", examples: "Farms · co-ops · ingredients suppliers", status: "Industry profile ready" },
  { key: "FOREST_COC", name: "Forestry / CoC", regs: "FSC Chain-of-Custody · PEFC · SBP", extrasModels: "Species tracking, Volume reconciliation, Input → output yield, Group certification", examples: "Forest managers · sawmills · paper mills", status: "Industry profile ready" },
  { key: "REAL_ESTATE", name: "Real Estate / AML", regs: "AML / KYC / UBO · FINTRAC (CA) · FinCEN (US) · OFAC · PEP lists · EDD", extrasModels: "Transaction review (already built schema), Beneficial-owner tracking, Suspicious-activity reports", examples: "Brokers · title · escrow · developer", status: "TransactionReview module present (backend only)" },
  { key: "HIGH_TICKET", name: "High-Ticket / Luxury AML", regs: "AML for art, precious stones, luxury goods · Basel AML Index · FATF", extrasModels: "Provenance tracking, Appraisal records, Beneficial-owner checks, Sanctions screening", examples: "Art dealers · luxury retail · gems/jewellery", status: "Not built — uses AML overlay" },
];

const PERSONAS_SUMMARY = [
  { group: "QA Leadership", count: 2, detail: "VP Quality (tenant_admin) · Head of QA (admin)" },
  { group: "EQMS Specialists", count: 4, detail: "QA Specialist · Doc Control · Training · Regulatory" },
  { group: "Internal Audit", count: 2, detail: "Audit Program Manager · Lead Auditor" },
  { group: "Auditee Departments", count: 3, detail: "Production Head · QC Lab · Maintenance" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ROADMAP — 24 months / 8 quarters. Each epic tagged by pack (board/engineering/both)
// ═══════════════════════════════════════════════════════════════════════════════

const ROADMAP = [
  {
    quarter: "Q1 2026", theme: "Harden foundations + ship Annex 11 package",
    epics: [
      { name: "Audit-trail hash-chaining + content-hash", pack: "both", detail: "Complete SHA-256 hash-chain in dataIntegrityLogModel. Every record change emits an immutable link. Output: cryptographic proof of record integrity to FDA inspectors." },
      { name: "Tenant-scope query middleware", pack: "engineering", detail: "Mongoose plugin auto-injects `tenantId` on all queries. Remove the risk of a developer forgetting the filter." },
      { name: "Observability baseline (Pino + Prometheus + Sentry)", pack: "engineering", detail: "Structured logs, metrics scrape, error tracking. Pre-requisite for SOC 2 and ISO 27001." },
      { name: "Annex 11 2026 compliance package", pack: "board", detail: "Deliver validation kit + config templates for the new Annex 11 draft reqs (cybersecurity, DR, AI validation). Pre-sell to EU pharma buyers." },
      { name: "Multi-framework doc-tagging (FDA + ISO 13485 + ISO 9001)", pack: "both", detail: "Like Qualio Compliance Intelligence. Tag one doc against many regs; dashboard shows coverage per framework." },
    ],
  },
  {
    quarter: "Q2 2026", theme: "AI-first deviation & CAPA",
    epics: [
      { name: "Deviation / CAPA AI co-pilot", pack: "both", detail: "LLM drafts RCA (5-why, fishbone) + CAPA plan from deviation narrative. Target: 40% cycle reduction (Veeva pilot parity)." },
      { name: "Pluggable LLM layer (Anthropic + OpenAI + on-prem)", pack: "engineering", detail: "Swap provider by tenant config. Required for customers that need on-prem LLM (GxP paranoia)." },
      { name: "Dedicated vector DB (pgvector or Pinecone)", pack: "engineering", detail: "Replace in-memory Map. Enable tenant-scoped KBs, larger corpora, faster retrieval." },
      { name: "AI Agent cost + quality dashboard", pack: "board", detail: "Per-tenant AI spend + accuracy + confidence distribution. Pricing lever." },
      { name: "Regulatory feed: EMA + MHRA + PMDA", pack: "both", detail: "Expand from FDA-only. Multi-agency RSS + LLM summariser + tenant-matching." },
    ],
  },
  {
    quarter: "Q3 2026", theme: "Workflow engine + industry packs v1",
    epics: [
      { name: "No-code workflow builder (state-machine editor)", pack: "both", detail: "Lift the existing workflowDefinition model into a visual editor. Tenants design their own CAPA approval chains without engineering." },
      { name: "Medical Device vertical (QMSR-ready)", pack: "both", detail: "Design Controls + Complaints/PMS pack. Target FDA QMSR Feb 2026 compliance. First industry-pack template." },
      { name: "ISO 9001 pack + vocabulary overlay", pack: "board", detail: "Strip pharma-specific language; ship ISO 9001 generic-manufacturing config. Open up the 6-8× larger vertical market." },
      { name: "MFA (TOTP + WebAuthn) + SSO (SAML + OIDC)", pack: "engineering", detail: "Wire the existing `requireMFA` flag. Add Okta/Azure AD SAML. Blocker for enterprise sales + SOC 2." },
      { name: "Outgoing webhooks + async job queue (BullMQ)", pack: "engineering", detail: "Move from polling cron to async eventing. Unblocks SAP/LIMS/MES push integrations." },
    ],
  },
  {
    quarter: "Q4 2026", theme: "Validation-as-code + data lake",
    epics: [
      { name: "Validation kit generator", pack: "both", detail: "Auto-generate IQ/OQ/PQ + RTM from tenant config. Cut validation effort from 6 months to 4 weeks (ValGenesis CSA parity)." },
      { name: "Data lake staging (S3 Iceberg / Snowflake)", pack: "engineering", detail: "Stream every AuditEvent + dataIntegrityLog to a data lake. Enables cross-tenant analytics (opt-in) and large-scale ML training." },
      { name: "Cross-module analytics dashboards", pack: "both", detail: "KPI dashboard spanning deviations + CAPAs + audits + training + supplier risk. Auto-populates MRM inputs." },
      { name: "Supplier public-signal ingestion (FDA 483/WL + import alerts)", pack: "both", detail: "Close the supplier-quality loop. Public compliance events auto-update risk score. Differentiator." },
      { name: "Food Safety vertical (FSMA + HACCP)", pack: "board", detail: "Second industry pack. Demonstrates the platform-of-platforms story." },
    ],
  },
  {
    quarter: "Q1 2027", theme: "Enterprise validation + marketplaces",
    epics: [
      { name: "Validated SaaS (delivered)", pack: "board", detail: "Published validation package — customers accept as-is; shortens sales cycle by 3-6 months." },
      { name: "Auditor marketplace scale-up", pack: "board", detail: "Move from 10s to 100s of vetted auditors. Global regions. Specialty tags (biologics, ADCs, combination products)." },
      { name: "IoT ingestion (MQTT/OPC-UA) for equipment + CoC", pack: "engineering", detail: "Live temp/humidity/vibration streams → auto-log calibration drift + CoC breaks → auto-CAPA." },
      { name: "Automotive vertical (IATF 16949 + APQP/PPAP)", pack: "board", detail: "Third industry pack. Tier 1/2/3 auto suppliers." },
      { name: "RBAC→ABAC + row-level security (CASL/OpenPolicyAgent)", pack: "engineering", detail: "Graduate from role strings to attribute-based policy. Enterprise reqs demand this." },
    ],
  },
  {
    quarter: "Q2 2027", theme: "Predictive quality + AI agents",
    epics: [
      { name: "Predictive deviation signal detection", pack: "both", detail: "ML on historical deviation streams — flag emerging process drift before it fails. (Acerta/ETQ parity.)" },
      { name: "AskHawk agentic workflows", pack: "both", detail: "AskHawk doesn't just answer — it acts. 'Close these 3 overdue CAPAs' with citations and e-sig requests." },
      { name: "Partner integration marketplace (SAP + Veeva + LIMS + MES)", pack: "board", detail: "Certified connector program. Turn integration from a 6-month blocker into an app-store install." },
      { name: "GxP + SOC 2 + ISO 27001 certifications", pack: "board", detail: "Audit certifications in-hand; unlocks enterprise tier. Typically adds 15-20% ACV." },
      { name: "Immutable-ledger anchoring (WORM storage + optional blockchain anchor)", pack: "engineering", detail: "Store hash chain in WORM S3 bucket + optional public-chain anchor. Tamper-proof to FDA standards." },
    ],
  },
  {
    quarter: "Q3 2027", theme: "Global scale + vertical roll-up",
    epics: [
      { name: "Multi-region deployment (US / EU / APAC)", pack: "engineering", detail: "Data residency compliance. Per-tenant region selection. MongoDB replica sets + regional object stores." },
      { name: "Aerospace + Forestry + Organic packs", pack: "board", detail: "Industry-pack factory — 3 new verticals shipped in a quarter via pack templates (time-to-market under 6 weeks each once engine is ready)." },
      { name: "Terraform / IaC for all infra", pack: "engineering", detail: "Full IaC — required for regulated deployments + DR drills." },
      { name: "Customer-admin toolkit (tenant onboarding self-serve)", pack: "both", detail: "New tenant goes from signup → first CAPA in <10 minutes. Reduces CSM load, enables PLG motion." },
    ],
  },
  {
    quarter: "Q4 2027", theme: "Platform maturity + adjacencies",
    epics: [
      { name: "GRC extension (Risk Register + Controls + Audit 2-in-1)", pack: "board", detail: "Extend upwards into GRC. Overlaps with LogicGate/AuditBoard but integrated with QMS data. Targets CFO buyer in addition to CQO." },
      { name: "Clinical adjacency (eTMF + CTMS hooks)", pack: "board", detail: "Light integration with clinical systems. Expands TAM into clinical ops." },
      { name: "FedRAMP Moderate in-process", pack: "engineering", detail: "FedRAMP entry. MasterControl Qx Gov parity. Unlocks government pharma + defence med." },
      { name: "AI-gen validation content + SOP authoring at scale", pack: "both", detail: "LLM-generated SOP first-drafts from regulatory source → editor → approval. Compresses doc-create time 10×." },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE — phased evolution (board view = simplified; eng view = detailed)
// ═══════════════════════════════════════════════════════════════════════════════

const ARCHITECTURE = {
  currentState: {
    name: "Today (Q4 2025)",
    mermaid: `flowchart LR
      classDef ok fill:#059669,color:#fff,stroke:#065f46
      classDef gap fill:#dc2626,color:#fff,stroke:#7f1d1d
      classDef ext fill:#64748b,color:#fff,stroke:#334155
      Client[Next.js Frontend<br/>Vercel]:::ok
      API[Express API<br/>Vercel serverless]:::ok
      Mongo[(MongoDB Atlas<br/>multi-tenant via field)]:::ok
      Audit[auditEvent +<br/>dataIntegrityLog]:::ok
      LLM[OpenAI only<br/>embedding-3-small]:::gap
      Cache[In-memory Map<br/>no Redis]:::gap
      Obs[No structured logs<br/>no metrics<br/>no tracing]:::gap
      Bus[Polling cron jobs<br/>no event bus]:::gap
      Client --> API
      API --> Mongo
      API --> Audit
      API --> LLM
      API --> Cache
      API -.-> Obs
      API -.-> Bus`,
    gaps: [
      "Multi-tenancy enforced by convention, not middleware",
      "Hash-chaining fields exist but never computed",
      "No observability (no Pino/Prometheus/OTel/Sentry)",
      "No async queue, no outgoing webhooks",
      "Single-vendor LLM (OpenAI)",
      "No SSO/MFA implementation (flags only)",
      "No IaC, no multi-region, no DR",
    ],
  },
  phase1: {
    name: "Phase 1 · Q1–Q2 2026 — Trust Layer",
    mermaid: `flowchart LR
      classDef new fill:#2563eb,color:#fff,stroke:#1e3a8a
      classDef ok fill:#059669,color:#fff,stroke:#065f46
      Client[Next.js FE]:::ok
      API[Express API +<br/>tenant-scope middleware]:::new
      Mongo[(MongoDB)]:::ok
      LLM[LLM Gateway<br/>Anthropic · OpenAI · local]:::new
      Vector[(pgvector · Pinecone<br/>vector DB)]:::new
      Chain[Hash-chain engine<br/>SHA-256 + Merkle]:::new
      Obs[Pino + Prometheus<br/>+ Sentry + OTel]:::new
      Queue[BullMQ queue<br/>+ outgoing webhooks]:::new
      Client --> API
      API --> Mongo
      API --> LLM
      LLM --> Vector
      API --> Chain
      Chain --> Mongo
      API --> Queue
      API --> Obs`,
    delivers: ["Integrity proofs for FDA", "Observability for SOC 2", "Multi-LLM + scalable RAG", "Async-first eventing"],
  },
  phase2: {
    name: "Phase 2 · Q3–Q4 2026 — Platform Layer",
    mermaid: `flowchart LR
      classDef new fill:#7c3aed,color:#fff,stroke:#4c1d95
      classDef ok fill:#059669,color:#fff,stroke:#065f46
      Client[Next.js FE<br/>+ workflow builder]:::new
      API[Express API]:::ok
      WF[No-code workflow engine<br/>visual state-machine]:::new
      Packs[Industry-pack registry<br/>Pharma · Device · ISO 9001]:::new
      Mongo[(MongoDB)]:::ok
      Lake[(Data lake<br/>S3 Iceberg / Snowflake)]:::new
      SSO[SAML + OIDC + WebAuthn<br/>MFA enforced]:::new
      ABAC[Row-level security<br/>CASL / OPA]:::new
      Client --> API
      API --> WF
      WF --> Packs
      API --> Mongo
      Mongo -->|CDC stream| Lake
      API --> SSO
      API --> ABAC`,
    delivers: ["Tenant-authored workflows", "Multi-vertical in one platform", "Enterprise auth story", "Analytics at lake scale"],
  },
  phase3: {
    name: "Phase 3 · Q1–Q2 2027 — Validated SaaS + IoT + Agentic AI",
    mermaid: `flowchart LR
      classDef new fill:#ea580c,color:#fff,stroke:#9a3412
      classDef ok fill:#059669,color:#fff,stroke:#065f46
      IoT[MQTT · OPC-UA<br/>ingestion gateway]:::new
      API[Express API<br/>+ validation engine]:::ok
      Mongo[(MongoDB)]:::ok
      Lake[(Data lake)]:::ok
      Agents[AskHawk Agents<br/>action-taking with<br/>grounded citations]:::new
      VK[Validation-kit generator<br/>IQ/OQ/PQ/RTM from config]:::new
      Ledger[(WORM storage<br/>+ optional chain anchor)]:::new
      IoT --> API
      API --> Mongo
      API --> Lake
      API --> Agents
      API --> VK
      Mongo --> Ledger`,
    delivers: ["Live IoT → CAPA", "Validated SaaS (delivered)", "Agentic AI (acts, not just answers)", "Tamper-proof immutable records"],
  },
  phase4: {
    name: "Phase 4 · Q3–Q4 2027 — Global Scale + Adjacencies",
    mermaid: `flowchart LR
      classDef new fill:#ef4444,color:#fff,stroke:#7f1d1d
      classDef ok fill:#059669,color:#fff,stroke:#065f46
      US[US Region<br/>MongoDB + S3]:::ok
      EU[EU Region<br/>MongoDB + S3]:::new
      APAC[APAC Region<br/>MongoDB + S3]:::new
      Control[Global control plane<br/>Terraform · K8s]:::new
      Mkt[Integration marketplace<br/>SAP · Veeva · LIMS · MES]:::new
      GRC[GRC overlay<br/>Risk · Controls · Audit]:::new
      Clinical[Clinical hooks<br/>eTMF · CTMS]:::new
      Control --> US & EU & APAC
      Control --> Mkt
      Control --> GRC
      Control --> Clinical`,
    delivers: ["Data residency per region", "Partner ecosystem (PLG)", "GRC + Clinical adjacencies", "FedRAMP Moderate in-process"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HTML BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

const CSS = /* css */`
:root {
  --bg: #f8fafc; --panel:#ffffff; --ink:#0f172a; --dim:#64748b;
  --blue:#2563eb; --green:#059669; --purple:#7c3aed; --orange:#ea580c; --red:#dc2626; --amber:#f59e0b;
  --border:#e2e8f0; --hover:#f1f5f9;
}
* { box-sizing: border-box; }
body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:13px; line-height:1.55; color:var(--ink); background:var(--bg); }
.page { max-width:1150px; margin:0 auto; padding:28px; }
.cover { background:linear-gradient(135deg,#1e3a8a 0%,#7c3aed 100%); color:#fff; padding:56px 48px; border-radius:12px; margin-bottom:32px; }
.cover h1 { margin:0 0 10px 0; font-size:34px; letter-spacing:-0.02em; }
.cover p { margin:4px 0; font-size:15px; opacity:0.94; }
.cover .meta { margin-top:20px; display:flex; gap:12px; flex-wrap:wrap; font-size:12px; }
.cover .meta span { background:rgba(255,255,255,0.15); padding:6px 12px; border-radius:6px; }

h2 { font-size:22px; margin:0 0 14px 0; padding-bottom:8px; border-bottom:2px solid var(--blue); color:var(--ink); }
h3 { font-size:16px; margin:20px 0 8px 0; }
h4 { font-size:13px; margin:14px 0 6px 0; color:var(--dim); text-transform:uppercase; letter-spacing:0.04em; }
p { margin:6px 0; }

.tabs { background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:32px; }
.tabs input[type=radio]{ display:none; }
.tab-labels { display:flex; background:#f1f5f9; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.tab-labels label { flex:1; padding:12px 14px; cursor:pointer; font-weight:600; font-size:12px; text-align:center; color:var(--dim); border-right:1px solid var(--border); transition:all 0.15s; min-width:110px; }
.tab-labels label:last-child { border-right:none; }
.tab-labels label:hover { background:#e2e8f0; color:var(--ink); }
.tab-content { display:none; padding:28px; background:var(--panel); }
#t1:checked ~ .tab-labels label[for=t1], #t2:checked ~ .tab-labels label[for=t2], #t3:checked ~ .tab-labels label[for=t3], #t4:checked ~ .tab-labels label[for=t4], #t5:checked ~ .tab-labels label[for=t5], #t6:checked ~ .tab-labels label[for=t6], #t7:checked ~ .tab-labels label[for=t7], #t8:checked ~ .tab-labels label[for=t8] { background:var(--panel); color:var(--blue); border-bottom:3px solid var(--blue); }
#t1:checked ~ #c1, #t2:checked ~ #c2, #t3:checked ~ #c3, #t4:checked ~ #c4, #t5:checked ~ #c5, #t6:checked ~ #c6, #t7:checked ~ #c7, #t8:checked ~ #c8 { display:block; }

.card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:12px; }
.card.pinstripe { border-left:4px solid var(--blue); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.pill { display:inline-block; padding:3px 9px; border-radius:12px; background:#eef2ff; color:#4338ca; font-size:10px; font-weight:700; margin:1px 2px; }
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; color:#fff; margin-right:4px; }
.badge.built { background:var(--green); } .badge.basic { background:var(--amber); } .badge.skeleton { background:var(--red); } .badge.notbuilt { background:#64748b; }
a { color:var(--blue); }
code { font-family:Menlo,Consolas,monospace; background:#f1f5f9; padding:1px 5px; border-radius:3px; font-size:11px; }

table.mtx { width:100%; border-collapse:collapse; font-size:11px; margin:10px 0; }
table.mtx th, table.mtx td { padding:7px 9px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
table.mtx th { background:#f1f5f9; font-weight:700; color:var(--dim); text-transform:uppercase; font-size:9px; letter-spacing:0.05em; }
table.mtx tr:nth-child(even){ background:#fafafa; }
table.mtx td.center, table.mtx th.center { text-align:center; }
table.mtx td.hawk { background:#eef2ff; font-weight:600; }

.flow { background:#fafafa; border:1px solid var(--border); border-radius:8px; padding:16px; margin:10px 0; }
.flow h4 { margin-top:0; color:var(--ink); text-transform:none; letter-spacing:0; font-size:13px; font-weight:700; }

.module { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:12px; page-break-inside:avoid; }
.module header { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
.module header h3 { margin:0; font-size:15px; }

.scenario { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:12px; page-break-inside:avoid; }
.scenario .num { display:inline-block; width:24px; height:24px; line-height:24px; border-radius:50%; background:var(--blue); color:#fff; text-align:center; font-weight:700; margin-right:8px; font-size:11px; }

.epic { border-left:4px solid var(--purple); padding:10px 14px; background:#fafafa; border-radius:6px; margin-bottom:10px; }
.epic header { display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
.epic header h4 { margin:0; text-transform:none; letter-spacing:0; color:var(--ink); font-size:13px; font-weight:700; }
.epic.board { border-left-color:var(--green); }
.epic.engineering { border-left-color:var(--purple); }
.epic.both { border-left-color:var(--blue); }
.epic .tag { font-size:9px; font-weight:700; padding:2px 7px; border-radius:10px; text-transform:uppercase; }
.epic .tag.board { background:var(--green); color:#fff; }
.epic .tag.engineering { background:var(--purple); color:#fff; }
.epic .tag.both { background:var(--blue); color:#fff; }

.quarter { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:14px; }
.quarter header { display:flex; align-items:baseline; gap:10px; margin-bottom:8px; }
.quarter header .q-badge { background:var(--blue); color:#fff; font-weight:700; padding:4px 10px; border-radius:6px; font-size:11px; }
.quarter header h3 { margin:0; font-size:15px; }

.kpi-band { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:14px 0; }
.kpi { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center; }
.kpi .big { font-size:22px; font-weight:800; color:var(--blue); }
.kpi .lbl { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:0.05em; margin-top:4px; }

@media print {
  body { background:#fff; font-size:10.5px; }
  .page { padding:6px; max-width:100%; }
  .tabs { border:none; margin:0; box-shadow:none; border-radius:0; }
  .tab-labels { display:none; }
  .tab-content { display:block !important; padding:0; border-top:2px solid var(--blue); margin-top:20px; padding-top:14px; page-break-before:always; }
  .tab-content:first-of-type { page-break-before:auto; }
  .tab-content::before { content:attr(data-title); display:block; font-size:22px; font-weight:700; color:var(--blue); border-bottom:2px solid var(--blue); padding-bottom:4px; margin-bottom:14px; }
  .cover { padding:36px 28px; page-break-after:always; }
  .module, .scenario, .epic, .quarter, .card { page-break-inside:avoid; }
  a { color:inherit; text-decoration:none; }
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PACK BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function renderMarketSizingTable() {
  return `
    <table class="mtx">
      <thead><tr><th>Segment</th><th class="center">2024-25 (USD B)</th><th class="center">2030 (USD B)</th><th class="center">CAGR</th><th>Source</th></tr></thead>
      <tbody>
        ${MARKET.sizing.map(s => `
          <tr>
            <td>${s.label}</td>
            <td class="center">${s.y2025.toFixed(2)}</td>
            <td class="center">${s.y2030.toFixed(2)}</td>
            <td class="center">${s.cagr.toFixed(1)}%</td>
            <td><a href="${s.url}" target="_blank">${s.src}</a></td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderCompetitorMatrix() {
  return `
    <table class="mtx">
      <thead><tr><th>Vendor</th><th class="center">Cloud-native</th><th class="center">Pharma focus /5</th><th class="center">AI maturity /5</th><th class="center">Ease of validation /5</th><th>Annual cost</th><th>Sweet-spot size</th></tr></thead>
      <tbody>
        ${COMPETITOR_MATRIX.map(c => {
          const comp = COMPETITORS.find(x => x.id === c.id);
          return `<tr>
            <td><strong>${comp.name}</strong></td>
            <td class="center">${c.cloud}</td>
            <td class="center">${c.pharma}</td>
            <td class="center">${c.ai}</td>
            <td class="center">${c.validation}</td>
            <td>${c.cost}</td>
            <td>${c.size}</td>
          </tr>`;
        }).join("")}
        <tr>
          <td class="hawk"><strong>Hawkeye (us)</strong></td>
          <td class="hawk center">${HAWKEYE_MATRIX_SELF.cloud}</td>
          <td class="hawk center">${HAWKEYE_MATRIX_SELF.pharma}</td>
          <td class="hawk center">${HAWKEYE_MATRIX_SELF.ai}</td>
          <td class="hawk center">${HAWKEYE_MATRIX_SELF.validation}</td>
          <td class="hawk">${HAWKEYE_MATRIX_SELF.cost}</td>
          <td class="hawk">${HAWKEYE_MATRIX_SELF.size}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function renderCompetitorCards() {
  return COMPETITORS.map(c => `
    <div class="module">
      <header><h3>${c.name}</h3><a href="${c.url}" target="_blank" style="font-size:11px;">source</a></header>
      <p><em>${c.positioning}</em></p>
      <div class="grid2" style="margin-top:8px;">
        <div><h4>Deployment</h4><p>${c.deployment}</p></div>
        <div><h4>Pricing</h4><p>${c.pricing}</p></div>
      </div>
      <div class="grid2">
        <div><h4>Strongest modules</h4><p>${c.strongest.map(m => `<span class="pill">${m}</span>`).join(" ")}</p></div>
        <div><h4>Validation stance</h4><p>${c.validation}</p></div>
      </div>
      <div><h4>AI features</h4><p>${c.ai}</p></div>
      <div><h4>Integrations</h4><p>${c.integrations}</p></div>
      <div><h4>Known weaknesses</h4><p style="color:var(--red);">${c.weakness}</p></div>
    </div>
  `).join("");
}

function renderRoadmapQuarters(pack) {
  return ROADMAP.map(q => {
    const eps = pack === "board"
      ? q.epics.filter(e => e.pack === "board" || e.pack === "both")
      : pack === "engineering"
        ? q.epics.filter(e => e.pack === "engineering" || e.pack === "both")
        : q.epics;
    if (!eps.length) return "";
    return `
      <div class="quarter">
        <header><span class="q-badge">${q.quarter}</span><h3>${q.theme}</h3></header>
        ${eps.map(e => `
          <div class="epic ${e.pack}">
            <header><h4>${e.name}</h4><span class="tag ${e.pack}">${e.pack}</span></header>
            <p style="margin:6px 0 0 0;">${e.detail}</p>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");
}

function renderModules() {
  return MODULES.map(m => {
    const badgeCls = m.currentState === "FULLY_BUILT" ? "built"
      : m.currentState === "FUNCTIONAL_BUT_BASIC" ? "basic"
      : m.currentState === "SKELETON_ONLY" ? "skeleton" : "notbuilt";
    return `
      <div class="module">
        <header>
          <h3>${m.name} <code>${m.key}</code></h3>
          <span class="badge ${badgeCls}">${m.currentState.replace(/_/g, " ")}</span>
        </header>
        <p><strong>Current evidence:</strong> ${m.evidence}</p>
        <h4>Gaps</h4>
        <ul>${m.gaps.map(g => `<li>${g}</li>`).join("")}</ul>
        <h4>AI / Automation opportunities</h4>
        <ol>${m.aiAutomation.map(a => `<li>${a}</li>`).join("")}</ol>
        <div class="grid2">
          <div><h4>vs competitors</h4><p>${m.competitorBenchmark}</p></div>
          <div><h4>Hawkeye moat</h4><p>${m.moat}</p></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderVerticals() {
  return VERTICALS.map(v => `
    <div class="module">
      <header>
        <h3>${v.name} <code>${v.key}</code></h3>
        <span class="badge ${v.status.startsWith("Primary") ? "built" : v.status.startsWith("Module") ? "basic" : "notbuilt"}">${v.status}</span>
      </header>
      <div class="grid2">
        <div><h4>Regulations</h4><p>${v.regs}</p></div>
        <div><h4>Vertical-specific models</h4><p>${v.extrasModels}</p></div>
      </div>
      <div><h4>Customer examples</h4><p>${v.examples}</p></div>
    </div>
  `).join("");
}

function renderArchitecturePhase(phase) {
  return `
    <div class="flow">
      <h4>${phase.name}</h4>
      <div class="mermaid">${phase.mermaid}</div>
      ${phase.gaps ? `<h4>Gaps</h4><ul>${phase.gaps.map(g => `<li>${g}</li>`).join("")}</ul>` : ""}
      ${phase.delivers ? `<h4>Delivers</h4><ul>${phase.delivers.map(d => `<li>${d}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD PACK
// ═══════════════════════════════════════════════════════════════════════════════

function buildBoardHtml() {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><title>Hawkeye · Pharma Strategy · Board & Investor Pack</title>
<style>${CSS}</style>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad:true, securityLevel:"loose", theme:"default" });
</script>
</head><body>
<div class="page">

<section class="cover">
  <h1>Hawkeye · Pharma EQMS</h1>
  <p style="font-size:18px; font-weight:500;">Board &amp; Investor Pack · 24-Month Strategic Plan</p>
  <p>Market sizing · Competitive positioning · Product vision · Revenue arc · Milestones</p>
  <div class="meta">
    <span>Vertical: Pharma GMP</span>
    <span>Horizon: Q1 2026 → Q4 2027</span>
    <span>Generated: ${new Date().toISOString().slice(0,10)}</span>
  </div>
</section>

<div class="tabs">
  <input type="radio" id="t1" name="tabs" checked><input type="radio" id="t2" name="tabs">
  <input type="radio" id="t3" name="tabs"><input type="radio" id="t4" name="tabs">
  <input type="radio" id="t5" name="tabs"><input type="radio" id="t6" name="tabs">
  <input type="radio" id="t7" name="tabs"><input type="radio" id="t8" name="tabs">
  <div class="tab-labels">
    <label for="t1">1 · Exec Summary</label>
    <label for="t2">2 · Market</label>
    <label for="t3">3 · Competitors</label>
    <label for="t4">4 · Differentiation</label>
    <label for="t5">5 · Product Vision</label>
    <label for="t6">6 · Roadmap</label>
    <label for="t7">7 · Verticals</label>
    <label for="t8">8 · Asks</label>
  </div>

  <!-- ═══ 1 · EXEC SUMMARY ═══ -->
  <div class="tab-content" id="c1" data-title="1 · Executive Summary">
    <h2>Executive summary</h2>
    <p><strong>Hawkeye is an AI-first, multi-industry EQMS platform</strong> that starts with pharma GMP and extends to medical device, food safety, automotive, aerospace, ISO 9001 and AML verticals from a shared architecture. We compete with MasterControl, Veeva Vault QMS, TrackWise Digital, Qualio, Dot Compliance, and ComplianceQuest on the mid-market pharma + CDMO segment — the segment growing fastest while the incumbents battle over Big Pharma.</p>

    <div class="kpi-band">
      <div class="kpi"><div class="big">$1.87B</div><div class="lbl">Pharma QMS (2024)</div></div>
      <div class="kpi"><div class="big">13.0%</div><div class="lbl">CAGR through 2030</div></div>
      <div class="kpi"><div class="big">$600M</div><div class="lbl">Mid-market SAM (2026)</div></div>
      <div class="kpi"><div class="big">50–100</div><div class="lbl">Target accounts in 5 yrs</div></div>
    </div>

    <h3>Why Hawkeye wins</h3>
    <div class="grid2">
      <div class="card pinstripe"><h4>AI-first + auditor marketplace</h4><p>AskHawk RAG spans every EQMS module. <strong>RFQ-to-auditor marketplace</strong> is structurally unique — no EQMS competitor sells third-party audit capacity. This is a wedge for CDMOs and mid-market buyers without in-house audit teams.</p></div>
      <div class="card pinstripe"><h4>Multi-vertical from day one</h4><p>Module config already supports PHARMA_GMP, MEDICAL_DEVICE, FOOD_SAFETY, ISO_9001, ORGANIC_FARMING, FOREST_COC, REAL_ESTATE. One platform, many industry packs — instead of one pharma-only silo.</p></div>
      <div class="card pinstripe"><h4>Under-served mid-market</h4><p>Veeva + MasterControl aim at Big Pharma ($1M+ ACV, 12-18 month cycles). Qualio + Dot Compliance hit SMB-to-mid. <strong>Hawkeye targets mid-market + CDMOs ($150K ACV, 6-month cycles)</strong> with full-EQMS depth, not CAPA-only toy apps.</p></div>
      <div class="card pinstripe"><h4>Immutable + validated by design</h4><p>Hash-chained audit trail + content-hash integrity + validated SaaS package are on the 12-month roadmap. We turn validation from a 6-month customer effort to a 4-week accept-as-is delivery.</p></div>
    </div>

    <h3>24-month milestones</h3>
    <div class="grid2">
      <div class="card"><h4>End of 2026 (12 months)</h4><ul>
        <li>Annex 11 2026 compliance package live</li>
        <li>AI CAPA/Deviation co-pilot (40% cycle reduction)</li>
        <li>Medical Device vertical shipped (QMSR-ready)</li>
        <li>10–20 pharma + CDMO accounts · $2M–$3M ARR</li>
      </ul></div>
      <div class="card"><h4>End of 2027 (24 months)</h4><ul>
        <li>Validated SaaS delivered (sales cycle cut 3-6 mo)</li>
        <li>5+ industry verticals live (Pharma · Device · Food · Auto · ISO 9001)</li>
        <li>SOC 2 + ISO 27001 certified; FedRAMP Moderate in-process</li>
        <li>50–100 accounts · $6M–$15M ARR</li>
      </ul></div>
    </div>
  </div>

  <!-- ═══ 2 · MARKET ═══ -->
  <div class="tab-content" id="c2" data-title="2 · Market">
    <h2>Market sizing &amp; tailwinds</h2>
    <p>${MARKET.headline}</p>

    ${renderMarketSizingTable()}

    <h3>Geographic distribution</h3>
    <div class="grid3">
      <div class="card"><h4>North America</h4><p>${MARKET.geographic.northAmerica}</p></div>
      <div class="card"><h4>Europe</h4><p>${MARKET.geographic.europe}</p></div>
      <div class="card"><h4>APAC</h4><p>${MARKET.geographic.apac}</p></div>
    </div>

    <h3>Pharma tailwinds driving EQMS spend</h3>
    ${MARKET.tailwinds.map(t => `
      <div class="card pinstripe"><h4>${t.name}</h4><p>${t.detail} <a href="${t.url}" target="_blank">source</a></p></div>
    `).join("")}

    <h3>Sub-segments ranked by EQMS spend growth</h3>
    <table class="mtx">
      <thead><tr><th class="center">Rank</th><th>Segment</th><th>Why they're buying</th></tr></thead>
      <tbody>${MARKET.sharesByCustomer.map(s => `<tr><td class="center"><strong>${s.rank}</strong></td><td><strong>${s.name}</strong></td><td>${s.reason}</td></tr>`).join("")}</tbody>
    </table>

    <h3>Disruptive shifts right now</h3>
    ${MARKET.shifts.map(s => `<div class="card"><h4>${s.name}</h4><p>${s.detail} ${s.url ? `<a href="${s.url}" target="_blank">source</a>` : ""}</p></div>`).join("")}

    <h3>Buyer profile (mid-size pharma)</h3>
    <div class="grid2">
      <div class="card"><h4>Economic buyer</h4><p>${MARKET.buyerProfile.economicBuyer}</p></div>
      <div class="card"><h4>Influencers</h4><p>${MARKET.buyerProfile.influencers}</p></div>
      <div class="card"><h4>Sales cycle</h4><p>${MARKET.buyerProfile.salesCycle}</p></div>
      <div class="card"><h4>Typical ACV</h4><p>${MARKET.buyerProfile.typicalACV}</p></div>
    </div>
    <div class="card pinstripe"><h4>Deal blockers</h4><p>${MARKET.buyerProfile.blockers}</p></div>
    <p style="font-size:11px; color:var(--dim);">Sources: ${MARKET.buyerProfile.sources.map(s => `<a href="${s.url}" target="_blank">${s.label}</a>`).join(" · ")}</p>

    <h3>Hawkeye TAM / SAM / SOM</h3>
    <div class="kpi-band">
      <div class="kpi"><div class="big">${MARKET.tamSamSom.tam.range.split(" ")[0]}</div><div class="lbl">TAM (2030)</div></div>
      <div class="kpi"><div class="big">${MARKET.tamSamSom.sam.range.split(",")[1]?.trim() || "~$1.1B"}</div><div class="lbl">SAM (2030)</div></div>
      <div class="kpi"><div class="big">$6-15M</div><div class="lbl">SOM ARR 5-yr</div></div>
      <div class="kpi"><div class="big">50-100</div><div class="lbl">Target accounts</div></div>
    </div>
    <p><strong>TAM:</strong> ${MARKET.tamSamSom.tam.range} — ${MARKET.tamSamSom.tam.logic}</p>
    <p><strong>SAM:</strong> ${MARKET.tamSamSom.sam.range} — ${MARKET.tamSamSom.sam.logic}</p>
    <p><strong>SOM:</strong> ${MARKET.tamSamSom.som.range} — ${MARKET.tamSamSom.som.logic}</p>
    <p style="font-size:11px; color:var(--dim);"><em>${MARKET.tamSamSom.note}</em></p>
  </div>

  <!-- ═══ 3 · COMPETITORS ═══ -->
  <div class="tab-content" id="c3" data-title="3 · Competitors">
    <h2>Competitive landscape — pharma EQMS</h2>
    <p>11 active competitors span the pricing spectrum from $12K/yr (Qualio) to $1M+/yr (Veeva, TrackWise). None has broken out of pharma-only; none has an auditor marketplace; most lack multi-vertical industry packs.</p>

    ${renderCompetitorMatrix()}

    <h3>Competitor profiles</h3>
    ${renderCompetitorCards()}
  </div>

  <!-- ═══ 4 · DIFFERENTIATION ═══ -->
  <div class="tab-content" id="c4" data-title="4 · Differentiation">
    <h2>Hawkeye's strategic moats</h2>

    <div class="grid2">
      <div class="card pinstripe"><h4>1. Auditor marketplace (RFQ → award)</h4><p>The only EQMS with a built-in third-party auditor marketplace. CDMOs + mid-market buy audit capacity on-demand. RFQ + quote comparison + rating system. <strong>No competitor ships this.</strong></p></div>
      <div class="card pinstripe"><h4>2. Multi-industry from one codebase</h4><p>Module config + vocabulary overlay → one platform, 7+ industry packs. MasterControl + Veeva are pharma-only; Qualio is life-sci-only; ETQ is multi-industry but pharma-weak. <strong>Hawkeye is the only platform architected for pharma-depth AND multi-vertical breadth.</strong></p></div>
      <div class="card pinstripe"><h4>3. AskHawk — cross-module AI assistant</h4><p>17-route AI stack with tool-calling across audit/CAPA/evidence. Peers have per-module AI (Veeva Agents, TrackWise AI). <strong>Hawkeye's AskHawk bridges modules and takes actions, not just answers.</strong></p></div>
      <div class="card pinstripe"><h4>4. Redacted-view document model</h4><p>Doc-control serves auditor-safe redacted views from the same source of truth. <strong>Rare primitive — enables confidential supplier audits without data leakage.</strong></p></div>
      <div class="card pinstripe"><h4>5. Public-signal supplier risk</h4><p>FDA 483, warning letters, import alerts feed directly into supplier risk scores. <strong>Competitors require manual risk inputs; Hawkeye's is automated.</strong></p></div>
      <div class="card pinstripe"><h4>6. Immutable records by default</h4><p>Hash-chain + dataIntegrityLog + ALCOA+ model built-in. On the roadmap: WORM anchoring + optional blockchain proof. <strong>Turns FDA integrity proof from a 6-week exercise to a single API call.</strong></p></div>
    </div>

    <h3>Where Hawkeye is behind (catch-up list)</h3>
    <div class="grid2">
      <div class="card"><h4>Validation kits</h4><p>Qualio + Dot + MasterControl ship pre-validated packages. Hawkeye's is on the Q4 2026 roadmap.</p></div>
      <div class="card"><h4>SSO + MFA</h4><p>Enterprise table-stakes. <code>requireMFA</code> flag exists but not wired. Q3 2026.</p></div>
      <div class="card"><h4>Multi-LLM + vector DB</h4><p>OpenAI + in-memory today. Q2 2026 upgrade.</p></div>
      <div class="card"><h4>Integration marketplace</h4><p>SAP/Veeva/LIMS/MES connectors as a product — Q2 2027.</p></div>
    </div>
  </div>

  <!-- ═══ 5 · PRODUCT VISION ═══ -->
  <div class="tab-content" id="c5" data-title="5 · Product Vision">
    <h2>Product vision — 24-month arc</h2>
    <p>Three narratives compound over 24 months: <strong>trust</strong> (immutable audit trail + validated SaaS), <strong>intelligence</strong> (AI that takes action, not just answers), and <strong>reach</strong> (multi-vertical industry packs). Each phase builds on the last.</p>

    ${renderArchitecturePhase(ARCHITECTURE.currentState)}
    ${renderArchitecturePhase(ARCHITECTURE.phase1)}
    ${renderArchitecturePhase(ARCHITECTURE.phase2)}
    ${renderArchitecturePhase(ARCHITECTURE.phase3)}
    ${renderArchitecturePhase(ARCHITECTURE.phase4)}
  </div>

  <!-- ═══ 6 · ROADMAP ═══ -->
  <div class="tab-content" id="c6" data-title="6 · Roadmap (board view)">
    <h2>24-month roadmap · board-relevant initiatives</h2>
    <p>Only epics tagged <strong>board</strong> or <strong>both</strong> are shown. For the full engineering view, see the Engineering pack.</p>
    ${renderRoadmapQuarters("board")}
  </div>

  <!-- ═══ 7 · VERTICALS ═══ -->
  <div class="tab-content" id="c7" data-title="7 · Industry Verticals">
    <h2>Beyond pharma — multi-vertical opportunity</h2>
    <p>The same module config + vocabulary overlay that powers pharma supports every major regulated industry. Industry packs ship in 6-week cycles once the vertical-factory engine (Q3 2026) is live.</p>
    <p><strong>Broader QMS market:</strong> USD 12.52B (2025) → USD 31.54B (2034) at 10.81% CAGR — roughly <strong>6–8× the pharma-only envelope</strong>. Pharma is 12–15% of the total. (<a href="https://www.fortunebusinessinsights.com/industry-reports/quality-management-software-market-100761" target="_blank">Fortune BI</a>)</p>
    ${renderVerticals()}
  </div>

  <!-- ═══ 8 · ASKS ═══ -->
  <div class="tab-content" id="c8" data-title="8 · Investment Asks">
    <h2>What we're asking for</h2>
    <div class="grid2">
      <div class="card pinstripe"><h4>Capital</h4><p>Enables: engineering build-out of Phase 1 + 2 (trust layer + platform layer), go-to-market team for mid-market pharma + CDMO, validation-kit + certification investments (SOC 2, ISO 27001, FedRAMP entry).</p></div>
      <div class="card pinstripe"><h4>Design partners</h4><p>5–10 mid-market pharma + CDMO logos at friends-and-family pricing. Their production use drives the validation kit, Annex 11 package, and Medical Device vertical.</p></div>
      <div class="card pinstripe"><h4>Advisory</h4><p>QA exec bench (ex-FDA, ex-Big Pharma quality). Two SEs with MasterControl/Veeva deployment experience. A CFO-bench member.</p></div>
      <div class="card pinstripe"><h4>Partnerships</h4><p>Referral partnerships with CROs/CDMOs, validation consultancies, Big-4 life-sciences practices. CRO/CDMO-tied deal flow closes 50% faster.</p></div>
    </div>

    <h3>Key risks + mitigations</h3>
    <div class="grid2">
      <div class="card"><h4>Validation delays sales cycle</h4><p>Mitigate: ship validated SaaS (Q4 2026) → shrink cycle 3-6 months.</p></div>
      <div class="card"><h4>Enterprise prefers incumbents</h4><p>Mitigate: don't fight Veeva in Big Pharma; own mid-market + CDMO. Let incumbents age into replacement cycles.</p></div>
      <div class="card"><h4>AI over-promised</h4><p>Mitigate: every AI feature cites its source doc. No ungrounded generation. Demos show live citation trails.</p></div>
      <div class="card"><h4>Regulatory drift</h4><p>Mitigate: Annex 11 2026 + QMSR Feb 2026 + DSCSA already in the Q1–Q4 2026 roadmap. We ship compliance as a product.</p></div>
    </div>
  </div>
</div>

</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINEERING PACK
// ═══════════════════════════════════════════════════════════════════════════════

function buildEngHtml() {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><title>Hawkeye · Pharma Strategy · Engineering Pack</title>
<style>${CSS}</style>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad:true, securityLevel:"loose", theme:"default" });
</script>
</head><body>
<div class="page">

<section class="cover" style="background:linear-gradient(135deg,#0f172a 0%,#2563eb 100%);">
  <h1>Hawkeye · Pharma EQMS</h1>
  <p style="font-size:18px; font-weight:500;">Engineering Pack · 8-Quarter Execution Plan</p>
  <p>Module audit · Architecture gaps · AI/Automation opportunities · Epic breakdown</p>
  <div class="meta">
    <span>Vertical: Pharma GMP</span>
    <span>Horizon: Q1 2026 → Q4 2027</span>
    <span>Generated: ${new Date().toISOString().slice(0,10)}</span>
  </div>
</section>

<div class="tabs">
  <input type="radio" id="t1" name="tabs" checked><input type="radio" id="t2" name="tabs">
  <input type="radio" id="t3" name="tabs"><input type="radio" id="t4" name="tabs">
  <input type="radio" id="t5" name="tabs"><input type="radio" id="t6" name="tabs">
  <input type="radio" id="t7" name="tabs"><input type="radio" id="t8" name="tabs">
  <div class="tab-labels">
    <label for="t1">1 · Current State</label>
    <label for="t2">2 · Architecture Gaps</label>
    <label for="t3">3 · Modules + AI</label>
    <label for="t4">4 · Target Architecture</label>
    <label for="t5">5 · Verticals</label>
    <label for="t6">6 · Roadmap</label>
    <label for="t7">7 · Tech Debt</label>
    <label for="t8">8 · Acceptance</label>
  </div>

  <!-- ═══ 1 · CURRENT STATE ═══ -->
  <div class="tab-content" id="c1" data-title="1 · Current State">
    <h2>Hawkeye today — honest audit</h2>
    <p>Hawkeye is a production-grade mid-market pharma EQMS with strong domain modelling (150+ models) and solid workflow logic. The core audit-CAPA-deviation flow is fully built. The main risks are in cross-cutting platform primitives: no middleware-enforced multi-tenancy, no observability, no backup/PITR strategy, single-vendor LLM, no SSO/MFA.</p>

    <h3>Module maturity — at a glance</h3>
    <table class="mtx">
      <thead><tr><th>Module</th><th>Status</th><th>Headline gap</th></tr></thead>
      <tbody>
        ${MODULES.map(m => {
          const badgeCls = m.currentState === "FULLY_BUILT" ? "built"
            : m.currentState === "FUNCTIONAL_BUT_BASIC" ? "basic"
            : m.currentState === "SKELETON_ONLY" ? "skeleton" : "notbuilt";
          return `<tr>
            <td><strong>${m.name}</strong> <code>${m.key}</code></td>
            <td><span class="badge ${badgeCls}">${m.currentState.replace(/_/g, " ")}</span></td>
            <td>${m.gaps[0]}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>

    <h3>Cross-cutting capabilities</h3>
    <div class="grid3">
      <div class="card"><h4><span class="badge built">OK</span> E-signatures / 21 CFR 11</h4><p>electronicSignatureModel (append-only) · SHA-256 · AUTHORED/REVIEWED/APPROVED types · covers all major entities.</p></div>
      <div class="card"><h4><span class="badge built">OK</span> RBAC</h4><p>roleMiddleware + permit() on all routes · 8 roles · accessGrantModel for resource-level grants.</p></div>
      <div class="card"><h4><span class="badge built">OK</span> Notifications</h4><p>notificationPolicyModel + outbox + preferences · email/SMS/in-app.</p></div>
      <div class="card"><h4><span class="badge basic">BASIC</span> Tenant isolation</h4><p>Field-level <code>tenantId</code> required on every query — no middleware enforcement. Cross-tenant leak risk.</p></div>
      <div class="card"><h4><span class="badge basic">BASIC</span> File uploads</h4><p>evidenceUploadModel + SHA-256 + S3-compatible · no streaming/virus scan.</p></div>
      <div class="card"><h4><span class="badge basic">BASIC</span> Search</h4><p>Mongo text indexes only · no Elasticsearch/OpenSearch wiring.</p></div>
      <div class="card"><h4><span class="badge basic">BASIC</span> Reporting / PDF</h4><p>Audit-report PDF only · no parameterised report builder.</p></div>
      <div class="card"><h4><span class="badge skeleton">MISSING</span> Observability</h4><p>No Pino/Winston · no Prometheus · no OTel · no Sentry. <strong>Blocker for SOC 2.</strong></p></div>
      <div class="card"><h4><span class="badge skeleton">MISSING</span> SSO / MFA</h4><p><code>requireMFA</code> flag exists · no TOTP/WebAuthn · no SAML/OIDC. <strong>Blocker for enterprise.</strong></p></div>
    </div>
  </div>

  <!-- ═══ 2 · ARCHITECTURE GAPS ═══ -->
  <div class="tab-content" id="c2" data-title="2 · Architecture Gaps">
    <h2>Top-10 architecture gaps blocking 1000+ tenants + regulatory validation</h2>

    <ol>
      <li><strong>Multi-tenancy data isolation risk.</strong> No middleware-enforced scoping of queries. Every controller must manually filter by <code>tenantId</code>. One forgotten filter = cross-tenant breach. <em>Fix: Mongoose plugin that auto-injects <code>tenantId</code> filter from <code>req.tenantId</code>.</em></li>
      <li><strong>No distributed cache.</strong> In-memory Map cache limits horizontal scaling. <em>Fix: Redis with tenant-keyed namespaces.</em></li>
      <li><strong>Backup + PITR undefined.</strong> Hard deletes only · no soft-delete · no documented RTO/RPO. <em>Fix: immutable delete log + daily Atlas snapshots + documented DR.</em></li>
      <li><strong>Observability fully absent.</strong> No logs · metrics · traces. <em>Fix: Pino + Prometheus + OpenTelemetry + Sentry.</em></li>
      <li><strong>Hash-chaining incomplete.</strong> <code>contentHashBefore/After</code> exist but never computed. <em>Fix: SHA-256 hashing on every CREATE/UPDATE in dataIntegrityLog.</em></li>
      <li><strong>MFA feature-flag incomplete.</strong> No TOTP/SMS. <em>Fix: WebAuthn + TOTP + SMS fallback. Enforce via tenant.requireMFA.</em></li>
      <li><strong>No outgoing webhooks / async queue.</strong> <em>Fix: BullMQ on Redis · standard signed-webhook retry queue.</em></li>
      <li><strong>Single LLM vendor (OpenAI).</strong> <em>Fix: LLM gateway with pluggable providers (Anthropic · Azure · local). Tenant-level choice for GxP paranoia.</em></li>
      <li><strong>Admin scopes not enforced at query level.</strong> <code>requireAdminScope()</code> is route-only. <em>Fix: query filter derived from <code>req.user.adminScope</code>.</em></li>
      <li><strong>No IaC / multi-region.</strong> <em>Fix: Terraform + cross-region MongoDB replica sets + regional object stores.</em></li>
    </ol>

    <h3>Architecture today</h3>
    ${renderArchitecturePhase(ARCHITECTURE.currentState)}
  </div>

  <!-- ═══ 3 · MODULES + AI ═══ -->
  <div class="tab-content" id="c3" data-title="3 · Modules + AI">
    <h2>Module-by-module — gaps + AI/automation opportunities</h2>
    ${renderModules()}
  </div>

  <!-- ═══ 4 · TARGET ARCHITECTURE ═══ -->
  <div class="tab-content" id="c4" data-title="4 · Target Architecture">
    <h2>Target architecture — 4-phase evolution</h2>
    <p>Incremental. Each phase is shippable on its own. Later phases depend on earlier phases. Every phase delivers customer-facing value and a platform capability.</p>

    ${renderArchitecturePhase(ARCHITECTURE.phase1)}
    ${renderArchitecturePhase(ARCHITECTURE.phase2)}
    ${renderArchitecturePhase(ARCHITECTURE.phase3)}
    ${renderArchitecturePhase(ARCHITECTURE.phase4)}

    <h3>Platform primitives — what we build in what order</h3>
    <div class="grid2">
      <div class="card pinstripe"><h4>Phase 1 · Trust layer</h4><ul>
        <li>Tenant-scope middleware (Mongoose plugin)</li>
        <li>Hash-chain engine (SHA-256 + Merkle root per tenant/day)</li>
        <li>LLM gateway + vector DB (pgvector → Pinecone at scale)</li>
        <li>Observability (Pino · Prometheus · OTel · Sentry)</li>
        <li>BullMQ queue + signed outgoing webhooks</li>
      </ul></div>
      <div class="card pinstripe"><h4>Phase 2 · Platform layer</h4><ul>
        <li>No-code workflow engine (visual state-machine editor over existing workflowDefinition)</li>
        <li>Industry-pack registry (pharma · device · ISO 9001 · food · auto)</li>
        <li>Data lake CDC stream (S3 Iceberg or Snowflake)</li>
        <li>SAML + OIDC + WebAuthn; CASL/OPA row-level security</li>
      </ul></div>
      <div class="card pinstripe"><h4>Phase 3 · Validated + IoT + Agentic</h4><ul>
        <li>Validation-kit generator (IQ/OQ/PQ/RTM from tenant config)</li>
        <li>IoT ingestion gateway (MQTT · OPC-UA) → equipment + CoC</li>
        <li>AskHawk agentic workflows (actions with e-sig + citations)</li>
        <li>WORM storage + optional blockchain anchor</li>
      </ul></div>
      <div class="card pinstripe"><h4>Phase 4 · Global scale</h4><ul>
        <li>Multi-region (US · EU · APAC) with per-tenant residency</li>
        <li>Terraform for all infra · K8s control plane</li>
        <li>Integration marketplace (SAP · Veeva · LIMS · MES)</li>
        <li>FedRAMP Moderate in-process</li>
      </ul></div>
    </div>

    <h3>"Limitless data collection" — the data spine</h3>
    <div class="flow">
      <h4>Data flow — write path</h4>
      <div class="mermaid">flowchart LR
        classDef new fill:#2563eb,color:#fff
        classDef app fill:#059669,color:#fff
        Req[Client request]
        MW[Tenant-scope +<br/>RBAC/ABAC middleware]:::new
        Ctrl[Controller]:::app
        Doc[Primary doc<br/>MongoDB]:::app
        Event[AuditEvent +<br/>DataIntegrityLog]:::new
        Hash[SHA-256 hash-chain<br/>Merkle root daily]:::new
        WORM[(WORM storage<br/>S3 object-lock)]:::new
        CDC[(CDC stream<br/>to data lake)]:::new
        Queue[BullMQ<br/>async jobs]:::new
        Webhook[Outgoing webhooks<br/>signed]:::new
        Req --> MW --> Ctrl
        Ctrl --> Doc
        Ctrl --> Event
        Event --> Hash
        Hash --> WORM
        Doc -->|CDC| CDC
        Event -->|CDC| CDC
        Ctrl --> Queue --> Webhook</div>
    </div>
  </div>

  <!-- ═══ 5 · VERTICALS ═══ -->
  <div class="tab-content" id="c5" data-title="5 · Industry Verticals">
    <h2>Multi-vertical extension — one platform, many industry packs</h2>
    <p>Each industry pack is a <strong>config + vocabulary overlay + module-specific schemas</strong> installed on the shared platform. No forking. The platform already supports this pattern via <code>ModuleConfig.industryProfile</code> + <code>vocabularyOverrides</code>.</p>

    <h3>Industry-pack anatomy</h3>
    <div class="card pinstripe"><p>A vertical pack = <strong>(1)</strong> module on/off matrix · <strong>(2)</strong> regulatory control mapping (ISO clause → module) · <strong>(3)</strong> vocabulary overlay (audit/finding/capa per region) · <strong>(4)</strong> vertical-specific schemas (e.g. HACCP plans for food, APQP for auto) · <strong>(5)</strong> pre-built workflows + templates · <strong>(6)</strong> pre-validated IQ/OQ package (where applicable).</p></div>

    ${renderVerticals()}

    <h3>Industry-pack ship velocity</h3>
    <p>Once the vertical-factory engine is live (Q3 2026), each new pack takes 4–6 weeks of domain work + 1–2 weeks of engineering. Target: 2 new packs per quarter in 2027 · 8 industries live by end of 2027.</p>
  </div>

  <!-- ═══ 6 · ROADMAP ═══ -->
  <div class="tab-content" id="c6" data-title="6 · Roadmap (engineering view)">
    <h2>24-month roadmap · all engineering-relevant initiatives</h2>
    <p>Color-coded: <span class="tag engineering">engineering</span> = pure eng · <span class="tag both">both</span> = eng + product/board visibility · <span class="tag board">board</span> = shown for shared context.</p>
    ${renderRoadmapQuarters("full")}
  </div>

  <!-- ═══ 7 · TECH DEBT ═══ -->
  <div class="tab-content" id="c7" data-title="7 · Tech Debt + Validation">
    <h2>Tech debt inventory + validation burden</h2>

    <h3>Immediate tech debt</h3>
    <ol>
      <li><strong>Two parallel CAPA implementations</strong> (capaModel + capaV2Models) — pick one; migrate + retire the other.</li>
      <li><strong>Hardcoded state-machines alongside generic workflow engine</strong> — statusTrackerModel vs workflowSubjectModel. Consolidate onto the generic engine.</li>
      <li><strong>No global search</strong> — Mongo text indexes only. Elastic/OpenSearch layer needed before 100+ tenants with 10M+ docs.</li>
      <li><strong>Hard-delete everywhere</strong> — no soft-delete pattern. Required for audit/compliance. Retrofit <code>deletedAt</code> + audit-trail tombstones.</li>
      <li><strong>ad-hoc console.log</strong> throughout — replace with structured logger (Pino).</li>
      <li><strong>In-memory embedding cache</strong> at 4000-item cap — move to pgvector/Pinecone.</li>
      <li><strong>Polling cron jobs</strong> — migrate to BullMQ async queue.</li>
      <li><strong>No OpenAPI spec for v2 routes</strong> — swagger-jsdoc set up but not all routes annotated.</li>
    </ol>

    <h3>Validation burden — shrinking from 6 months to 4 weeks</h3>
    <div class="grid2">
      <div class="card"><h4>Today</h4><p>Customer does full IQ/OQ/PQ. Typical effort: 6 months + $100K+ consultancy. Re-validate on every release.</p></div>
      <div class="card pinstripe"><h4>Q4 2026 target</h4><p>Validated SaaS package (MasterControl / Qualio parity). Customer performs PQ-only on configured workflows. Typical effort: 4 weeks + $10-20K config validation.</p></div>
    </div>

    <h3>Compliance/certification roadmap</h3>
    <ul>
      <li><strong>SOC 2 Type II</strong> — Q2 2026 audit (after observability lands)</li>
      <li><strong>ISO 27001</strong> — Q4 2026 certification</li>
      <li><strong>21 CFR Part 11 package</strong> — Q1 2026 (already compliant; package the evidence)</li>
      <li><strong>EU GMP Annex 11 2026 package</strong> — Q1 2026 (aligned with final rule Jul 2026)</li>
      <li><strong>HIPAA</strong> — Q2 2027 (for medical device combination products)</li>
      <li><strong>FedRAMP Moderate</strong> — Q3-Q4 2027 in-process</li>
    </ul>
  </div>

  <!-- ═══ 8 · ACCEPTANCE ═══ -->
  <div class="tab-content" id="c8" data-title="8 · Acceptance Criteria">
    <h2>Demo milestones — what "done" looks like</h2>

    <h3>Quarterly demo milestones</h3>
    ${ROADMAP.map(q => `
      <div class="quarter">
        <header><span class="q-badge">${q.quarter}</span><h3>${q.theme}</h3></header>
        <ul>
          ${q.epics.filter(e => e.pack === "engineering" || e.pack === "both").map(e => `
            <li><strong>${e.name}</strong> — demo-able: ${e.detail.split(".")[0]}.</li>
          `).join("")}
        </ul>
      </div>
    `).join("")}

    <h3>Success KPIs (per quarter)</h3>
    <div class="grid2">
      <div class="card"><h4>Engineering health</h4><ul>
        <li>Test coverage ≥ 70% on core EQMS modules</li>
        <li>p95 API latency &lt; 300ms</li>
        <li>Zero SEV-1 incidents per quarter</li>
        <li>CI green on main; &lt; 2h lead-time-for-changes</li>
      </ul></div>
      <div class="card"><h4>Product health</h4><ul>
        <li>NPS ≥ 40 among design partners</li>
        <li>Time-to-first-CAPA &lt; 10 min for new tenant</li>
        <li>AI answer grounded-citation rate ≥ 95%</li>
        <li>Feature adoption ≥ 60% for each new module 30 days post-launch</li>
      </ul></div>
    </div>
  </div>
</div>

</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

mkdirSync(OUT_DIR, { recursive: true });

const jobs = [
  { pack: "board", file: "pharma-strategy-board", builder: buildBoardHtml },
  { pack: "engineering", file: "pharma-strategy-engineering", builder: buildEngHtml },
].filter(j => !only || only === j.pack);

for (const j of jobs) {
  const html = j.builder();
  const htmlPath = join(OUT_DIR, `${j.file}.html`);
  writeFileSync(htmlPath, html);
  console.log(`  ✓ HTML written: ${htmlPath} (${Math.round(html.length / 1024)} KB)`);
}

if (htmlOnly) {
  console.log("  (--html-only — skipping PDF step)");
  process.exit(0);
}

console.log("  rendering PDFs via headless Chromium…");
const browser = await chromium.launch();
for (const j of jobs) {
  const htmlPath = join(OUT_DIR, `${j.file}.html`);
  const pdfPath = join(OUT_DIR, `${j.file}.pdf`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000); // Mermaid
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
  });
  await ctx.close();
  console.log(`  ✓ PDF written: ${pdfPath}`);
}
await browser.close();
