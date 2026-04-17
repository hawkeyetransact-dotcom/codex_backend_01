/**
 * seed-askhawk-comprehensive-kb.mjs
 *
 * Seeds a comprehensive knowledge base for AskHawk with 3 layers:
 *
 *   Layer 1: Domain Knowledge (pharma GMP, EQMS standards, regulatory context)
 *   Layer 2: Data Interpretation (how to read audit statuses, KPIs, risk scores)
 *   Layer 3: Feature How-To Guides (step-by-step per module per role)
 *
 * This is READ-WRITE — it creates KbArticle + KbChunk records in MongoDB.
 *
 * Usage:
 *   node scripts/seed-askhawk-comprehensive-kb.mjs                    # all tenants
 *   node scripts/seed-askhawk-comprehensive-kb.mjs --tenant <id>      # specific tenant
 *   node scripts/seed-askhawk-comprehensive-kb.mjs --dry-run           # preview only
 */
import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import KbArticle from "../src/models/kbArticleModel.js";
import KbChunk from "../src/models/kbChunkModel.js";

const dryRun = process.argv.includes("--dry-run");
const specificTenant = process.argv.find((a, i) => process.argv[i - 1] === "--tenant");

await mongoose.connect(process.env.MONGO_URI);
console.log("DB:", mongoose.connection.db.databaseName, dryRun ? "(DRY RUN)" : "(LIVE)");

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const KB_ARTICLES = [

  // ────────────────────────────────────────────────────────────────────────────
  // LAYER 1: DOMAIN KNOWLEDGE (Contextual Q&A with guardrails)
  // ────────────────────────────────────────────────────────────────────────────
  {
    title: "What is a GMP Audit and why is it required?",
    slug: "domain-gmp-audit-overview",
    role: "ALL",
    productArea: "application_reference",
    tags: ["gmp", "audit", "regulatory", "fda", "who", "pharma"],
    chunks: [
      `A GMP (Good Manufacturing Practice) audit is a systematic examination of a pharmaceutical manufacturing facility to verify compliance with quality standards. GMP audits are required by regulatory authorities including the FDA (21 CFR Parts 210/211), EU GMP (EudraLex Volume 4), WHO GMP guidelines, and ICH Q7 (for APIs).

There are several types of GMP audits:
- **Pre-Approval Inspection (PAI)**: Before a new drug application is approved
- **Routine Surveillance**: Periodic inspections every 2-3 years
- **For-Cause**: Triggered by complaints, recalls, or regulatory signals
- **Supplier Qualification**: Buyer audits their API/excipient suppliers

In HawkEye, audits follow an 8-phase lifecycle: INITIATED → PREP → PLANNING → EXECUTION → FINDINGS → CAPA → CLOSURE → SURVEILLANCE. Each phase has defined artifacts, milestones, and responsible parties.`,

      `GMP audit findings are classified by severity per WHO/EU GMP/PIC/S standards:

- **CRITICAL**: A deficiency that has produced, or leads to significant risk of producing, a product harmful to the patient. Requires immediate corrective action (CAPA plan within 15 days).
- **MAJOR**: A non-critical deviation from GMP that could result in manufacturing a product not in accordance with its marketing authorization. CAPA plan required within 30 days.
- **MINOR**: A departure from GMP that does not directly impact product quality. CAPA plan within 60 days.
- **OBSERVATION**: An area for improvement, not a formal deficiency. Response is optional.

Facility outcomes after audit:
- **SATISFACTORY**: No critical deficiencies, ≤5 major findings, all addressed
- **CONDITIONALLY SATISFACTORY**: Major findings present but CAPA plan accepted
- **UNSATISFACTORY**: Critical deficiencies found, rejection or re-audit recommended

The FDA uses a different classification: NAI (No Action Indicated), VAI (Voluntary Action Indicated), OAI (Official Action Indicated).`,
    ],
  },

  {
    title: "What is CAPA and how does it work?",
    slug: "domain-capa-explained",
    role: "ALL",
    productArea: "capa_management",
    tags: ["capa", "corrective", "preventive", "root-cause", "quality"],
    chunks: [
      `CAPA stands for Corrective and Preventive Action. It is a systematic process for investigating quality issues, identifying root causes, implementing fixes, and preventing recurrence. CAPA is required by ICH Q10, ISO 9001 clause 10.2, and 21 CFR 820.90.

In HawkEye, CAPA V2 has a 19-status lifecycle:
1. DRAFT_CANDIDATE → INTAKE_DRAFT → UNDER_TRIAGE
2. TRIAGE_NO_CAPA (closed) or CORRECTION_ONLY or CAPA_OPEN
3. INVESTIGATION_IN_PROGRESS → RCA_PENDING_APPROVAL
4. ACTION_PLAN_PENDING_APPROVAL → ACTION_PLAN_APPROVED
5. IN_IMPLEMENTATION → AWAITING_EFFECTIVENESS_CHECK
6. EFFECTIVENESS_REVIEW_IN_PROGRESS
7. CLOSED_EFFECTIVE or CLOSED_INEFFECTIVE or REOPENED

Root Cause Analysis (RCA) methods supported:
- 5-Why analysis
- Fishbone (Ishikawa) diagram
- Fault Tree Analysis
- Pareto analysis

CAPAs can be auto-generated from audit findings, deviations, or complaints. The AI can suggest CAPA candidates from audit evidence.`,
    ],
  },

  {
    title: "What is ICH Q7 and what does it cover?",
    slug: "domain-ich-q7",
    role: "ALL",
    productArea: "compliance",
    tags: ["ich", "q7", "api", "gmp", "regulatory", "standards"],
    chunks: [
      `ICH Q7 is the international guideline for Good Manufacturing Practice for Active Pharmaceutical Ingredients (APIs). It covers 19 major areas:

1. Quality Management (quality unit, responsibilities)
2. Personnel (qualifications, training, hygiene)
3. Buildings and Facilities (design, utilities, environmental controls)
4. Process Equipment (design, maintenance, calibration)
5. Documentation and Records (SOPs, batch records, retention)
6. Materials Management (specifications, testing, release)
7. Production and In-Process Controls (blending, yields, contamination)
8. Packaging and Labeling (materials, operations, tamper-evidence)
9. Storage and Distribution (warehousing, shipment, expiry)
10. Laboratory Controls (testing, OOS investigations, stability)
11. Validation (process, cleaning, analytical, computer systems)
12. Change Control (evaluation, approval, implementation)
13. Rejection and Re-use (investigation, reworking, returns)
14. Complaints and Recalls (handling, investigation, reporting)
15. Contract Manufacturers and Labs (responsibilities, auditing)
16. Agents and Brokers (traceability, qualification)
17. Specific Guidance for APIs by Cell Culture/Fermentation
18. Specific Guidance for APIs for Use in Clinical Trials
19. Glossary

In HawkEye, the audit execution questionnaire template (Template 3: Full PSCI SAQ) contains 98 questions mapped across these ICH Q7 sections.`,
    ],
  },

  {
    title: "What is 21 CFR Part 11 and how does HawkEye comply?",
    slug: "domain-cfr-part11",
    role: "ALL",
    productArea: "compliance",
    tags: ["cfr", "part11", "electronic-signatures", "fda", "compliance", "alcoa"],
    chunks: [
      `21 CFR Part 11 is the FDA regulation governing electronic records and electronic signatures. It requires that electronic records are trustworthy, reliable, and equivalent to paper records.

Key requirements and how HawkEye addresses them:

**§11.10 Controls for closed systems:**
- Validated system → Playwright E2E test suite (120+ tests across 6 layers)
- Unique user ID + password → JWT authentication with bcrypt password hashing
- Audit trail → DataIntegrityLog model captures all changes with before/after states
- Operational checks → Role-based middleware (7 roles, per-route permissions)
- Authority checks → permit() middleware enforces role-based access
- Device checks → Session timeout, cookie-based auth

**§11.50 Signature manifestations:**
- Each e-signature includes: signer name, date/time, meaning (AUTHORED/REVIEWED/APPROVED/WITNESSED)
- Stored in ElectronicSignature model with SHA-256 content hash

**§11.70 Signature/record linking:**
- Signatures bound to specific records via recordType + recordId + contentHash
- Hash verification endpoint: POST /api/signatures/verify

**ALCOA+ Data Integrity (FDA Guidance 2018):**
- Attributable: userId, IP address, user agent logged
- Legible: Structured JSON records, human-readable descriptions
- Contemporaneous: Server-generated timestamps (not client-provided)
- Original: Content hash preserves original state at signing
- Accurate: Validated against Mongoose schemas before storage
- Complete: Before/after states captured in DataIntegrityLog
- Consistent: Sequential entryNumber per record, no gaps
- Enduring: MongoDB with backup/restore procedures
- Available: Indexed for efficient retrieval during inspections`,
    ],
  },

  {
    title: "Understanding deviations and non-conformances in pharma",
    slug: "domain-deviations-nc",
    role: "ALL",
    productArea: "application_reference",
    tags: ["deviation", "non-conformance", "nc", "investigation", "disposition"],
    chunks: [
      `A deviation is a departure from an approved instruction or established standard. In pharmaceutical manufacturing, deviations must be documented, investigated, and resolved per 21 CFR 211.192 and EU GMP Chapter 1.

Types:
- **Planned deviation**: An intentional, pre-approved departure (e.g., temporary process change during equipment maintenance)
- **Unplanned deviation**: An unexpected departure that needs investigation

Categories in HawkEye: PROCESS, EQUIPMENT, MATERIAL, DOCUMENTATION, ENVIRONMENTAL, LABORATORY, PACKAGING, STORAGE, PERSONNEL, OTHER

Classification: CRITICAL, MAJOR, MINOR

The deviation lifecycle in HawkEye follows 9 statuses:
REPORTED → UNDER_ASSESSMENT → UNDER_INVESTIGATION → PENDING_DISPOSITION → PENDING_CAPA_DECISION → CAPA_REQUIRED → PENDING_CLOSURE → CLOSED

Key actions:
1. Report: Anyone can report a deviation immediately
2. Assess impact: Product quality, patient safety, batch disposition, regulatory impact
3. Investigate: Root cause analysis (5-Why, Fishbone, Fault Tree, Pareto)
4. Dispose: Release, Reject, Rework, Reprocess, or Quarantine the affected batch
5. CAPA decision: Determine if corrective/preventive action is needed
6. Close: Document closure with notes

Deviations can auto-create linked CAPA records when the CAPA decision is set to "required" with autoCreateCapa=true.`,
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // LAYER 2: DATA INTERPRETATION (How to read app data)
  // ────────────────────────────────────────────────────────────────────────────
  {
    title: "Understanding audit statuses and what they mean",
    slug: "data-audit-statuses",
    role: "ALL",
    productArea: "questionnaire_and_artifacts",
    tags: ["audit", "status", "phase", "trackstatus", "questionnaire-status"],
    chunks: [
      `HawkEye audits have three status tracking fields that are kept in sync:

**trackStatus** (narrative, human-readable):
- "Request Created (Incomplete)" — Buyer just created the request
- "Audit intimation sent" — Buyer sent the notification to supplier
- "Supplier accepted intimation" — Supplier agreed to the audit
- "Auditor selected" — Buyer assigned an auditor
- "Request sent to Supplier" — Execution questionnaire sent
- "Response completed" — Supplier submitted their responses
- "Closed" — Audit is complete

**questionnaireStatus** (questionnaire workflow):
- request_received → in_progress → sent_to_supplier → supplier_draft → supplier_submitted → followup_requested → followup_submitted → review_completed → auditor_submitted

**high_status** (numeric, 1-5):
- 1 = Request created
- 2 = Auditor assigned
- 3 = Questionnaire sent
- 4 = Response received
- 5 = Complete/closed

**phaseState** (structured, 8 phases):
Each phase has: status (NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED), startedAt, completedAt, ownerRole

When you see "supplierVisible: false", the supplier cannot see this audit yet. It becomes true when the intimation letter is sent.

When you see "nextAuditOn: buyer", it means the ball is in the buyer's court to take the next action.`,
    ],
  },

  {
    title: "Understanding quality KPIs and metrics",
    slug: "data-quality-kpis",
    role: "ALL",
    productArea: "reporting",
    tags: ["kpi", "metrics", "dashboard", "management-review", "quality"],
    chunks: [
      `HawkEye provides quality KPIs via the GET /api/quality/kpis endpoint. These are used in Management Reviews and dashboards.

**Audit KPIs:**
- total: Number of audit requests in the period
- closed: Number completed (high_status = 5)
- closureRate: Percentage closed (target: >80%)

**CAPA KPIs:**
- total: All CAPAs in period
- closed: CAPAs with CLOSED status
- overdue: CAPAs past target date that aren't closed
- onTimeRate: Percentage closed on time (target: >90%)

**Deviation KPIs:**
- total: All deviations reported
- critical: Number classified as CRITICAL (should be trending down)

**Training KPIs:**
- total: Training assignments
- completed: Successfully completed
- overdue: Past due date, not completed
- complianceRate: Percentage completed (target: >95%)

**Equipment KPIs:**
- calibrationOverdue: Equipment past calibration due date

**Document KPIs:**
- pendingReview: Documents with reviewDueDate in the past

**Supplier Scorecard** (GET /api/quality/supplier-scorecard/:id):
- Overall score (0-100): Weighted formula = 40% audit outcomes + 30% CAPA performance + 30% base, minus deviation/complaint penalties
- Risk band: LOW_RISK (≥80), MEDIUM_RISK (≥60), HIGH_RISK (<60)

**Risk RPN** (Risk Priority Number):
- Calculated as: Severity × Occurrence × Detectability (each 1-10)
- Risk bands: CRITICAL (≥200), HIGH (≥125), MEDIUM (≥60), LOW (<60)
- After mitigation, residual RPN should be in LOW or MEDIUM band`,
    ],
  },

  {
    title: "Understanding supplier visibility and audit scoping rules",
    slug: "data-supplier-visibility",
    role: "ALL",
    productArea: "questionnaire_and_artifacts",
    tags: ["supplier", "visibility", "scoping", "tenant", "access"],
    chunks: [
      `In HawkEye, audit visibility follows strict rules to protect supplier privacy:

**When can the supplier see an audit?**
A supplier can see an audit in their list only if ANY of these is true:
1. supplierVisible = true (explicitly set when intimation is sent)
2. questionnaireStatus is in: sent_to_supplier, supplier_draft, supplier_submitted, followup_requested, followup_submitted, review_completed, auditor_submitted
3. supplierDecision is ACCEPTED, PROPOSED, or REJECTED (they've already interacted)
4. trackStatus mentions intimation/supplier actions

**Who sees what in audit lists?**
- Buyer: Sees audits they created (create_by_buyer_id = their user ID)
- Auditor: Sees audits assigned to them (auditor_id or in assignedAuditors array)
- Supplier: Sees audits where they're the supplier AND visibility rules pass
- Tenant Admin: Sees all audits in their tenant
- Superadmin: Sees everything

**Tenant fallback**: If a user has ZERO personal audit records, they see all audits in their tenant (including null-tenant records). This enables demo/shared data.

**Auditor assignment rules**:
- Cannot assign auditor until supplier has accepted the intimation (supplier-first flow)
- This is enforced by isSupplierInitiationAcknowledged() check`,
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  // LAYER 3: FEATURE HOW-TO GUIDES (Step-by-step per module)
  // ────────────────────────────────────────────────────────────────────────────
  {
    title: "How to create a new audit request (Buyer)",
    slug: "howto-create-audit-buyer",
    role: "BUYER",
    productArea: "questionnaire_and_artifacts",
    tags: ["audit", "create", "request", "buyer", "how-to"],
    chunks: [
      `To create a new supplier audit request as a Buyer:

1. Navigate to /request-audit (or click Quality → Request Audit in the nav bar)
2. Fill the form:
   - Select Supplier: Choose from registered suppliers
   - Select Product: The API product being audited
   - Select Site: The manufacturing facility to audit
   - Audit ETA: Target audit date (must be ≥7 business days from today, weekday only)
   - Intimation Letter Template (optional): Pre-fills the letter
   - Pre-Audit Questionnaire Template (optional): Configures PAQ questions
3. Click "Request" to submit

The system auto-generates:
- Unique audit ID (HAWK0000000XXX)
- 6 draft artifacts: Intimation Letter, PAQ, Scope, Execution Questionnaire, Findings Log, Final Report
- Milestone tracking records
- Phase state (INITIATED = IN_PROGRESS)

After creation, go to the audit's Artifacts tab and click "Send to Supplier" on the Intimation Letter to make the audit visible to the supplier.

Note: The system prevents duplicate audits for the same buyer + supplier + product + site combination (returns HTTP 409).`,
    ],
  },

  {
    title: "How to respond to an audit (Supplier)",
    slug: "howto-respond-audit-supplier",
    role: "SUPPLIER",
    productArea: "questionnaire_and_artifacts",
    tags: ["audit", "respond", "supplier", "questionnaire", "how-to"],
    chunks: [
      `As a Supplier, when a buyer initiates an audit:

1. **Check your Audit Summary** (/audits): New audits appear after the buyer sends the intimation letter. You'll also get an email/in-app notification.

2. **Review the Intimation Letter**: Open the audit → read the scope, dates, and audit team.

3. **Accept or Reject**: Three options:
   - Accept: Agree to the proposed dates. A calendar reservation is created.
   - Propose Dates: Suggest alternative dates if the proposed ones don't work.
   - Reject: Cannot accommodate this audit (buyer is notified).

4. **Complete Pre-Audit Questionnaire**: Once the auditor sends the PAQ, go to /audits/[id]/questionnaire. Answer each section, upload supporting documents.

5. **Fill Execution Questionnaire**: When the full questionnaire is sent:
   - Answer questions per category (Quality System, Production, Laboratory, etc.)
   - For each question: select Yes/No/Partial, provide explanation, attach evidence
   - Save as draft periodically
   - Click Submit when all sections are complete

6. **Submit CAPA Plan**: After the auditor logs findings, provide a corrective action plan:
   - Root cause analysis for each Critical/Major finding
   - Corrective action with timeline
   - Preventive action to avoid recurrence
   - Timeline: Critical=15 days, Major=30 days, Minor=60 days`,
    ],
  },

  {
    title: "How to conduct an audit (Auditor)",
    slug: "howto-conduct-audit-auditor",
    role: "AUDITOR",
    productArea: "questionnaire_and_artifacts",
    tags: ["audit", "conduct", "auditor", "execution", "report", "how-to"],
    chunks: [
      `As an Auditor assigned to an audit:

1. **Accept the Assignment**: Open the audit in your Audit Summary. Review scope and supplier. Accept or reject the engagement.

2. **Prepare Scope & Agenda**: Go to Artifacts tab → edit SCOPE and AGENDA documents. Add your signature. Click "Send to Supplier" for their sign-off.

3. **Build & Send Questionnaire**: Open the EXECUTION_QUESTIONNAIRE artifact. Select a template (e.g. Template 3: Full PSCI SAQ — 98 questions). Review/customize questions. Click "Send to Supplier".
   - Note: Scope & Agenda must have supplier signature before execution questionnaire can be sent.

4. **Review Responses**: After supplier submits, open the questionnaire in review mode. For each answer:
   - Accept the response
   - Flag for follow-up (reopens for supplier)
   - Request additional evidence
   - Log as a finding

5. **Classify Findings**: Use GMP classification:
   - CRITICAL: Risk to patient safety → CAPA within 15 days
   - MAJOR: Significant GMP departure → CAPA within 30 days
   - MINOR: Minor departure → CAPA within 60 days
   - OBSERVATION: Improvement area → optional response

6. **Generate Report**: Go to Report tab. The AI can auto-generate a WHOPIR-format report. Review draft, add observations, collect signatures. Publish.

7. **Set Facility Outcome**: SATISFACTORY, CONDITIONALLY SATISFACTORY, or UNSATISFACTORY.`,
    ],
  },

  {
    title: "How to use Document Control",
    slug: "howto-document-control",
    role: "ALL",
    productArea: "application_reference",
    tags: ["document", "control", "sop", "version", "approve", "publish", "how-to"],
    chunks: [
      `Document Control manages SOPs, policies, and work instructions. Navigate to /document-control.

**Create a document:**
1. Click "+ New Document"
2. Enter title, select type (SOP/Policy/Work Instruction/Specification/etc.)
3. Add scope description
4. The system auto-assigns DOC-YYYY-NNNN number

**Approval workflow:**
1. Document starts as DRAFT
2. Route for approval (add approval steps with reviewers/approvers)
3. Each approver reviews and signs electronically
4. All approvals complete → status becomes APPROVED

**Publish:**
1. Click "Publish" on an APPROVED document
2. Set effective date (defaults to today)
3. Status becomes EFFECTIVE
4. If requiresTrainingOnUpdate is enabled, training records are auto-assigned to affected users

**Create a new version (Supersede):**
1. Click "Supersede" on an EFFECTIVE document
2. A new DRAFT version is created (major version incremented)
3. The original document moves to SUPERSEDED status

**Withdraw:**
- Click "Withdraw" to remove a document from circulation (with reason)
- Status becomes WITHDRAWN

**Document types available:** SOP, Policy, Work Instruction, Form, Specification, Protocol, Report Template, Guideline, Regulatory Submission, Custom`,
    ],
  },

  {
    title: "How to report and manage deviations",
    slug: "howto-deviation-management",
    role: "ALL",
    productArea: "application_reference",
    tags: ["deviation", "nc", "report", "investigate", "how-to"],
    chunks: [
      `Navigate to /nonconformance to manage deviations and non-conformances.

**Report a deviation:**
1. Click "+ Report Deviation"
2. Fill: Title, Description, Type (Planned/Unplanned), Classification (Critical/Major/Minor)
3. Select Category (Process/Equipment/Material/Environmental/Laboratory/etc.)
4. Enter Department, Area, Process Step
5. Document immediate actions taken
6. Auto-numbered: DEV-YYYY-NNNN

**Assess impact:**
Click "Assess" on a REPORTED deviation:
- Product quality impact assessment
- Patient safety impact assessment
- Batch disposition decision (Release/Reject/Rework/Reprocess/Quarantine)
- Regulatory impact assessment

**Investigate root cause:**
Click "Investigate":
- Select RCA method: 5-Why, Fishbone, Fault Tree, Pareto, Brainstorm
- Enter investigation summary and root cause
- Select root cause category: Human Error, Equipment Failure, Material Defect, Process Gap, Environmental, Documentation, Training, Supplier, Design

**Dispose and CAPA:**
- Set final batch disposition
- Decide if CAPA is required
- Option to auto-create a linked CAPA record (autoCreateCapa=true)

**Close:**
- Add closure notes
- Status moves to CLOSED`,
    ],
  },

  {
    title: "How to manage equipment and calibration",
    slug: "howto-equipment-calibration",
    role: "ALL",
    productArea: "application_reference",
    tags: ["equipment", "calibration", "asset", "maintenance", "how-to"],
    chunks: [
      `Navigate to /asset-management to manage equipment and calibration.

**Register equipment:**
1. Click "+ New Equipment"
2. Enter: Name, Type (Analytical Instrument/Production Equipment/Utility/Measuring Device/IT System), Location, Manufacturer, Model, Serial Number
3. Set calibration requirements: requiresCalibration, calibrationFrequencyDays
4. Auto-numbered: EQ-YYYY-NNNN

**Record calibration:**
1. Find the equipment in the list
2. Click "Record Calibration"
3. Enter: Performed by, Date, Result (PASS/FAIL/CONDITIONAL), Certificate reference, Notes
4. System auto-calculates next calibration due date based on frequency

**Calibration results:**
- PASS → calibrationStatus = CURRENT, equipment stays ACTIVE
- FAIL → equipment status changes to QUARANTINED, calibrationStatus = OVERDUE
- CONDITIONAL → calibrationStatus = DUE_SOON

**Status colors:**
- CURRENT (green): Calibration up to date
- DUE_SOON (yellow): Calibration due within 14 days
- OVERDUE (red): Past due date — immediate attention needed

**Retire equipment:**
- Click Delete on equipment → soft retires (status = RETIRED, decommissionedAt set)
- Retired equipment preserved in records for audit trail`,
    ],
  },

  {
    title: "How to manage training and competency",
    slug: "howto-training-management",
    role: "ALL",
    productArea: "application_reference",
    tags: ["training", "competency", "assignment", "assessment", "how-to"],
    chunks: [
      `Navigate to /training to manage training records and competency tracking.

**Assign training:**
1. Click "+ New Training"
2. Enter: Title, Type (GMP/SOP Read & Understand/Regulatory/Safety/Technical/Process/Quality System/Onboarding/Custom)
3. Assign trainee (name, role, department)
4. Set due date
5. Optionally link to a Document Control record

**Complete training:**
1. Find the training record in the list
2. Click "Complete"
3. Set competency level: AWARE, COMPETENT, PROFICIENT, or EXPERT
4. Enter assessment details:
   - Type: Written Test, Practical, Observation, Sign-Off, or Oral Exam
   - Score and passing score
   - Assessor notes
5. Record training duration (minutes)

**Auto-assigned training:**
When a document with requiresTrainingOnUpdate=true is published, training records are automatically created for all active users in the tenant.

**Recurring training:**
Set isRecurring=true with recurrenceMonths to auto-schedule follow-up training when the current one is completed.

**Status flow:** ASSIGNED → IN_PROGRESS → COMPLETED / OVERDUE / WAIVED / FAILED`,
    ],
  },

  {
    title: "How to configure modules and vocabulary for your organization",
    slug: "howto-module-config",
    role: "TENANT_ADMIN",
    productArea: "application_reference",
    tags: ["config", "module", "vocabulary", "admin", "tenant", "how-to"],
    chunks: [
      `As a Tenant Admin, you can configure which modules are active and customize terminology.

**Configure modules:**
Navigate to /admin/module-config or call PUT /api/universal/module-config

15 available modules (toggle ON/OFF per tenant):
- AUDIT_MANAGEMENT (default: ON)
- DOCUMENT_CONTROL (default: ON)
- CAPA_MANAGEMENT (default: ON)
- CHANGE_CONTROL (default: OFF — enable for EQMS)
- EVENT_MANAGEMENT (default: OFF — enables Deviation/NC + Complaints)
- TRAINING_MANAGEMENT (default: OFF)
- RISK_MANAGEMENT (default: OFF)
- SUPPLIER_QUALITY (default: ON)
- MANAGEMENT_REVIEW (default: OFF)
- ASSET_MANAGEMENT (default: OFF — enables Equipment/Calibration)
- CHAIN_OF_CUSTODY (default: OFF)
- TRANSACTION_REVIEW (default: OFF)
- REGULATORY_INTEL (default: ON)
- AI_ASSISTANT (default: ON)
- RFQ_PROCUREMENT (default: ON)

**Customize vocabulary (9 terms):**
- audit → e.g. "GMP Audit", "EHS Inspection", "Assessment"
- supplier → e.g. "Vendor", "Contractor"
- buyer → e.g. "Purchaser", "Client", "Principal Company"
- auditor → e.g. "Inspector", "Assessor"
- product → e.g. "API", "Chemical Product"
- site → e.g. "Plant", "Facility"
- finding → e.g. "Deficiency", "Observation", "Non-Conformity"
- capa → e.g. "Corrective Action"
- report → e.g. "Inspection Report"

**Industry profiles (9 presets):**
PHARMA_GMP, MEDICAL_DEVICE, ISO9001, FOOD_SAFETY, ORGANIC_FARMING, FOREST_COC, REAL_ESTATE, HIGH_TICKET, CUSTOM

Each profile pre-configures module defaults, vocabulary, and compliance standards.`,
    ],
  },

  {
    title: "How to use the supplier scorecard and risk scoring",
    slug: "howto-supplier-scorecard",
    role: "BUYER",
    productArea: "application_reference",
    tags: ["supplier", "scorecard", "risk", "scoring", "fda", "how-to"],
    chunks: [
      `HawkEye provides automated supplier risk scoring and scorecards.

**View supplier scorecard:**
Call GET /api/quality/supplier-scorecard/:supplierId

The scorecard calculates an overall score (0-100) based on:
- 40% — Audit outcomes (satisfactory audits / total audits in last 12 months)
- 30% — CAPA performance (on-time CAPA closures / total CAPAs)
- 30% — Base score
- Minus penalties: -10 per critical deviation, -2 per other deviation, -5 per complaint

Risk bands:
- LOW_RISK (score ≥80): Green — continue normal audit schedule
- MEDIUM_RISK (score 60-79): Yellow — increased monitoring, consider for-cause audit
- HIGH_RISK (score <60): Red — immediate attention, consider re-audit or disqualification

**FDA Regulatory Intelligence:**
Navigate to /fda-dashboard to access 331,000+ FDA inspection records and 272,000+ citations. Use this to:
- Research a supplier's inspection history before initiating an audit
- Check for warning letters, import alerts, or consent decrees
- Risk-rank suppliers based on regulatory history

**Equipment alerts:**
GET /api/quality/equipment-alerts returns:
- calibrationOverdue: Equipment past due for calibration
- calibrationDueSoon: Equipment due within 14 days`,
    ],
  },

  {
    title: "How to use electronic signatures (21 CFR Part 11)",
    slug: "howto-electronic-signatures",
    role: "ALL",
    productArea: "compliance",
    tags: ["signature", "e-sig", "cfr", "part11", "sign", "verify", "how-to"],
    chunks: [
      `HawkEye supports 21 CFR Part 11 compliant electronic signatures across all modules.

**Sign a record:**
POST /api/signatures/sign with:
- recordType: The module (AUDIT_REPORT, DOCUMENT_CONTROL, CHANGE_CONTROL, CAPA, DEVIATION, COMPLAINT, TRAINING_RECORD, MANAGEMENT_REVIEW, RISK_ITEM)
- recordId: The specific record's _id
- signatureMeaning: AUTHORED, REVIEWED, APPROVED, WITNESSED, or VERIFIED
- contentSnapshot: JSON object of the record content (used for integrity hash)

Each signature captures: signer identity, email, role, timestamp (server-generated), IP address, user agent, SHA-256 content hash.

**List signatures for a record:**
GET /api/signatures/record/:recordType/:recordId
Returns all signatures in chronological order.

**Verify integrity:**
POST /api/signatures/verify with:
- signatureId: The signature to verify
- contentSnapshot: Current content of the record

Returns:
- verified: true if content hash matches (record unchanged since signing)
- verified: false if hash mismatch (record may have been modified after signing)

**View ALCOA+ audit trail:**
GET /api/signatures/audit-trail/:recordType/:recordId
Returns the complete data integrity log: who, what, when, before/after states, content hashes.`,
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SEEDING LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

// Get target tenants
const Tenant = mongoose.model("Tenant", new mongoose.Schema({ status: String }), "Tenant");
let tenantIds;
if (specificTenant) {
  tenantIds = [specificTenant];
} else {
  const tenants = await Tenant.find({ status: "ACTIVE" }).select("_id").lean();
  tenantIds = tenants.map((t) => String(t._id));
  if (tenantIds.length === 0) {
    // Fallback: use known dev tenant
    tenantIds = ["695e420252203776e0670e58"];
  }
}

console.log(`\nTarget tenants: ${tenantIds.length}`);
console.log(`Articles to seed: ${KB_ARTICLES.length}`);
console.log(`Total chunks: ${KB_ARTICLES.reduce((sum, a) => sum + a.chunks.length, 0)}`);

if (dryRun) {
  console.log("\nDRY RUN — no changes made. Remove --dry-run to seed.");
  for (const article of KB_ARTICLES) {
    console.log(`  [${article.role}] ${article.title} (${article.chunks.length} chunks, tags: ${article.tags.join(",")})`);
  }
  await mongoose.disconnect();
  process.exit(0);
}

// Seed for each tenant
let totalArticles = 0;
let totalChunks = 0;

for (const tenantId of tenantIds) {
  console.log(`\nSeeding tenant ${tenantId}...`);

  for (const article of KB_ARTICLES) {
    const slug = `${article.slug}-${tenantId.slice(-6)}`;

    // Upsert article
    const existing = await KbArticle.findOne({ slug });
    let articleDoc;
    if (existing) {
      existing.title = article.title;
      existing.summary = article.chunks[0].slice(0, 280);
      existing.tags = article.tags;
      existing.productArea = article.productArea;
      existing.role = article.role;
      await existing.save();
      articleDoc = existing;
      // Delete old chunks
      await KbChunk.deleteMany({ articleId: existing._id });
    } else {
      articleDoc = await KbArticle.create({
        tenantId,
        role: article.role,
        productArea: article.productArea,
        tags: article.tags,
        title: article.title,
        slug,
        summary: article.chunks[0].slice(0, 280),
        source: "comprehensive_kb_seed",
      });
      totalArticles++;
    }

    // Create chunks
    for (let i = 0; i < article.chunks.length; i++) {
      await KbChunk.create({
        tenantId,
        role: article.role,
        productArea: article.productArea,
        tags: article.tags,
        articleId: articleDoc._id,
        chunkOrder: i,
        content: article.chunks[i],
        metadata: {
          source: "comprehensive_kb_seed",
          citation: `doc:${slug}#chunk-${i}`,
        },
      });
      totalChunks++;
    }
  }
}

console.log(`\n✅ Seeding complete: ${totalArticles} articles, ${totalChunks} chunks across ${tenantIds.length} tenant(s)`);

await mongoose.disconnect();
