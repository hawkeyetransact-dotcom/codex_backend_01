/**
 * build-pharma-ai-gaps.mjs
 *
 * Builds a focused "AI gap spec" deliverable for Hawkeye pharma EQMS — a
 * detailed blueprint for reaching 10/10 AI maturity across all 15 modules
 * plus the Cross-Company Audit module (the unique competitive moat).
 *
 * Companion to the strategy packs (build-pharma-strategy-packs.mjs) — this
 * doc is implementation-grade, not marketing.
 *
 * Output:
 *   backend/docs/03-user-guides/pharma-ai-gap-spec.html / .pdf
 *
 * Usage:
 *   node scripts/build-pharma-ai-gaps.mjs              # build both
 *   node scripts/build-pharma-ai-gaps.mjs --html-only  # skip PDF
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, "..", "docs", "03-user-guides");
const htmlOnly = process.argv.includes("--html-only");

// ═══════════════════════════════════════════════════════════════════════════════
// CURRENT STATE (4/10) — code-grounded findings from the audit
// ═══════════════════════════════════════════════════════════════════════════════

const AI_TODAY = {
  summary: "AskHawk is a retrieval-only chatbot — no generative LLM in the main chat loop. It runs deterministic pattern-based intent routing over a Mongo-backed hybrid KB (semantic cosine + BM25), returns citations only if confidence passes a hard-coded threshold, and logs every conversation. Grounding is enforced. Hallucination risk is near-zero (because nothing is generated). But the system cannot draft a CAPA RCA, reason multi-step across modules, or act on audit findings. Peripheral autofill/OCR paths call Gemini/Llama3 via an MCP LLM service for low-stakes drafting.",
  dimensions: [
    { name: "Core stack",           verdict: "BASIC",    detail: "Deterministic composition · no generative LLM in AskHawk chat · OpenAI text-embedding-3-small for vectors (src/services/askHawkEmbeddingService.js)" },
    { name: "Retrieval",            verdict: "BASIC",    detail: "Mongo cosine + BM25 hybrid · no Pinecone/Weaviate · tenant-scoped via filter · 1200-char chunks w/ 200 overlap · 8 hits after re-rank" },
    { name: "Grounding + citations", verdict: "SOLID",    detail: "Confidence gate (0.26) + citation validation + fallback to 'could not verify' · citations in file:line format · logged to HawkUnansweredModel if ungrounded" },
    { name: "Tools / agentic",      verdict: "BASIC",    detail: "7 read-only tools (getAuditSummary, listCapas, getEvidenceList…) · no mutations · single-pass intent router · no multi-step planning" },
    { name: "Peripheral AI",        verdict: "MISSING",  detail: "Tesseract OCR works · docIntel coverage check uses external LLM · agentic autofill via regex + LLM · no classification, clustering, anomaly, or forecasting models" },
    { name: "Quality / evals",      verdict: "SOLID",    detail: "4-check eval suite (intent, citation, confidence, re-rank) · telemetry dashboard with grounded-rate + avg-confidence · no A/B · no user-feedback loop wired" },
    { name: "GxP compliance",       verdict: "BASIC",    detail: "HawkConversation logs every chat · not integrated with main AuditTrail · no GxP-safe mode flag · PII redaction inconsistent (AskHawk redacts, autofill doesn't)" },
    { name: "Frontend integration", verdict: "BASIC",    detail: "Floating chat drawer only · no inline field assists (no 'AI-draft RCA' on the CAPA form) · admin dashboard for KB/eval management" },
  ],
  currentMermaid: `flowchart LR
    classDef ok fill:#059669,color:#fff
    classDef basic fill:#f59e0b,color:#fff
    classDef gap fill:#dc2626,color:#fff
    User[User question]:::ok
    IR[Intent router<br/>pattern match]:::basic
    KB[(Mongo KB<br/>cosine + BM25)]:::basic
    Emb[OpenAI embeddings<br/>3-small only]:::basic
    RR[Re-ranker<br/>deterministic]:::basic
    Gate[Confidence gate<br/>0.26 threshold]:::ok
    Comp[Template composer<br/>NO LLM generation]:::gap
    Log[HawkConversation<br/>log]:::ok
    Tools[7 read-only tools<br/>no mutation]:::basic
    Fallback["I could not<br/>verify..."]:::ok
    User --> IR --> KB
    KB --> Emb
    KB --> RR
    RR --> Gate
    Gate --> |pass| Comp
    Gate --> |fail| Fallback
    Comp --> Tools
    Comp --> Log`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// THE 10/10 BAR — principles the whole design respects
// ═══════════════════════════════════════════════════════════════════════════════

const TEN_TEN_PRINCIPLES = [
  { name: "Grounded or silent",     detail: "Every AI output cites at least one source document with paragraph-level precision. No ungrounded generation is ever returned. If confidence drops below threshold, the system says so — it does not guess." },
  { name: "Deputy, not oracle",     detail: "AI proposes; humans decide. Every AI-drafted artifact is reviewable, editable, and must be e-signed before it becomes record. The AI is a participant in the workflow, not a black box." },
  { name: "Compliance-grade trail", detail: "Every AI decision (input, retrieval set, tool calls, output, confidence, model, version, prompt hash) is immutably logged to the main AuditTrail — not a parallel log. FDA inspectors can trace any AI recommendation back to its inputs." },
  { name: "Pluggable by tenant",    detail: "LLM provider (Anthropic / OpenAI / Azure / local Llama) is a tenant config, not a platform decision. GxP-paranoid tenants run on-prem models; others get best-in-class cloud. Same grounding, same audit trail, different provider." },
  { name: "Inline, not sidebar",    detail: "AI lives inside the forms — 'draft RCA' on the CAPA screen, 'suggest follow-up question' during audit execution, 'classify deviation severity' on the deviation form. The chat sidebar is supplementary, not primary." },
  { name: "Active learner",         detail: "Every unanswered question, every rejected suggestion, every user edit of an AI draft feeds a continuous improvement loop — scheduled re-tuning of retrieval weights, prompt variants, and KB coverage." },
  { name: "Cross-module aware",     detail: "An AI agent working on a CAPA can read the linked deviation, the batch record, the associated training, and the supplier scorecard — in one reasoning step. Competitor AI lives in per-module silos. Hawkeye's crosses the graph." },
  { name: "Zero ungrounded risk",   detail: "Even when tenant policy allows generation, grounding is enforced by the platform: retrieval-augmented prompt · structured output schema · citation-presence check · re-ask on failure. The platform guarantees it — no per-module engineer has to." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-COMPANY AUDIT AI — phase-by-phase (the unique moat)
// Every feature has: name, value, mechanism, build effort (XS/S/M/L)
// ═══════════════════════════════════════════════════════════════════════════════

const CROSS_COMPANY_AUDIT_AI = [
  {
    phase: "Pre-RFQ (scope definition)",
    color: "#0ea5e9",
    features: [
      { id: "ccaa-1",  name: "Auto-scope drafter",                value: "From product + site + risk dossier, AI drafts a GMP audit scope statement with clause-level regulatory anchors (21 CFR 210/211, ICH Q7, Annex 11).", mechanism: "RAG over regulatory corpus + prior approved scopes · structured JSON schema with citations · editable draft · human e-sig to commit", effort: "M" },
      { id: "ccaa-2",  name: "Questionnaire-template recommender", value: "Picks the best-fit questionnaire template(s) from the tenant + global library based on product class, dosage form, and supplier type.", mechanism: "Embedding similarity of scope → template descriptions · top-3 with rationale · picker UI · learns from prior picks", effort: "S" },
      { id: "ccaa-3",  name: "Compliance-clause mapper",          value: "Tags each draft questionnaire question with the specific regulatory clause it evidences (21 CFR 211.84, ICH Q7 §6, etc.).", mechanism: "Classifier fine-tuned on regulatory corpus + human-curated mapping · AI draft → SME accepts/edits", effort: "M" },
    ],
  },
  {
    phase: "RFQ & Auditor selection",
    color: "#2563eb",
    features: [
      { id: "ccaa-4",  name: "Auditor fit-score",                  value: "Ranks every marketplace auditor against the RFQ by specialty tags, past-audit scope similarity, performance ratings, and availability.", mechanism: "Multi-factor score: embedding similarity of past audits + structured features (tenure, rating, language, region) · LightGBM classifier", effort: "M" },
      { id: "ccaa-5",  name: "Invitation-note drafter",            value: "Writes a personalised invitation note per candidate auditor explaining the scope, timeline, and why they're a fit.", mechanism: "LLM grounded on auditor profile + RFQ · short-form output · auditor-name-safe redaction · human review before send", effort: "S" },
      { id: "ccaa-6",  name: "Quote analysis co-pilot",            value: "Summarises quote differences (price, timeline, methodology, specialty coverage) and flags outliers.", mechanism: "Structured quote diff + LLM narrative · highlight bands · chart explainers · cost-per-day normalisation", effort: "S" },
      { id: "ccaa-7",  name: "Conflict-of-interest detector",      value: "Cross-checks candidate auditor vs. supplier via public business registries + prior-audit history → flags any potential COI.", mechanism: "Entity-resolution on public registries (OpenCorporates, SEC EDGAR, Companies House) + internal history · rule + LLM hybrid · confidence score", effort: "L" },
    ],
  },
  {
    phase: "Pre-audit intelligence",
    color: "#7c3aed",
    features: [
      { id: "ccaa-8",  name: "Supplier risk dossier",              value: "One-pager auto-compiled: FDA warning letters, 483 observations, import alerts, EMA non-compliance, recent recalls, DMF status, prior audit findings trend.", mechanism: "Scheduled ingestion of FDA/EMA/MHRA feeds + WHO PQ + customs data · per-supplier entity resolution · LLM summariser with citation to each source", effort: "L" },
      { id: "ccaa-9",  name: "Prior-audit pattern miner",          value: "Surfaces the 5 most likely findings for THIS audit based on supplier's history and industry peers.", mechanism: "Embedding similarity over finding corpus + supplier risk features · LightGBM predictor · transparent reasoning ('similar to supplier X audit on date Y')", effort: "L" },
      { id: "ccaa-10", name: "Questionnaire risk-weighter",        value: "Re-ranks questionnaire sections by predicted audit-yield based on risk dossier → auditor focuses limited time on high-yield areas.", mechanism: "Sections scored by correlation with historical findings + current risk signals · inline badge on each section ('high yield', 'low yield')", effort: "M" },
      { id: "ccaa-11", name: "Site-readiness probe",                value: "AI reads supplier's publicly available site master files / DMFs → pre-extracts answers for the questionnaire.", mechanism: "PDF ingest + extraction + matching to questionnaire fields · auditor reviews the extracts before the audit · citation to exact page/line", effort: "M" },
      { id: "ccaa-12", name: "Agenda drafter",                      value: "Generates a day-by-day audit agenda with interview slots, tour slots, evidence-request slots — aligned to the risk-weighted questionnaire.", mechanism: "Template + constraint solver (time blocks, auditor count, SME availability) · LLM fills narrative · editable timeline UI", effort: "M" },
    ],
  },
  {
    phase: "Execution (live audit)",
    color: "#059669",
    features: [
      { id: "ccaa-13", name: "Real-time follow-up suggester",       value: "After each supplier response, AI proposes 2-3 follow-up questions based on gaps, inconsistencies, and the risk dossier.", mechanism: "Response + prior Q&A + risk profile → LLM grounded on regulatory corpus · inline popover · auditor clicks to use or dismiss · all suggestions logged", effort: "M" },
      { id: "ccaa-14", name: "Live evidence analyser",              value: "When supplier uploads a PDF/spreadsheet/image during the audit, AI extracts key points and flags gaps vs the expected evidence.", mechanism: "Multi-modal ingestion (OCR + layout-aware parsing + structured extraction) · comparison to questionnaire-expected-evidence schema · highlight gaps", effort: "L" },
      { id: "ccaa-15", name: "Cross-reference resolver",            value: "When supplier cites 'SOP QC-014', AI fetches it from their controlled-doc library and summarises the relevant section inline.", mechanism: "Doc-library search + section-level RAG · inline panel with quote + citation · requires supplier to grant read-only access", effort: "M" },
      { id: "ccaa-16", name: "Inconsistency detector",              value: "Compares the current answer to prior answers in this audit and historical audits; flags contradictions.", mechanism: "Claim extraction from responses + claim-graph of supplier assertions · AI match → contradiction flag with side-by-side", effort: "L" },
      { id: "ccaa-17", name: "Interview transcription + triage",     value: "Records interview audio, transcribes, extracts quotable statements with timestamps, pre-tags potential observations.", mechanism: "Whisper / equivalent transcription · speaker diarisation · LLM extracts candidate observations · auditor approves/edits", effort: "M" },
    ],
  },
  {
    phase: "Findings",
    color: "#dc2626",
    features: [
      { id: "ccaa-18", name: "Observation drafter",                 value: "From the interview snippets, evidence, and questionnaire responses, drafts a finding with regulatory citation, severity, and CAPA-worthy flag.", mechanism: "Structured finding template + RAG over FDA-483 corpus · severity classifier (major/minor/critical) · draft → auditor edits → e-sig", effort: "L" },
      { id: "ccaa-19", name: "Regulatory-clause auto-tagger",       value: "Each finding automatically tagged to specific 21 CFR paragraphs, ICH Q7 sections, Annex 11 items.", mechanism: "Fine-tuned classifier on finding ↔ clause corpus · top-3 suggestions · auditor confirms", effort: "M" },
      { id: "ccaa-20", name: "Duplicate finding detector",          value: "Identifies when two auditors have drafted similar observations → suggests merge with combined evidence.", mechanism: "Embedding similarity on finding titles + evidence overlap · threshold + UI to merge", effort: "S" },
      { id: "ccaa-21", name: "CAPA suggestion per finding",          value: "For each finding, drafts a proposed CAPA plan (root cause + corrective + preventive + effectiveness check) with citation to similar past CAPAs.", mechanism: "RAG over tenant's prior CAPAs + industry best-practice corpus · LLM draft with 5-why scaffold · requires supplier review + e-sig", effort: "L" },
      { id: "ccaa-22", name: "Finding-to-training gap linker",       value: "If a finding suggests a procedural gap, AI checks training records and flags who should re-train.", mechanism: "SOP-reference extraction from finding → training-record query · gap report with owner list", effort: "M" },
    ],
  },
  {
    phase: "Reporting",
    color: "#ea580c",
    features: [
      { id: "ccaa-23", name: "Exec summary generator",               value: "One-page exec summary for the buyer with risk level, top 3 findings, trend vs prior audit, and recommended actions.", mechanism: "Structured inputs (findings + CAPA + trend) → LLM with length constraints · editable · e-signed · never auto-published", effort: "S" },
      { id: "ccaa-24", name: "Full-report assembler",                value: "Composes the full audit report in the tenant's template format, with every claim traceable to an evidence ID.", mechanism: "Template-driven report generator + per-section RAG · every paragraph has a citation chain · exports PDF + structured JSON", effort: "L" },
      { id: "ccaa-25", name: "Cross-citation verifier",              value: "Before report sign-off, AI verifies every citation is valid (evidence exists, quote is accurate, link is live).", mechanism: "Citation-check pass · re-extract quotes and verify · flag broken or modified citations", effort: "S" },
      { id: "ccaa-26", name: "Regulatory-style voice normaliser",     value: "Rewrites auditor's draft prose to a consistent regulatory voice (passive-voice observations, third-person findings).", mechanism: "Style-tuned LLM · diff-based review UI · auditor accepts/rejects per paragraph", effort: "M" },
    ],
  },
  {
    phase: "Post-audit analytics",
    color: "#8b5cf6",
    features: [
      { id: "ccaa-27", name: "Supplier trend narrator",              value: "Narrates how THIS audit compares to the supplier's prior audits — improvement, drift, new weaknesses.", mechanism: "Historical finding embeddings + trend metrics · LLM narrative · auto-attached to supplier scorecard", effort: "M" },
      { id: "ccaa-28", name: "Recurring finding detector",           value: "Flags findings that recur across multiple audits → suggests promoting to systemic-risk CAPA.", mechanism: "Finding clustering + per-supplier + per-industry views · alerts", effort: "M" },
      { id: "ccaa-29", name: "CAPA effectiveness predictor",          value: "Predicts probability that a proposed CAPA will close on time and be effective, based on supplier's CAPA history.", mechanism: "LightGBM on structured features (CAPA type, owner role, due-date slack, deviation severity) · calibrated probability + reasoning", effort: "L" },
      { id: "ccaa-30", name: "Quality-KPI extractor",                 value: "Extracts quantitative KPIs from the audit report (finding count by severity, evidence coverage rate, questionnaire completion time) → auto-populates MRM inputs.", mechanism: "Structured extraction + MRM input writer · transparent provenance", effort: "S" },
    ],
  },
  {
    phase: "Auditor development (marketplace)",
    color: "#f59e0b",
    features: [
      { id: "ccaa-31", name: "Auditor draft-quality coach",           value: "AI reviews auditor's draft observations for clarity, regulatory alignment, and evidence coverage; offers inline coaching.", mechanism: "Draft → structured quality score + suggestions · private to auditor (not exposed to supplier) · feeds auditor performance record", effort: "M" },
      { id: "ccaa-32", name: "Specialty fit-score for auditor growth", value: "Tells each auditor their strongest specialties and suggested next audit types to broaden skills.", mechanism: "Embedding over past audits + performance metrics · narrative profile · CEU / training suggestions", effort: "S" },
      { id: "ccaa-33", name: "Continuing-education recommender",      value: "Recommends courses, SOPs, regulatory updates based on gaps identified in their recent audits.", mechanism: "Gap extraction from coach scores + marketplace training catalog · ranked suggestions · tracks completion", effort: "S" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PER-MODULE AI (15 EQMS modules; 10/10-grade features each)
// ═══════════════════════════════════════════════════════════════════════════════

const PER_MODULE_AI = [
  {
    module: "AUDIT_MANAGEMENT", moduleName: "Audit Management (internal)",
    note: "Cross-Company Audit AI covers the external/marketplace variant. Internal-audit AI is a subset — same primitives.",
    features: [
      { name: "Risk-based audit scheduler",       value: "AI auto-proposes the annual internal audit plan based on deviation density, CAPA aging, equipment criticality, and training gaps per department.", effort: "M" },
      { name: "Finding-to-SOP diff",              value: "When a finding cites a procedural gap, AI diffs the SOP against the finding and drafts the required SOP rev.", effort: "M" },
    ],
  },
  {
    module: "DOCUMENT_CONTROL", moduleName: "Document Control",
    features: [
      { name: "SOP author copilot",               value: "From a regulatory source (warning letter, Annex 11 update), AI drafts the required SOP rev diff with tracked-changes.", effort: "L" },
      { name: "Multi-framework tagger",           value: "Tags one controlled document against multiple frameworks (21 CFR 211, Annex 11, ISO 13485, ISO 9001, IATF 16949). Shows coverage map per framework — like Qualio Compliance Intelligence.", effort: "M" },
      { name: "Change-impact analyser",           value: "For each SOP change, AI identifies which training assignments, linked SOPs, and controlled forms need parallel updates.", effort: "M" },
      { name: "Semantic doc search",              value: "Natural-language search over all controlled docs with paragraph-level citations. Answers Q&A like 'what does our cleaning validation SOP require for hold time?'", effort: "S" },
    ],
  },
  {
    module: "CAPA_MANAGEMENT", moduleName: "CAPA",
    features: [
      { name: "Root-cause drafter",               value: "From the deviation narrative + evidence, AI drafts 5-why and fishbone; the CAPA investigator edits, doesn't start from blank. Veeva pilots show 75% cycle reduction.", effort: "M" },
      { name: "CAPA-plan recommender",            value: "Suggests corrective + preventive actions from similar prior CAPAs (internal + industry best practices) with citations.", effort: "M" },
      { name: "Effectiveness-check designer",      value: "Proposes a statistically sound effectiveness check (sample size, success criteria, review window) given the risk.", effort: "M" },
      { name: "Cross-CAPA signal detector",        value: "Clusters open CAPAs; flags when 3+ CAPAs share a root cause → escalates to systemic risk.", effort: "M" },
    ],
  },
  {
    module: "CHANGE_CONTROL", moduleName: "Change Control",
    features: [
      { name: "Regulatory-impact classifier",      value: "Classifies each change as notifiable / CBE-30 / PAS / major / minor with regulatory reasoning cited to FDA and EMA guidance.", effort: "L" },
      { name: "Spec-diff engine",                  value: "Diffs BOM, formula, or process between old and new rev; highlights what requires re-validation.", effort: "M" },
      { name: "Downstream-artifact planner",       value: "Lists every SOP, form, training assignment, and test method that must be updated as a result of the change — with owners.", effort: "M" },
    ],
  },
  {
    module: "EVENT_MANAGEMENT", moduleName: "Deviations / Event Mgmt",
    features: [
      { name: "5-why / fishbone scaffolder",       value: "AI-draft 5-why and fishbone from the deviation narrative. Investigator edits; all AI-drafted content flagged in the audit trail.", effort: "M" },
      { name: "Signal detector across deviations", value: "Clusters recent deviations by process, equipment, operator, material lot → flags emerging trends before they become systemic.", effort: "L" },
      { name: "Batch-record auto-link",            value: "When a deviation is raised, AI fetches the relevant batch record, equipment calibration state, and operator training → attaches as evidence.", effort: "M" },
      { name: "Disposition-decision aid",          value: "Recommends batch disposition (release / reject / rework / investigate) with reasoning citing analogous historical dispositions.", effort: "M" },
    ],
  },
  {
    module: "TRAINING_MANAGEMENT", moduleName: "Training",
    features: [
      { name: "SOP-rev → training autogen",        value: "When an SOP publishes a new rev, AI auto-creates read-and-understood assignments to every role that uses it, with a custom knowledge-check.", effort: "M" },
      { name: "Competency assessor",               value: "Auto-grades practical competency from evidence photos / videos (e.g. gowning correctness); escalates uncertain cases to a human.", effort: "L" },
      { name: "Curriculum recommender",            value: "For each role, suggests an evergreen curriculum based on regulatory changes and internal incidents.", effort: "M" },
    ],
  },
  {
    module: "RISK_MANAGEMENT", moduleName: "Risk",
    features: [
      { name: "Bayesian risk scorer",              value: "Combines FMEA RPN with Bayesian priors from deviation history; produces a continuously updated risk score with confidence intervals.", effort: "L" },
      { name: "Auto-CAPA on RPN breach",           value: "When risk crosses a tenant-defined threshold, AI drafts a risk-reduction CAPA and assigns an owner.", effort: "S" },
      { name: "Risk-scenario brainstormer",        value: "From an SOP or process description, AI generates candidate failure modes, effects, and causes to seed an FMEA workshop.", effort: "M" },
    ],
  },
  {
    module: "SUPPLIER_QUALITY", moduleName: "Supplier Quality",
    features: [
      { name: "Public-signal risk updater",        value: "Ingests FDA 483, warning letters, import alerts, customs data → auto-updates supplier risk score with citation.", effort: "L" },
      { name: "Supplier-audit prep package",       value: "For an upcoming supplier audit, AI assembles the full context pack (prior findings, CAPA status, trend, public signals) in one PDF.", effort: "M" },
      { name: "Scorecard narrator",                 value: "Generates a plain-English narrative of each supplier's quality scorecard for committee review.", effort: "S" },
      { name: "Supplier CAPA review helper",        value: "When a supplier submits a CAPA response, AI evaluates completeness and proposes follow-up questions or acceptance.", effort: "M" },
    ],
  },
  {
    module: "MANAGEMENT_REVIEW", moduleName: "Management Review",
    features: [
      { name: "Auto-MRM input populator",          value: "Pulls CAPA aging, audit findings, deviation trends, training gaps, supplier scorecards across all modules and writes the MRM input section.", effort: "M" },
      { name: "Exec pre-read generator",           value: "Drafts a 1-page pre-read for the MRM committee; includes trend narrative, quantitative KPIs, and suggested decision points.", effort: "S" },
      { name: "Action-item tracker",                value: "Parses MRM minutes; creates action items with owners + due dates; tracks closure and prompts the exec dashboard.", effort: "S" },
    ],
  },
  {
    module: "ASSET_MANAGEMENT", moduleName: "Asset / Equipment",
    features: [
      { name: "Calibration-cert OCR + auto-file",  value: "Reads third-party calibration certificates, extracts values, verifies against equipment record, files automatically.", effort: "M" },
      { name: "Predictive maintenance",             value: "ML on IoT telemetry (vibration, temperature, run-time) → predicts MTBF and opens preventive action before failure.", effort: "L" },
      { name: "IoT OOS detector",                   value: "Live temperature / humidity / pressure streams; triggers a deviation when any equipment drifts out of spec.", effort: "M" },
    ],
  },
  {
    module: "CHAIN_OF_CUSTODY", moduleName: "Chain of Custody",
    features: [
      { name: "CoC-break narrative drafter",        value: "When a CoC break is detected (temperature excursion, missed scan), AI drafts the deviation narrative and links the affected samples.", effort: "S" },
      { name: "Barcode/QR ingest with AI validation", value: "Scans + AI validates the custody handoff against expected workflow; flags anomalies.", effort: "M" },
    ],
  },
  {
    module: "TRANSACTION_REVIEW", moduleName: "Transaction Review",
    features: [
      { name: "AML / counterparty-risk analyser",   value: "For high-value transactions, AI runs sanctions + PEP + adverse-media checks and scores risk; enterprise search on public registries.", effort: "L" },
      { name: "Due-diligence draft memo",           value: "Generates the due-diligence memo from transaction details + counterparty data; reviewer e-signs.", effort: "M" },
    ],
  },
  {
    module: "REGULATORY_INTEL", moduleName: "Regulatory Intel",
    features: [
      { name: "Multi-agency summariser",            value: "Ingests FDA, EMA, MHRA, PMDA, Health Canada, TGA RSS; AI summarises in plain English, tagged to tenant's products.", effort: "M" },
      { name: "'What applies to me' matcher",       value: "Only surfaces regulatory updates that affect the tenant's product class, site geography, and supply chain.", effort: "M" },
      { name: "Change-control auto-draft",          value: "When a regulatory update affects a tenant's SOPs, AI auto-drafts the change-control request pre-populated with impact assessment.", effort: "L" },
      { name: "Warning-letter pattern miner",        value: "Mines FDA warning letters in tenant's product class; surfaces common concerns so QA can audit proactively.", effort: "M" },
    ],
  },
  {
    module: "AI_ASSISTANT", moduleName: "AskHawk (platform AI)",
    features: [
      { name: "Pluggable LLM gateway",              value: "Tenant picks the LLM provider (Anthropic Claude 4.x, OpenAI GPT-4.x, Azure, local Llama 3) — same grounded prompt, same audit trail, different provider.", effort: "L" },
      { name: "Vector DB at scale",                 value: "Migrate Mongo-cosine to pgvector (Postgres) or Pinecone. Per-tenant isolation. Billions of chunks supported.", effort: "L" },
      { name: "Agentic workflows",                  value: "Multi-step plans: 'find overdue CAPAs, check owner response, remind the owner or escalate to Head of QA'. Every action e-signed.", effort: "L" },
      { name: "Active-learning loop",               value: "Every user-rejected suggestion, every edit of an AI draft, every 'not helpful' feeds retrieval-weight tuning, prompt variants, and KB gaps.", effort: "M" },
      { name: "On-prem LLM option",                  value: "GxP-paranoid tenants can deploy a vLLM-hosted Llama 3 in their own VPC; identical API, identical audit trail.", effort: "L" },
    ],
  },
  {
    module: "RFQ_PROCUREMENT", moduleName: "RFQ / Procurement",
    note: "Covered in Cross-Company Audit AI. Highlighted features repeated here for completeness.",
    features: [
      { name: "Auditor fit-score + invitation drafter", value: "See ccaa-4 + ccaa-5.", effort: "M" },
      { name: "Quote analysis co-pilot",                  value: "See ccaa-6.", effort: "S" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// AI BUILDING BLOCKS — reusable primitives
// ═══════════════════════════════════════════════════════════════════════════════

const BUILDING_BLOCKS = [
  { name: "Multi-LLM gateway", role: "Abstracts provider (Anthropic · OpenAI · Azure · local Llama3 via vLLM). Per-tenant provider config. Unified observability, prompt caching, token accounting.", components: "Provider adapters · request router · response normaliser · token budget tracker · retry/fallback chain", effort: "M" },
  { name: "Grounded-generation runtime", role: "Every LLM call must return structured output + citations. If citations missing, re-ask with lower temperature + explicit instruction; if still missing, return 'could not verify'.", components: "Citation-schema validator · re-ask loop · confidence scorer · grounding-gate middleware · GxP trail hook", effort: "M" },
  { name: "Vector DB + hybrid retriever", role: "pgvector (Postgres) for start; Pinecone at >50M vectors. BM25 + dense + optional LLM re-rank. Tenant-scoped at storage + query.", components: "Chunking pipeline · embedding job queue · hybrid scorer · LLM re-ranker (toggleable) · retrieval evaluator", effort: "L" },
  { name: "Tool-calling runtime", role: "Typed tools with input/output JSON-schema. Read vs write taxonomy. Every mutation requires e-sig. Tools are modular — any module registers tools.", components: "Tool registry · parameter validator · mutation audit wrapper · human-in-the-loop approver · timeout handler", effort: "M" },
  { name: "Multi-step agent runtime", role: "Plan-then-execute with observation/reflection. Budgeted step count. Transparent plan shown to user before execution. Each step auditable and revertible.", components: "Plan generator · step executor · observation logger · reflection step · revert API", effort: "L" },
  { name: "Active-learning loop", role: "User edits, rejections, 'not helpful' feedback feed retrieval weights, prompt variants, and KB gap backlog. Scheduled retrain / re-tune.", components: "Feedback ingester · unanswered-bucket classifier · retrieval-weight tuner · prompt A/B runner · KB gap ticketer", effort: "M" },
  { name: "GxP AI audit trail", role: "Every AI decision written to main AuditTrail (not a side log). Captures: prompt, retrieval set, tool calls, output, confidence, model, version, prompt hash.", components: "AuditTrail extender · prompt-hash computer · model-version registry · inspector-view UI", effort: "S" },
  { name: "PII / data-residency guard", role: "Pre-LLM redaction middleware per tenant policy. Redacts emails, names, phone, SSN, patient IDs, batch numbers where policy dictates. On-prem LLM bypasses redaction.", components: "Policy engine · regex + NER redactor · redaction audit log · per-tenant policy UI", effort: "M" },
  { name: "Eval + A/B harness", role: "Automated eval suites per feature (intent, citation, confidence, grounding, end-task). Prompt-variant A/B with statistical gating before production.", components: "Eval-runner · dataset store · prompt-variant manager · stats engine · feature-flag gate", effort: "M" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// AI ARCHITECTURE (target)
// ═══════════════════════════════════════════════════════════════════════════════

const AI_ARCH = {
  target: `flowchart TB
    classDef app fill:#059669,color:#fff,stroke:#065f46
    classDef plat fill:#2563eb,color:#fff,stroke:#1e3a8a
    classDef ai fill:#7c3aed,color:#fff,stroke:#4c1d95
    classDef data fill:#ea580c,color:#fff,stroke:#9a3412
    classDef audit fill:#dc2626,color:#fff,stroke:#7f1d1d

    subgraph UI["User surfaces"]
      Chat[AskHawk chat drawer]:::app
      Inline[Inline form assists<br/>CAPA · Deviation · Finding]:::app
      Agent[Agent console<br/>plans · tool calls · actions]:::app
    end

    subgraph Runtime["AI runtime layer"]
      GW[Multi-LLM gateway<br/>Anthropic · OpenAI · Azure · Llama3]:::ai
      GG[Grounded-gen runtime<br/>citation gate · re-ask · GxP mode]:::ai
      TC[Tool-calling runtime<br/>typed · read/write · e-sig gates]:::ai
      AR[Multi-step agent<br/>plan · execute · reflect]:::ai
      Red[PII / residency<br/>redaction]:::ai
    end

    subgraph Knowledge["Retrieval + knowledge"]
      VDB[(pgvector / Pinecone<br/>tenant-scoped)]:::data
      Emb[Embedding service<br/>pluggable model]:::ai
      RR[Hybrid retriever<br/>BM25 + dense + LLM re-rank]:::ai
      KB[(Controlled docs · SOPs<br/>Evidence · FDA corpus)]:::data
    end

    subgraph Learn["Quality + learning"]
      Eval[Eval harness +<br/>A/B]:::plat
      AL[Active-learning loop<br/>feedback → retrain]:::plat
    end

    subgraph Audit["GxP trail"]
      AT[(AuditTrail<br/>immutable · hash-chained)]:::audit
      Insp[Inspector view<br/>AI decision log]:::audit
    end

    Chat --> GW
    Inline --> GW
    Agent --> AR --> GW
    GW --> GG --> Red
    Red --> RR
    RR --> VDB
    RR --> Emb
    VDB --> KB
    GG --> TC
    TC --> AT
    GG --> AT
    AT --> Insp
    GW --> Eval
    Eval --> AL
    AL --> RR`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION & SAFETY
// ═══════════════════════════════════════════════════════════════════════════════

const VALIDATION_SAFETY = [
  { name: "FDA AI-quality guidance (Jan 2025)",            detail: "Risk-based credibility framework. Hawkeye posture: each AI feature is classified (low/med/high risk), with escalating evidence requirements. Validation package includes model version, training data provenance, grounding-rate eval, and fail-mode catalog per feature.", posture: "Aligned" },
  { name: "EU GMP Annex 11 (final mid-2026)",              detail: "Prescriptive AI validation — model behaviour characterisation, drift monitoring, change-control on prompt/model updates, disaster-recovery. Hawkeye posture: prompt + model versions pinned per tenant, changes go through our own change-control module, drift detected via scheduled evals.", posture: "Aligned" },
  { name: "Hallucination prevention",                      detail: "Platform guarantees: (1) retrieval-augmented prompt · (2) structured output schema enforced · (3) citation-presence gate · (4) re-ask loop on failure · (5) fallback to 'could not verify' · (6) no generation without grounding in GxP mode.", posture: "Built-in" },
  { name: "PII / patient data / commercial secrets",       detail: "Per-tenant redaction policy. Default-on for names, emails, phone, batch IDs, patient IDs, EDI codes. Bypass-allowlist via explicit tenant opt-in. On-prem LLM route bypasses redaction (data stays local).", posture: "Built-in" },
  { name: "Audit trail of AI decisions",                   detail: "Every AI call captures: who asked, input (hashed if sensitive), retrieval set IDs, tool calls, structured output, confidence, model + version + prompt hash, timestamp. Written to the main AuditTrail (not a parallel log). FDA inspector can reconstruct any AI recommendation.", posture: "Built-in" },
  { name: "Human-in-the-loop gates",                        detail: "Every AI-drafted artifact must be e-signed by a human before it becomes record. The AI is never the signatory. UI makes it explicit: 'AI-drafted by Claude 4.7 at 2026-04-22 14:33 · Edited by Kenji Tanaka · Approved by James Thompson'.", posture: "Built-in" },
  { name: "On-prem LLM option (GxP-paranoid tenants)",     detail: "Tenant-level config selects a vLLM-hosted Llama 3 in their own VPC. Same gateway API, same prompts, same audit trail. Latency slightly higher, cost often lower at scale, data never leaves the tenant environment.", posture: "Roadmap" },
  { name: "Continuous monitoring",                          detail: "Per-feature dashboards: grounded-rate, confidence distribution, user-override rate, tool-failure rate, latency. Alerts on drift (>5pp drop in grounded-rate week-over-week).", posture: "Roadmap" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD SEQUENCE — 3 waves
// ═══════════════════════════════════════════════════════════════════════════════

const BUILD_WAVES = [
  {
    wave: "Wave 1 · Q1–Q2 2026", theme: "Foundation (6/10)",
    goal: "Move from 4/10 to 6/10. Grounded generative LLM in chat + first inline assists. Validated GxP audit trail for AI. Pluggable LLM gateway.",
    deliverables: [
      "Multi-LLM gateway (Anthropic + OpenAI + Azure) with token accounting + retry/fallback",
      "Grounded-generation runtime with structured-output schema + citation gate",
      "pgvector migration from Mongo-cosine (10M-chunk capacity headroom)",
      "GxP AI audit trail (prompt hash + model version + retrieval set in main AuditTrail)",
      "PII redaction middleware with per-tenant policy",
      "Inline assist: CAPA RCA drafter (first inline form AI)",
      "Inline assist: Deviation 5-why scaffolder",
      "Eval harness: grounded-rate, citation-validity, confidence calibration per feature",
      "Feedback loop scaffolding (thumbs-up/down + 'why not helpful')",
    ],
  },
  {
    wave: "Wave 2 · Q3–Q4 2026", theme: "Cross-Company Audit AI + per-module depth (8/10)",
    goal: "Ship the Cross-Company Audit AI stack — pre-audit intelligence, live follow-up suggester, observation drafter, report assembler. Plus 3 more inline form assists. Active-learning loop live.",
    deliverables: [
      "Supplier risk dossier (FDA + EMA + WHO PQ + customs ingest) [ccaa-8]",
      "Prior-audit pattern miner + questionnaire risk-weighter [ccaa-9, ccaa-10]",
      "Auditor fit-score + COI detector [ccaa-4, ccaa-7]",
      "Real-time follow-up suggester during live audit [ccaa-13]",
      "Live evidence analyser with multi-modal ingest [ccaa-14]",
      "Observation drafter + regulatory-clause tagger [ccaa-18, ccaa-19]",
      "Full-report assembler with citation-chain verification [ccaa-24, ccaa-25]",
      "Tool-calling runtime with mutation tools (e-sig gated)",
      "Multi-step agent runtime for first cross-module flow (overdue-CAPA remediation)",
      "SOP author copilot + multi-framework tagger (Doc Control)",
      "Change-control regulatory-impact classifier",
      "Auto-MRM input populator",
      "Active-learning loop: feedback → retrieval weight tuning",
    ],
  },
  {
    wave: "Wave 3 · Q1–Q2 2027", theme: "Predictive + advanced (10/10)",
    goal: "Ship predictive models, IoT-AI fusion, on-prem LLM option. Complete the per-module AI features. Auditor coach for marketplace. Drift-monitored, A/B-tested, GxP-validated end-to-end.",
    deliverables: [
      "CAPA effectiveness predictor (calibrated probabilities)",
      "Deviation signal detector (cross-deviation clustering)",
      "Bayesian risk scorer for Risk Management module",
      "Predictive maintenance (IoT telemetry → MTBF)",
      "Auditor draft-quality coach for marketplace [ccaa-31, ccaa-32, ccaa-33]",
      "On-prem LLM (vLLM + Llama 3) deployment option",
      "Agent console UI (plan visible, actions revertible, audit-trailed)",
      "Full A/B harness with statistical gating",
      "Drift monitor: scheduled evals, alerting on grounded-rate drop >5pp",
      "Multi-modal audit ingest: photos of cleanrooms, calibration-sticker OCR, video snippets",
      "Complete per-module AI features (Asset, CoC, Regulatory Intel, Supplier Quality)",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUCCESS METRICS
// ═══════════════════════════════════════════════════════════════════════════════

const METRICS = [
  { name: "Grounded-output rate",          target: "≥ 99%",     why: "Every AI output must cite a source. Monitored per feature; alerts <95%." },
  { name: "Ungrounded generations",        target: "0 in GxP mode", why: "Platform-guaranteed. Any ungrounded response in GxP tenants is an incident." },
  { name: "CAPA cycle-time reduction",     target: "≥ 40%",     why: "Veeva pilots report 75%. Conservative Hawkeye target as minimum." },
  { name: "Audit-report generation time",  target: "8 hrs → 30 min", why: "From manual composition to AI-assembled + human-reviewed." },
  { name: "Inline-suggestion acceptance",  target: "≥ 60%",     why: "User accepts the AI suggestion (edit or verbatim) more often than rejects." },
  { name: "Inline-suggestion latency p95", target: "< 3 s",     why: "Faster than the user can switch context. Otherwise the AI is in the way, not helping." },
  { name: "Full AuditTrail coverage",      target: "100%",      why: "Every AI decision traceable. FDA inspectors can reconstruct any recommendation." },
  { name: "False-positive on predictions", target: "< 5%",      why: "Signal detectors must be trustworthy. Higher FP rate = alert fatigue = ignored." },
  { name: "Tenant LLM-provider choice",    target: "4+ providers (Anthropic + OpenAI + Azure + local)", why: "GxP-paranoid tenants need on-prem; others want best-in-class cloud." },
  { name: "Eval pass rate",                target: "≥ 95%",     why: "Every merged prompt change must pass the per-feature eval suite before rollout." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CSS (shared with strategy packs)
// ═══════════════════════════════════════════════════════════════════════════════

const CSS = /* css */`
:root { --bg:#f8fafc; --panel:#ffffff; --ink:#0f172a; --dim:#64748b; --blue:#2563eb; --green:#059669; --purple:#7c3aed; --orange:#ea580c; --red:#dc2626; --amber:#f59e0b; --border:#e2e8f0; }
* { box-sizing: border-box; }
body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:13px; line-height:1.55; color:var(--ink); background:var(--bg); }
.page { max-width:1200px; margin:0 auto; padding:28px; }
.cover { background:linear-gradient(135deg,#4c1d95 0%,#2563eb 100%); color:#fff; padding:56px 48px; border-radius:12px; margin-bottom:32px; }
.cover h1 { margin:0 0 10px 0; font-size:34px; letter-spacing:-0.02em; }
.cover p { margin:4px 0; font-size:15px; opacity:0.94; }
.cover .meta { margin-top:20px; display:flex; gap:12px; flex-wrap:wrap; font-size:12px; }
.cover .meta span { background:rgba(255,255,255,0.15); padding:6px 12px; border-radius:6px; }

h2 { font-size:22px; margin:0 0 14px 0; padding-bottom:8px; border-bottom:2px solid var(--purple); color:var(--ink); }
h3 { font-size:16px; margin:18px 0 8px 0; }
h4 { font-size:12px; margin:12px 0 6px 0; color:var(--dim); text-transform:uppercase; letter-spacing:0.04em; }
p { margin:6px 0; }

.tabs { background:var(--panel); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:32px; }
.tabs input[type=radio]{ display:none; }
.tab-labels { display:flex; background:#f1f5f9; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.tab-labels label { flex:1; padding:12px 14px; cursor:pointer; font-weight:600; font-size:12px; text-align:center; color:var(--dim); border-right:1px solid var(--border); transition:all 0.15s; min-width:115px; }
.tab-labels label:last-child { border-right:none; }
.tab-labels label:hover { background:#e2e8f0; color:var(--ink); }
.tab-content { display:none; padding:28px; background:var(--panel); }
#t1:checked ~ .tab-labels label[for=t1], #t2:checked ~ .tab-labels label[for=t2], #t3:checked ~ .tab-labels label[for=t3], #t4:checked ~ .tab-labels label[for=t4], #t5:checked ~ .tab-labels label[for=t5], #t6:checked ~ .tab-labels label[for=t6], #t7:checked ~ .tab-labels label[for=t7], #t8:checked ~ .tab-labels label[for=t8] { background:var(--panel); color:var(--purple); border-bottom:3px solid var(--purple); }
#t1:checked ~ #c1, #t2:checked ~ #c2, #t3:checked ~ #c3, #t4:checked ~ #c4, #t5:checked ~ #c5, #t6:checked ~ #c6, #t7:checked ~ #c7, #t8:checked ~ #c8 { display:block; }

.card { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:12px; }
.card.pinstripe { border-left:4px solid var(--purple); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.pill { display:inline-block; padding:3px 9px; border-radius:12px; background:#eef2ff; color:#4338ca; font-size:10px; font-weight:700; margin:1px 2px; }
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; color:#fff; margin-right:4px; }
.badge.solid { background:var(--green); } .badge.basic { background:var(--amber); } .badge.missing { background:var(--red); }
.badge.xs { background:#64748b; } .badge.s { background:#0ea5e9; } .badge.m { background:var(--amber); } .badge.l { background:var(--red); }
a { color:var(--blue); } code { font-family:Menlo,Consolas,monospace; background:#f1f5f9; padding:1px 5px; border-radius:3px; font-size:11px; }

.flow { background:#fafafa; border:1px solid var(--border); border-radius:8px; padding:16px; margin:10px 0; }
.flow h4 { margin-top:0; color:var(--ink); text-transform:none; letter-spacing:0; font-size:13px; font-weight:700; }

.phase-block { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:18px; page-break-inside:avoid; }
.phase-block header { display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid var(--border); }
.phase-block header h3 { margin:0; flex:1; }
.phase-block header .count { font-size:10px; background:#f1f5f9; padding:3px 8px; border-radius:10px; font-weight:700; color:var(--dim); }

.feat { border-left:4px solid var(--purple); padding:10px 14px; background:#fafafa; border-radius:6px; margin-bottom:10px; page-break-inside:avoid; }
.feat header { display:flex; gap:8px; align-items:baseline; justify-content:space-between; }
.feat header h4 { margin:0; text-transform:none; letter-spacing:0; color:var(--ink); font-size:13px; font-weight:700; }
.feat header .id { font-family:monospace; font-size:10px; color:var(--dim); }
.feat .mech { font-size:11px; color:var(--dim); margin-top:6px; font-style:italic; }

table.mtx { width:100%; border-collapse:collapse; font-size:11px; margin:10px 0; }
table.mtx th, table.mtx td { padding:7px 9px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
table.mtx th { background:#f1f5f9; font-weight:700; color:var(--dim); text-transform:uppercase; font-size:9px; letter-spacing:0.05em; }
table.mtx tr:nth-child(even){ background:#fafafa; }
table.mtx td.center { text-align:center; }

.kpi-band { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:14px 0; }
.kpi { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center; }
.kpi .big { font-size:22px; font-weight:800; color:var(--purple); }
.kpi .lbl { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:0.05em; margin-top:4px; }

.wave { background:var(--panel); border:1px solid var(--border); border-left:5px solid var(--purple); border-radius:8px; padding:14px 16px; margin-bottom:14px; page-break-inside:avoid; }
.wave header { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; }
.wave header h3 { margin:0; font-size:15px; }
.wave header .w-badge { background:var(--purple); color:#fff; font-weight:700; padding:4px 10px; border-radius:6px; font-size:11px; }
.wave .goal { font-style:italic; color:var(--dim); margin-bottom:10px; }

@media print {
  body { background:#fff; font-size:10.5px; }
  .page { padding:6px; max-width:100%; }
  .tabs { border:none; margin:0; border-radius:0; }
  .tab-labels { display:none; }
  .tab-content { display:block !important; padding:0; border-top:2px solid var(--purple); margin-top:20px; padding-top:14px; page-break-before:always; }
  .tab-content:first-of-type { page-break-before:auto; }
  .tab-content::before { content:attr(data-title); display:block; font-size:22px; font-weight:700; color:var(--purple); border-bottom:2px solid var(--purple); padding-bottom:4px; margin-bottom:14px; }
  .cover { padding:36px 28px; page-break-after:always; }
  .card, .feat, .phase-block, .wave { page-break-inside:avoid; }
  a { color:inherit; text-decoration:none; }
}
`;

// ═══════════════════════════════════════════════════════════════════════════════
// HTML
// ═══════════════════════════════════════════════════════════════════════════════

function renderFeat(f) {
  const effortCls = f.effort ? f.effort.toLowerCase() : "m";
  return `
    <div class="feat">
      <header>
        <h4>${f.name}</h4>
        <div>${f.id ? `<span class="id">${f.id}</span>  ` : ""}${f.effort ? `<span class="badge ${effortCls}">${f.effort}</span>` : ""}</div>
      </header>
      <p>${f.value}</p>
      ${f.mechanism ? `<div class="mech"><strong>How:</strong> ${f.mechanism}</div>` : ""}
    </div>`;
}

function renderCurrentState() {
  return `
    <h2>Where AI is today — code-grounded verdict</h2>
    <p>${AI_TODAY.summary}</p>

    <h3>Dimensional audit</h3>
    <table class="mtx">
      <thead><tr><th>Dimension</th><th>Verdict</th><th>Detail</th></tr></thead>
      <tbody>
        ${AI_TODAY.dimensions.map(d => `
          <tr>
            <td><strong>${d.name}</strong></td>
            <td><span class="badge ${d.verdict.toLowerCase()}">${d.verdict}</span></td>
            <td>${d.detail}</td>
          </tr>`).join("")}
      </tbody>
    </table>

    <h3>Current pipeline (at a glance)</h3>
    <div class="flow"><h4>AskHawk today — retrieval-only, deterministic composition</h4><div class="mermaid">${AI_TODAY.currentMermaid}</div></div>

    <h3>1-paragraph verdict</h3>
    <div class="card pinstripe">
      <p>Hawkeye's AI today is a <strong>rule-based compliance search engine</strong>, not a co-pilot. It retrieves with care, grounds with discipline, and refuses to guess — all good foundations. But it does not <em>draft</em> CAPAs or <em>reason</em> across modules or <em>act</em> on findings. To hit 10/10 we need a grounded generative layer on top of the existing retrieval, a pluggable LLM gateway so pharma-paranoid tenants can run on-prem, an agent runtime that can take actions (with e-sig gates), and inline assists inside every form — not just a chat sidebar. Everything we build must preserve what's already solid: grounding enforcement, confidence gates, and conversation logging.</p>
    </div>
  `;
}

function renderCrossCompanyAudit() {
  const total = CROSS_COMPANY_AUDIT_AI.reduce((a, p) => a + p.features.length, 0);
  return `
    <h2>Cross-Company Audit AI — 10/10 spec</h2>
    <p>This is the unique moat. No competitor has a marketplace for third-party audits, which means no competitor can build AI features like "auditor fit-score", "supplier risk dossier", or "auditor quality coach". <strong>33 features across 8 phases</strong> — each one actionable, each one with a mechanism and a build-effort tag.</p>

    <div class="kpi-band">
      <div class="kpi"><div class="big">${total}</div><div class="lbl">AI features</div></div>
      <div class="kpi"><div class="big">8</div><div class="lbl">audit lifecycle phases</div></div>
      <div class="kpi"><div class="big">XS · S · M · L</div><div class="lbl">effort tags</div></div>
      <div class="kpi"><div class="big">0</div><div class="lbl">competitor parity</div></div>
    </div>

    ${CROSS_COMPANY_AUDIT_AI.map(p => `
      <div class="phase-block" style="border-top:4px solid ${p.color}">
        <header>
          <h3 style="color:${p.color}">${p.phase}</h3>
          <span class="count">${p.features.length} features</span>
        </header>
        ${p.features.map(renderFeat).join("")}
      </div>
    `).join("")}
  `;
}

function renderPerModuleAI() {
  return `
    <h2>Per-module AI — 10/10 targets</h2>
    <p>Each of the 15 EQMS modules gets 2–5 AI features that are visible in the UI, grounded by the platform, and logged to the GxP audit trail. Nothing below is speculative — every feature has a clear mechanism and a build-effort tag.</p>

    ${PER_MODULE_AI.map(m => `
      <div class="phase-block">
        <header>
          <h3>${m.moduleName} <code>${m.module}</code></h3>
          <span class="count">${m.features.length} features</span>
        </header>
        ${m.note ? `<p style="font-size:11px; color:var(--dim); margin-bottom:10px;"><em>${m.note}</em></p>` : ""}
        ${m.features.map(renderFeat).join("")}
      </div>
    `).join("")}
  `;
}

function renderArchitecture() {
  return `
    <h2>AI reference architecture (target)</h2>
    <p>Six layers. Each independently testable. Each auditable. Each works with any LLM provider.</p>

    <div class="flow"><h4>Target AI platform</h4><div class="mermaid">${AI_ARCH.target}</div></div>

    <h3>Layer-by-layer</h3>
    <div class="grid3">
      <div class="card pinstripe"><h4>User surfaces</h4><p>Chat drawer (AskHawk) · inline form assists (CAPA, deviation, finding) · agent console for multi-step plans.</p></div>
      <div class="card pinstripe"><h4>AI runtime</h4><p>LLM gateway · grounded-gen runtime · tool-calling runtime · multi-step agent · PII redaction.</p></div>
      <div class="card pinstripe"><h4>Retrieval</h4><p>pgvector / Pinecone · pluggable embedder · hybrid (BM25 + dense) retriever with optional LLM re-rank.</p></div>
      <div class="card pinstripe"><h4>Knowledge</h4><p>Controlled docs · SOPs · evidence corpus · FDA/EMA regulatory corpus · tenant-scoped at storage + query.</p></div>
      <div class="card pinstripe"><h4>Quality + learning</h4><p>Eval harness · A/B runner · active-learning loop · drift monitor.</p></div>
      <div class="card pinstripe"><h4>GxP trail</h4><p>AuditTrail extension · prompt-hash + model-version registry · inspector view for FDA reconstruction.</p></div>
    </div>

    <h3>Deployment topologies</h3>
    <div class="grid2">
      <div class="card"><h4>Cloud (default)</h4><p>LLM gateway routes to Anthropic / OpenAI / Azure via tenant config. Redaction before egress. Faster, cheaper at startup scale.</p></div>
      <div class="card"><h4>On-prem (GxP-paranoid)</h4><p>vLLM-hosted Llama 3.x in tenant's VPC. Same gateway API. Data never leaves tenant environment. Latency higher but compliance simpler.</p></div>
    </div>
  `;
}

function renderBuildingBlocks() {
  return `
    <h2>AI building blocks — reusable primitives</h2>
    <p>Every AI feature across the 15 modules and Cross-Company Audit composes from the same 9 primitives. Build these once, right; every feature above becomes a thin wrapper.</p>

    ${BUILDING_BLOCKS.map(b => `
      <div class="feat">
        <header>
          <h4>${b.name}</h4>
          <div><span class="badge ${b.effort.toLowerCase()}">${b.effort}</span></div>
        </header>
        <p><strong>Role:</strong> ${b.role}</p>
        <div class="mech"><strong>Components:</strong> ${b.components}</div>
      </div>
    `).join("")}
  `;
}

function renderValidation() {
  return `
    <h2>Validation &amp; safety — GxP-grade AI</h2>
    <p>Pharma buyers will refuse AI that can't pass an FDA inspection. These are non-negotiable.</p>
    ${VALIDATION_SAFETY.map(v => `
      <div class="card pinstripe">
        <header style="display:flex; justify-content:space-between; align-items:baseline;">
          <h3 style="margin:0;">${v.name}</h3>
          <span class="badge ${v.posture === "Aligned" || v.posture === "Built-in" ? "solid" : "basic"}">${v.posture}</span>
        </header>
        <p>${v.detail}</p>
      </div>
    `).join("")}
  `;
}

function renderBuildSequence() {
  return `
    <h2>Build sequence — three waves to 10/10</h2>
    <p>Each wave moves the AI maturity score up by ~2 points and is independently shippable. Every wave delivers inline user-facing AI and a platform capability.</p>

    ${BUILD_WAVES.map(w => `
      <div class="wave">
        <header><span class="w-badge">${w.wave}</span><h3>${w.theme}</h3></header>
        <div class="goal">${w.goal}</div>
        <h4>Deliverables</h4>
        <ul>
          ${w.deliverables.map(d => `<li>${d}</li>`).join("")}
        </ul>
      </div>
    `).join("")}

    <h3>Effort legend</h3>
    <p><span class="badge xs">XS</span> &lt; 1 week · <span class="badge s">S</span> 1-3 weeks · <span class="badge m">M</span> 3-8 weeks · <span class="badge l">L</span> 8+ weeks (may span multiple team members)</p>
  `;
}

function renderMetrics() {
  return `
    <h2>Success metrics — how we know we hit 10/10</h2>
    <p>Instrumented per-feature from Wave 1. Dashboards live before the first AI feature ships.</p>

    <table class="mtx">
      <thead><tr><th>Metric</th><th class="center">Target</th><th>Why it matters</th></tr></thead>
      <tbody>
        ${METRICS.map(m => `
          <tr>
            <td><strong>${m.name}</strong></td>
            <td class="center"><span class="pill">${m.target}</span></td>
            <td>${m.why}</td>
          </tr>`).join("")}
      </tbody>
    </table>

    <h3>Per-feature rollout gates</h3>
    <div class="card pinstripe">
      <p>Before any AI feature moves from <code>internal</code> to <code>beta</code> to <code>GA</code>:</p>
      <ol>
        <li><strong>Eval gate:</strong> feature-specific eval suite passes ≥ 95%.</li>
        <li><strong>Grounding gate:</strong> grounded-output rate ≥ 99% on the eval dataset.</li>
        <li><strong>Latency gate:</strong> p95 latency meets the target for that surface (3s inline, 10s chat, 60s report assembly).</li>
        <li><strong>Safety gate:</strong> no ungrounded generation events in 500 test calls.</li>
        <li><strong>Audit-trail gate:</strong> 100% of calls written to main AuditTrail.</li>
        <li><strong>User-acceptance gate (beta):</strong> ≥ 50% acceptance rate from design partners.</li>
      </ol>
    </div>

    <h3>The 10/10 bar — what we're committing to</h3>
    <div class="grid2">
      ${TEN_TEN_PRINCIPLES.map(p => `<div class="card pinstripe"><h4>${p.name}</h4><p>${p.detail}</p></div>`).join("")}
    </div>
  `;
}

function buildHtml() {
  return `<!doctype html>
<html><head>
<meta charset="utf-8"><title>Hawkeye · Pharma EQMS · AI Gap Spec (10/10)</title>
<style>${CSS}</style>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad:true, securityLevel:"loose", theme:"default" });
</script>
</head><body>
<div class="page">

<section class="cover">
  <h1>Hawkeye · Pharma EQMS</h1>
  <p style="font-size:18px; font-weight:500;">AI Gap Specification — Path to 10/10</p>
  <p>Cross-Company Audit AI · Per-module AI · Reference architecture · Validation · Build sequence</p>
  <div class="meta">
    <span>Audience: Eng + Product + Compliance</span>
    <span>Horizon: Q1 2026 → Q2 2027 (3 waves)</span>
    <span>Generated: ${new Date().toISOString().slice(0,10)}</span>
  </div>
</section>

<div class="tabs">
  <input type="radio" id="t1" name="tabs" checked><input type="radio" id="t2" name="tabs">
  <input type="radio" id="t3" name="tabs"><input type="radio" id="t4" name="tabs">
  <input type="radio" id="t5" name="tabs"><input type="radio" id="t6" name="tabs">
  <input type="radio" id="t7" name="tabs"><input type="radio" id="t8" name="tabs">
  <div class="tab-labels">
    <label for="t1">1 · Today (4/10)</label>
    <label for="t2">2 · Cross-Co Audit AI</label>
    <label for="t3">3 · Per-Module AI</label>
    <label for="t4">4 · Architecture</label>
    <label for="t5">5 · Building Blocks</label>
    <label for="t6">6 · Validation &amp; Safety</label>
    <label for="t7">7 · Build Sequence</label>
    <label for="t8">8 · Metrics &amp; Gates</label>
  </div>

  <div class="tab-content" id="c1" data-title="1 · Today (4/10)">${renderCurrentState()}</div>
  <div class="tab-content" id="c2" data-title="2 · Cross-Company Audit AI">${renderCrossCompanyAudit()}</div>
  <div class="tab-content" id="c3" data-title="3 · Per-Module AI">${renderPerModuleAI()}</div>
  <div class="tab-content" id="c4" data-title="4 · Reference Architecture">${renderArchitecture()}</div>
  <div class="tab-content" id="c5" data-title="5 · Building Blocks">${renderBuildingBlocks()}</div>
  <div class="tab-content" id="c6" data-title="6 · Validation &amp; Safety">${renderValidation()}</div>
  <div class="tab-content" id="c7" data-title="7 · Build Sequence">${renderBuildSequence()}</div>
  <div class="tab-content" id="c8" data-title="8 · Metrics &amp; Gates">${renderMetrics()}</div>
</div>

</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

mkdirSync(OUT_DIR, { recursive: true });
const htmlPath = join(OUT_DIR, "pharma-ai-gap-spec.html");
const pdfPath = join(OUT_DIR, "pharma-ai-gap-spec.pdf");

const html = buildHtml();
writeFileSync(htmlPath, html);
console.log(`  ✓ HTML written: ${htmlPath} (${Math.round(html.length / 1024)} KB)`);

if (htmlOnly) {
  console.log("  (--html-only — skipping PDF step)");
  process.exit(0);
}

console.log("  rendering PDF via headless Chromium…");
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.waitForTimeout(3500); // Mermaid
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await ctx.close();
await browser.close();
console.log(`  ✓ PDF written: ${pdfPath}`);
