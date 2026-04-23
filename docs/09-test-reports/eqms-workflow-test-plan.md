---
doc: eqms-workflow-test-plan
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: test-reports
status: draft
supersedes: —
---

# EQMS End-to-End Workflow Test Plan

**Version 1.0 · Draft for review**

This document is the authoritative test script for validating Hawkeye's EQMS workflows end-to-end on the Novex Pharma tenant. It is organised so each scenario can be reviewed, annotated (PASS/FAIL/NOTES), and executed by a tester (human) following the numbered steps exactly.

The AI-agent endpoints are covered as **explicit assists inside each scenario** — not in a separate section — so the tester sees exactly where AI contributes and what the expected AI output looks like.

---

## 1 · Test Environment

| Item | Value |
|---|---|
| **Tenant** | Novex Pharma Inc. (type `INTERNAL`, full EQMS) |
| **Tenant ID** | `69e64e7869b2ba745d40bb89` |
| **Frontend** | `https://hawkeye-frontend-dev-chi.vercel.app` (or `http://localhost:3000` for dev) |
| **Backend** | `https://hawkeye-backend-dev.vercel.app` (or `http://localhost:8888` for dev) |
| **LLM provider** | Gemini 2.5 Flash-Lite (free tier) — falls back gracefully |
| **Password (all personas)** | `EqmsDemo@2026` |
| **Test date target** | TBD — tester fills in |

### Pre-flight checks (tester does these BEFORE starting any scenario)

| # | Check | Pass criterion |
|---|---|---|
| P1 | All 11 Novex users log in successfully | 401/403 rate = 0% |
| P2 | `/api/ai/audit-agents/public/providers` returns 5 providers | openFDA + fdaWarningLetter both `available:true` |
| P3 | `scripts/smoke-test-ai-waves.mjs` passes ≥10/12 | ≥10 green |
| P4 | `scripts/smoke-test-audit-agents.mjs` passes ≥9/10 | ≥9 green |
| P5 | Tenant has 2 sites + 2 products seeded | GET confirms |

---

## 2 · Personas (cast of characters)

| Shorthand | Persona | Email | Role | Department |
|---|---|---|---|---|
| **VP** | Dr Elena Vasquez | `vp.quality@novex-pharma.demo` | tenant_admin | VP Quality |
| **QA-Head** | James Thompson | `qa.head@novex-pharma.demo` | admin | Head of QA |
| **QA-Spec** | Kenji Tanaka | `qa.specialist@novex-pharma.demo` | user | Sr QA Specialist |
| **DOC** | Sarah O'Brien | `doc.control@novex-pharma.demo` | user | Doc Control |
| **TRN** | Rebecca Kim | `training.coord@novex-pharma.demo` | user | Training |
| **REG** | Marcus Brown | `regulatory@novex-pharma.demo` | user | Regulatory |
| **AUD-PM** | Priya Nair | `audit.program@novex-pharma.demo` | buyer | Audit Program Mgr |
| **AUD-Lead** | Maria Santos | `audit.lead@novex-pharma.demo` | auditor | Lead Auditor |
| **PROD** | Michael Foster | `production.head@novex-pharma.demo` | supplier | Production Head |
| **QC** | Aisha Patel | `qc.lab@novex-pharma.demo` | supplierUser | QC Lab Lead |
| **MAINT** | Lars Nilsson | `maintenance@novex-pharma.demo` | supplierUser | Maintenance Eng |

---

## 3 · Scenario Index

| # | Scenario | Primary personas | Modules touched | AI assists | Est. duration |
|---|---|---|---|---|---:|
| [S1](#scenario-1) | SOP Revision Lifecycle | DOC · REG · VP · QA-Head · TRN | Doc Control · Change Control · Training | Autofill · Reg-impact classifier | 25 min |
| [S2](#scenario-2) | OOS Deviation → CAPA → Effectiveness Check | QC · QA-Spec · QA-Head · VP | Deviation · CAPA · Risk · MRM | 5-why scaffolder · CAPA RCA drafter · Predictive CAPA badge | 30 min |
| [S3](#scenario-3) | Internal GMP Audit of Production | AUD-PM · AUD-Lead · PROD · QC · MAINT · QA-Spec | Internal Audit · CAPA · Evidence | Audit Prep Agent · Observation drafter · Follow-up suggester · Audit Report agent | 45 min |
| [S4](#scenario-4) | External Supplier Audit via RFQ + AI Prep | AUD-PM · AUD-Lead · PROD | RFQ · Audit · Supplier Quality | Audit Prep Agent · Supplier Intel (public+tenant) | 40 min |
| [S5](#scenario-5) | New Equipment Qualification (IQ/OQ/PQ) | MAINT · QA-Spec · QA-Head | Asset Mgmt · Risk · Training | Predictive CAPA (if deviation opens) · Autofill | 30 min |
| [S6](#scenario-6) | Supplier Risk Re-evaluation with Public Data | AUD-PM · REG | Supplier Quality · Regulatory Intel | Supplier Intel Agent · openFDA fusion · Warning-letter scrape | 20 min |
| [S7](#scenario-7) | Quarterly Management Review | VP · QA-Head · QA-Spec · TRN | MRM + reads ALL modules | (none directly — reviews aggregated data) | 30 min |
| [S8](#scenario-8) | Emergency Change Control with FDA Impact | DOC · REG · VP · TRN | Change Control · Regulatory Intel · Doc Control · Training | Regulatory-impact classifier · Training auto-assign | 25 min |

**Total: ~4 hours of executable test time** if run sequentially. Several scenarios can be parallelised.

---

## 4 · Step Legend

Every step uses this shape:

```
#    Actor    Action                              Expected Result                          Data / API
```

**Status codes (tester fills in):**

- ✅ **PASS** — observed matches expected
- ❌ **FAIL** — record what diverged in the NOTES column
- ⚠️ **PARTIAL** — passed with caveat
- ⏭ **SKIP** — prerequisite missing; explain why

**Action types:**
- `UI` — user clicks / types in the browser
- `API` — direct HTTP call (cURL / Postman / tester's client)
- `DB` — check Mongo collection directly
- `AI` — AI agent call (the UI usually triggers it automatically)

---

## Scenario 1

### S1 · SOP Revision Lifecycle

**Story:** SOP-QC-014 (analytical method for Novexolimus assay) requires a rev because a new column type is introduced. The change goes through Doc Control → Change Control (with regulatory impact assessment) → VP approval → Training cascade to all QC lab personnel.

**Personas:** DOC · REG · VP · QA-Head · TRN
**Modules:** Document Control · Change Control · Training
**Prerequisites:**
- SOP-QC-014 rev 2 exists in Doc Control
- QC department has ≥3 users in Training module

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 1.1 | DOC | Log in as `doc.control@novex-pharma.demo` | Dashboard loads; role = `user`; sees Doc Control tile | POST `/api/auth/login` | ☐ |
| 1.2 | DOC | UI · Navigate `/document-control` | SOP list loads; SOP-QC-014 visible at rev 2 status `APPROVED` | GET `/api/document-control` | ☐ |
| 1.3 | DOC | UI · Click SOP-QC-014 → "Create revision" | Rev 3 drafted; status `DRAFT`; body pre-filled from rev 2 | POST `/api/document-control/:id/revisions` | ☐ |
| 1.4 | DOC | UI · Click "Autofill metadata with AI" on rev 3 form (fields: approverRole, expirationDate, trainingRequired) | AI returns 3 suggestions with confidence + citations. Tester applies with confidence ≥ 0.5. | POST `/api/ai/audit-agents/autofill-form` | ☐ |
| 1.5 | DOC | UI · Edit analytical-method section to add new column type; save draft | Draft saved; version marker "rev 3"; audit-trail entry created | PUT `/api/document-control/:id` | ☐ |
| 1.6 | DOC | UI · Click "Submit for review" | Status moves `DRAFT` → `UNDER_REVIEW`; routes to QA-Head + REG | POST `/api/document-control/:id/submit-for-review` | ☐ |
| 1.7 | DOC | UI · On the same page, click "Open change control" | Change-control form pre-populated from SOP change; change type `DOCUMENT`; riskLevel `MEDIUM` | POST `/api/universal/change-controls` | ☐ |
| 1.8 | REG | Log in as `regulatory@novex-pharma.demo` | Sees "My pending reviews" tile with 1 item | GET `/api/universal/change-controls?assignee=me` | ☐ |
| 1.9 | REG | UI · Open the new change control | Change detail page loads with SOP diff visible | GET `/api/universal/change-controls/:id` | ☐ |
| 1.10 | REG | UI · Click "Assess regulatory impact with AI" (Wave 2 feature) | AI returns classification: `notifiable` / `CBE-30` / `PAS` / `major` / `minor` with reasoning cited to FDA/EMA guidance. Tester confirms verdict. | *Wave 2 stub — to be implemented; until then enter manually* | ⚠️ (feature pending) |
| 1.11 | REG | UI · Record: "Not FDA-reportable · internal notification only" · click "Approve from my desk" | Change status advances; approvalSteps shows REG approved | POST `/api/universal/change-controls/:id/approval` | ☐ |
| 1.12 | QA-Head | Log in as `qa.head@novex-pharma.demo` | Pending approval count shows ≥1 | — | ☐ |
| 1.13 | QA-Head | UI · Approve change control | Change moves toward VP queue | POST `/api/universal/change-controls/:id/approval` | ☐ |
| 1.14 | VP | Log in as `vp.quality@novex-pharma.demo` | Executive approval queue visible | — | ☐ |
| 1.15 | VP | UI · Review full change + approve with e-signature | Change status = `APPROVED`; e-sig record written | POST `/api/universal/change-controls/:id/approval` | ☐ |
| 1.16 | DOC | UI · Back on SOP-QC-014 rev 3; click "Publish" (only enabled after CC approved) | Rev 3 status = `EFFECTIVE`; rev 2 status = `SUPERSEDED` | POST `/api/document-control/:id/publish` | ☐ |
| 1.17 | TRN | Log in as `training.coord@novex-pharma.demo` | Sees "Training needed: SOP-QC-014 rev 3" auto-created | GET `/api/training-records?status=pending_assignment` | ☐ |
| 1.18 | TRN | UI · Click "Auto-assign with AI" (Wave 2 feature) OR click "Assign to QC role group" | All 3 QC users get read-and-understood assignment with due date +7 days | POST `/api/training-records/bulk-assign` | ☐ |
| 1.19 | QC | Log in as `qc.lab@novex-pharma.demo` | Training task "SOP-QC-014 rev 3" visible on `/training` | GET `/api/training-records?assignee=me` | ☐ |
| 1.20 | QC | UI · Read SOP; complete knowledge-check; e-sign attestation | Completion recorded; `completedAt` populated; compliance % ticks up | POST `/api/training-records/:id/complete` | ☐ |

**Acceptance criteria:**
- SOP rev 3 is `EFFECTIVE`; rev 2 is `SUPERSEDED`.
- Change-control record links to SOP rev 3 and has 3 signed approvals (REG, QA-Head, VP).
- 3 training assignments exist; at least 1 completed in this run.
- Audit trail for SOP + change + training shows per-action user + timestamp + e-sig.
- AI autofill applied at 1.4 carries citation metadata on the form field record.

**Audit-trail expected entries:** 12+ (SOP create/save/submit/publish · change create/approve×3 · training assign×3 · training complete).

---

## Scenario 2

### S2 · OOS Deviation → CAPA → Effectiveness Check

**Story:** QC runs release testing on batch `NVX-2026-B014`. Dissolution result is 95% (spec 80–110%) but retest drifts to 78% on 2 of 6 tablets — OOS. QC files a deviation. QA Specialist investigates using 5-why; CAPA opened with AI-drafted RCA; VP reviews in quarterly MRM. 90 days later, effectiveness check verifies the fix.

**Personas:** QC · QA-Spec · QA-Head · PROD · VP
**Modules:** Deviation · CAPA · Risk · (later) MRM
**Prerequisites:**
- Batch record for NVX-2026-B014 exists
- QC has access to batch-records module

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 2.1 | QC | Log in; navigate `/nonconformance`; click "New deviation" | Empty form loads | — | ☐ |
| 2.2 | QC | UI · Fill: title "OOS on dissolution · batch NVX-2026-B014"; description; detectionSource `QC release testing`; immediateAction `batch quarantined`; severity `major`; link batch NVX-2026-B014 | Form accepts all fields | — | ☐ |
| 2.3 | QC | UI · Click "Scaffold 5-why with AI" button | AI returns 5 probing "why" questions + 3 follow-up questions + 6M categorisation. Investigation type = "Process" or "Material". Confidence ≥ 0.35. | POST `/api/ai/deviation/scaffold-five-why` | ☐ |
| 2.4 | QC | UI · Insert scaffold into form; edit probable answers where known; submit | Deviation saved with auto-number `DEV-2026-NNNN`; status `OPEN`; audit trail entry for both the human-edit AND the AI assist | POST `/api/deviations` + POST `/api/ai/decisions/outcome` | ☐ |
| 2.5 | QC | DB check: `db.deviations.findOne({deviationNumber:'DEV-2026-NNNN'}).auditTrail` | Contains `AI_DEVIATION_SCAFFOLD_FIVE_WHY` event with promptHash | MongoDB query | ☐ |
| 2.6 | QA-Spec | Log in; on dashboard see "Deviations assigned to me: 1" | Count incremented | GET `/api/deviations?investigator=me&status=open` | ☐ |
| 2.7 | QA-Spec | UI · Open the deviation; click "Draft RCA with AI" | CapaRcaDrafter drawer opens; AI returns full RCA (5-why + fishbone + narrative + 2 corrective + 2 preventive + effectiveness check + severity + regulatory_clauses + citations). Confidence ≥ 0.6. | POST `/api/ai/capa/draft-rca` | ☐ |
| 2.8 | QA-Spec | UI · Review drawer; adjust severity from AI's suggestion if needed; edit one corrective action; e-sign "Accept (edited)" | Drawer closes; CAPA auto-created linked to the deviation; outcome logged as `USER_EDITED` | POST `/api/capas` + POST `/api/ai/decisions/outcome` | ☐ |
| 2.9 | QA-Spec | UI · On the new CAPA, observe the **Predictive CAPA badge** (Wave 3) | Badge shows P(on-time) and P(effective) percentages + top factors. Expect P(on-time) 60–80% based on seeded profile. | GET `/api/ai/predict/capa-outcome` (auto-called by the badge) | ☐ |
| 2.10 | QA-Spec | UI · In Risk Register, locate reagent-failure risk; raise severity by 1 band | Risk record version incremented; old record marked `SUPERSEDED` | PUT `/api/risk-items/:id` | ☐ |
| 2.11 | QA-Head | Log in; go to `/buyer/capas`; filter by severity `major` | The new CAPA visible in list | GET `/api/capa-v2?severity=major` | ☐ |
| 2.12 | QA-Head | UI · Open CAPA; review RCA + actions; click "Approve plan" with e-sig | CAPA `status` = `APPROVED`; approvalChain shows QA-Head | POST `/api/capas/:id/approve` | ☐ |
| 2.13 | PROD | Log in; navigate to assigned CAPA owner task: "Update incoming-material spec for reagent lot" | Task visible on production-head dashboard | GET `/api/capas?owner=me` | ☐ |
| 2.14 | PROD | UI · Mark corrective action complete; attach new SOP link; e-sign | Action progress moves from 0/2 → 1/2 | POST `/api/capas/:id/actions/:actionId/complete` | ☐ |
| 2.15 | QA-Spec | After simulating +90 days (DB timestamp shift or wait): run effectiveness check | Tester completes "effectivenessCheck" form; marks verified | POST `/api/capas/:id/effectiveness-check` | ☐ |
| 2.16 | QA-Spec | UI · Click "Close CAPA" with e-sig | CAPA `status` = `CLOSED`; deviation `status` = `CLOSED` (cascades) | POST `/api/capas/:id/close` | ☐ |
| 2.17 | — | DB verify: AuditTrail has entries for every state transition + every AI call | ≥12 AuditTrail entries for this deviation/CAPA pair | MongoDB `audit-trails` query | ☐ |

**Acceptance criteria:**
- Deviation + CAPA are both `CLOSED` with linked e-signatures.
- AI assists occurred at 2.3 (scaffold) and 2.7 (RCA); both logged in main AuditTrail with prompt hash + retrieval set + model version.
- Predictive CAPA badge rendered at 2.9 with finite numbers.
- Risk register version incremented.
- No ungrounded AI output anywhere (every AI decision shows citations).

**Audit-trail expected entries:** 15+ (deviation state transitions + CAPA state transitions + 2× AI decisions + risk update + effectiveness check).

---

## Scenario 3

### S3 · Internal GMP Audit of Production

**Story:** Priya schedules the annual internal audit of Production. Maria runs it. Michael (auditee head) fans questionnaire sections out to Aisha (QC) and Lars (Maintenance). Maria raises 3 observations (1 major, 2 minor). AI drafts each observation; Maria edits + signs. Final report is AI-assembled and delivered to Priya with integrity hash.

**Personas:** AUD-PM · AUD-Lead · PROD · QC · MAINT · QA-Spec
**Modules:** Audit Mgmt · Cross-Company Audit AI · CAPA
**Prerequisites:**
- Novex has no open audit for Production right now
- Template 3 (PSCI SAQ) is accessible

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 3.1 | AUD-PM | Log in; `/request-audit`; click "AI-draft questionnaire" | Audit Prep Agent launches; form asks for supplierName/productClass/scope | — | ☐ |
| 3.2 | AUD-PM | UI · Enter "Global Pharma Manufacturing" · productClass "API" · scope "Full GMP" · auditType "GMP" · click Submit | AI returns 6+ sections with priority + rationale per section, 4+ high-risk signals from FDA data, citations to past findings + openFDA. Verdict = `public_only` or `known_tenant`. Confidence ≥ 0.35. | POST `/api/ai/audit-agents/prepare-questionnaire` | ☐ |
| 3.3 | AUD-PM | UI · Review the AI plan; remove 1 section; confirm others; click "Create audit" | New audit record created referencing the refined questionnaire; auto-numbered `HAWK-NNNNNNNN` | POST `/api/buyer/audit-request` | ☐ |
| 3.4 | AUD-PM | UI · Click "Assign lead auditor" · pick Maria | Audit `auditor_id` populated; Maria gets notification | POST `/api/audit-requests/:id/assign-auditors` | ☐ |
| 3.5 | AUD-Lead | Log in as `audit.lead@novex-pharma.demo`; open assigned audit | Audit detail page; status = "Auditor selected" | GET `/api/audit-requests/requestSingleAudit?request_id=:id` | ☐ |
| 3.6 | AUD-Lead | UI · Click "Accept assignment" | `auditorDecision = ACCEPTED` | POST `/api/auditor/audits/:id/accept` | ☐ |
| 3.7 | AUD-Lead | UI · Click "Send questionnaire" (override=true for test speed) | Questionnaire status = `sent_to_supplier`; PROD notified | POST `/api/audits/:id/artifacts/:eqId/send` with `override:true` | ☐ |
| 3.8 | PROD | Log in; see audit in "Open audits" | Audit visible | GET `/api/audit-requests/supplier` | ☐ |
| 3.9 | PROD | UI · Open audit; click "Assign sections" | Section-assignment drawer opens showing categories (e.g., "Management Systems" from template 3) | GET `/api/audits/:id/department-assignments` | ☐ |
| 3.10 | PROD | UI · Assign "Management Systems" → QC (Aisha) · "Equipment" → MAINT (Lars) · self-retain any others | Assignments persist; each assignee gets a task | POST `/api/audits/:id/department-assignments` | ☐ |
| 3.11 | QC | Log in; `/work` shows assigned section with due date | Task visible | GET `/api/audits/:id/department-assignments?assignee=me` | ☐ |
| 3.12 | QC | UI · Open section; fill all mandatory questions; attach 1 SOP PDF as evidence; submit | Section status = `SUBMITTED`; answers populate AuditQuestions rows | POST `/api/audits/:id/department-assignments/submit` | ☐ |
| 3.13 | MAINT | Same flow as 3.11–3.12 for the Equipment section | Submitted | — | ☐ |
| 3.14 | PROD | UI · Consolidation view shows 2/2 sections submitted; click "Send to auditor" | All assignments routed to Maria | POST `/api/audits/:id/consolidate` (or existing submit endpoint) | ☐ |
| 3.15 | AUD-Lead | UI · Open audit; navigate Questionnaire tab; for Question "Do you perform annual equipment calibration?" with Aisha's sparse response · click "Suggest follow-ups" | AI returns 2–3 follow-up questions with severity_if_unanswered · confidence ≥ 0.45 | POST `/api/ai/cross-co/followup-suggestions` | ☐ |
| 3.16 | AUD-Lead | UI · Raise 3 observations via "Draft observation with AI" button. For each: provide interview excerpts + evidence IDs · click Draft | For each call, AI returns title + description + severity + capa_worthy + regulatory_clauses + evidence_citations · confidence ≥ 0.55 | POST `/api/ai/cross-co/observation/draft` ×3 | ☐ |
| 3.17 | AUD-Lead | UI · Edit each observation (adjust severity / wording); e-sign each | 3 findings stored on the audit record; one marked `capa_worthy=true` | POST `/api/audits/:id/findings` ×3 | ☐ |
| 3.18 | AUD-Lead | UI · Click "Assemble final report" | Audit Report Agent returns structured report + HTML + SHA-256 integrity hash · preview link · download | POST `/api/ai/audit-agents/assemble-report` | ☐ |
| 3.19 | AUD-PM | Log in; open the audit; see the delivered report + hash · approve | Audit status = "Report delivered" | POST `/api/audit-requests/:id/report/approve` | ☐ |
| 3.20 | QA-Spec | DB check: for the `capa_worthy:true` observation, a CAPA placeholder exists | 1 CAPA auto-opened | `db.capas.findOne({sourceObservationId:...})` | ☐ |

**Acceptance criteria:**
- Full audit lifecycle traverses: schedule → accept → questionnaire send → section fan-out (2 supplier-users submit) → consolidate → findings (3) → report → delivery.
- AI agents used at 3.2 (prep), 3.15 (follow-ups), 3.16 (×3 observations), 3.18 (report). Each call shows up in AuditTrail with model version + prompt hash.
- Report HTML has integrity hash; downloading the HTML and re-hashing gives the same value.
- 1 CAPA auto-created from the `capa_worthy` observation.

**Audit-trail expected entries:** 20+ (lifecycle + AI calls + section submissions + findings + report).

---

## Scenario 4

### S4 · External Supplier Audit via RFQ + AI Prep

**Story:** Novex needs to audit a NEW third-party API supplier (`Acme Fine Chemicals Ltd.` — not in tenant registry). Priya creates an RFQ to the auditor marketplace. External auditor responds, wins the award. Priya uses AI Audit Prep to build a risk-weighted questionnaire from openFDA data (since Acme isn't in tenant records). Supplier Intel agent confirms `verdict: public_only`.

**Personas:** AUD-PM · AUD-Lead (pretending to be external) · PROD (as pseudo-supplier for test) · REG
**Modules:** RFQ · Audit · Supplier Quality · Public Data Fusion
**Prerequisites:** `Acme Fine Chemicals Ltd.` is NOT in tenant supplier registry.

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 4.1 | AUD-PM | UI · `/rfqs/new`; fill RFQ: "API GMP audit of Acme Fine Chemicals"; scope; start date | RFQ draft saved; status `DRAFT` | POST `/api/rfqs` | ☐ |
| 4.2 | AUD-PM | UI · Click "Search supplier intel" · enter "Acme Fine Chemicals Ltd." | SupplierIntelAgent returns verdict `public_only` OR `unknown`; tenant section shows "not in registry"; public section shows openFDA counts (may be 0) | POST `/api/ai/audit-agents/supplier-intel` | ☐ |
| 4.3 | AUD-PM | UI · Publish RFQ to marketplace; pick at least 1 auditor to invite | RFQ status `PUBLISHED`; invitation recorded | POST `/api/rfqs/:id/publish` | ☐ |
| 4.4 | AUD-Lead | Simulate external auditor: submit a quote | Quote stored against the RFQ | POST `/api/rfqs/:id/quotes` | ☐ |
| 4.5 | AUD-PM | UI · "Quote comparison" view | Quote rows visible; click "Award" on one | RFQ status `AWARDED`; linked audit auto-created | POST `/api/rfqs/:id/award` | ☐ |
| 4.6 | AUD-PM | UI · Open the newly created audit · click "AI-draft questionnaire" | Audit Prep Agent launches with supplierName pre-populated ("Acme Fine Chemicals Ltd.") | — | ☐ |
| 4.7 | AUD-PM | UI · Submit Prep form | AI returns risk-weighted sections tied to openFDA signals (recalls/warning letters if any); if 0 signals, plan says "sparse public data — use full baseline". Confidence noted. | POST `/api/ai/audit-agents/prepare-questionnaire` | ☐ |
| 4.8 | AUD-PM | UI · Save questionnaire to audit | Audit `templateQuestions` populated from the AI plan | POST `/api/auditor/create-draft-questions` | ☐ |
| 4.9 | AUD-Lead | Accept + send + execute (abbreviated version of S3.6–3.18) | Same as S3 flow · verifying it works on a `public_only` supplier too | (various) | ☐ |
| 4.10 | AUD-Lead | UI · On each finding, check that citations reference openFDA data where AI used it | Findings for `public_only` supplier show clear "public data" provenance chips, not tenant-record chips | visual inspection | ☐ |
| 4.11 | AUD-PM | UI · Final report assembly · verify report has "Supplier provenance: public_only" in its metadata | Report content notes the supplier was not in tenant registry | — | ☐ |

**Acceptance criteria:**
- RFQ flow goes end-to-end: draft → publish → award.
- Audit auto-created from RFQ award.
- AI Prep agent works on a supplier with ONLY public data (no tenant records).
- Supplier Intel chips visibly differentiate `public` vs `tenant` sources on findings.
- Zero confusion of public entity with a tenant-registered supplier.

**Audit-trail expected entries:** 10+.

---

## Scenario 5

### S5 · New Equipment Qualification (IQ/OQ/PQ)

**Story:** Novex installs a new Korsch XL-400 tablet press. Lars registers it, Kenji runs ICH Q9 risk assessment, Lars executes IQ/OQ/PQ, James releases for GMP. One minor deviation opens during OQ; its predictive-CAPA badge is observed.

**Personas:** MAINT · QA-Spec · QA-Head
**Modules:** Asset Mgmt · Risk · Deviation · Training
**Prerequisites:** Equipment catalog empty of "Korsch XL-400".

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 5.1 | MAINT | UI · `/asset-management` · "Register new equipment" | Form opens | — | ☐ |
| 5.2 | MAINT | UI · Fill: make "Korsch"; model "XL-400"; serial "KXL400-2026-001"; location "Plant 1 · Line 2"; criticality "High" | Saved as equipment `EQ-YYYY-NNNN` status `PENDING_QUAL` | POST `/api/equipment` | ☐ |
| 5.3 | MAINT | UI · Click "Autofill asset form" on optional metadata fields with AI | Suggestions with confidence; tester applies confident ones | POST `/api/ai/audit-agents/autofill-form` | ☐ |
| 5.4 | QA-Spec | UI · From equipment detail, click "Open risk assessment" | New FMEA record for the press linked to the equipment | POST `/api/risk-items` | ☐ |
| 5.5 | QA-Spec | UI · Click "Brainstorm scenarios with AI" (Wave 2 pending — else skip) | AI returns 5 candidate failure modes (e.g., weight variation, hardness drift) with S/O/D suggestions. Confidence ≥ 0.4. | *Wave 2 stub; until then skip* | ⏭ (feature pending) |
| 5.6 | QA-Spec | UI · Finalise FMEA with RPNs; identify 1 CRITICAL and 2 MEDIUM risks; save | Risk record persisted; 1 CRITICAL triggers "consider mitigation" badge | POST `/api/risk-items/:id/mitigate` | ☐ |
| 5.7 | MAINT | UI · Upload IQ protocol PDF to equipment; execute IQ checklist | IQ recorded as PASSED | POST `/api/equipment/:id/qualification` (type=IQ) | ☐ |
| 5.8 | MAINT | UI · Execute OQ checklist · one test fails (tablet hardness out of range during validation batch) | Test marked FAIL; deviation auto-opened | POST `/api/deviations` (source=OQ_TEST) | ☐ |
| 5.9 | QA-Spec | UI · Open auto-opened deviation; scaffold 5-why with AI; RCA draft with AI (same as S2.3 + S2.7) | Deviation has AI-scaffolded 5-why + CAPA drafted | POST `/api/ai/deviation/scaffold-five-why` + POST `/api/ai/capa/draft-rca` | ☐ |
| 5.10 | QA-Spec | UI · On the CAPA, observe the **Predictive CAPA badge** | Badge shows P(on-time) and P(effective). For minor deviation with short slack, expect P(on-time) 50–70%. | GET `/api/ai/predict/capa-outcome` | ☐ |
| 5.11 | QA-Spec | UI · Close CAPA with corrective (recalibrate press) · mark effective | CAPA CLOSED | POST `/api/capas/:id/close` | ☐ |
| 5.12 | MAINT | UI · Execute OQ retest · PASS; then PQ (3 validation batches) · PASS | All 3 qualification records for this equipment are PASSED | POST `/api/equipment/:id/qualification` (type=OQ, PQ) | ☐ |
| 5.13 | QA-Head | UI · Review qualification package; issue GMP-release certificate · e-sign | Equipment status = `QUALIFIED` | POST `/api/equipment/:id/release` | ☐ |
| 5.14 | — | DB check: equipment has IQ PASS + OQ PASS (after retest) + PQ PASS + release certificate + CAPA linked + risk record | All 5 records linked via IDs | — | ☐ |

**Acceptance criteria:**
- Equipment moves `PENDING_QUAL` → `QUALIFIED` with full IQ/OQ/PQ + release certificate.
- Deviation auto-opened from OQ failure; CAPA closed; predictive badge renders numbers.
- Risk-register record linked to equipment; audit-trail shows all activity.

---

## Scenario 6

### S6 · Supplier Risk Re-evaluation with Public Data

**Story:** Annual supplier re-qualification. AUD-PM runs SupplierIntelAgent on an existing tenant supplier ("Global Pharma Manufacturing") AND an external one ("Lupin Limited"). Notes differences in provenance. Triggers a follow-up paper audit for the flagged one.

**Personas:** AUD-PM · REG
**Modules:** Supplier Quality · Regulatory Intel
**Prerequisites:** Global Pharma Manufacturing is registered in Novex tenant.

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 6.1 | AUD-PM | UI · `/buyer/suppliers` · open Global Pharma Manufacturing · click "Refresh supplier intel" | SupplierIntelAgent runs; verdict = `known_tenant`; tenant card (blue) and public card (orange) rendered | POST `/api/ai/audit-agents/supplier-intel` | ☐ |
| 6.2 | AUD-PM | UI · Inspect public card · confirm sources with openFDA counts + FDA warning letter titles (if any) · note citations are URLs | Provenance chips clearly visible; every data point traceable to its source | visual | ☐ |
| 6.3 | AUD-PM | UI · Search a supplier not in tenant: "Lupin Limited" | SupplierIntelAgent runs; verdict = `public_only`; provenance note warns "not in your registry" | POST `/api/ai/audit-agents/supplier-intel` | ☐ |
| 6.4 | AUD-PM | UI · Public card shows at least 1 registered drug in openFDA · confirm "Atorvastatin" or similar appears | Data aligns with public FDA records | visual | ☐ |
| 6.5 | REG | UI · `/fda-dashboard` · Check warning letters / 483 for Global Pharma | Any FDA signals should also appear on the supplier card (bi-directional) | GET `/api/ai/audit-agents/public/fda/warning-letters` | ☐ |
| 6.6 | AUD-PM | UI · If risk score warrants: click "Open paper audit" · creates a new audit with questionnaire + supplier-intel dossier attached | New audit linked to supplier; dossier reference saved | POST `/api/buyer/audit-request` | ☐ |
| 6.7 | — | DB check: `supplier-risk-dossiers` collection has a record ≤30 days old for both queries | dossier records exist with `dossierDate`, `riskScore`, `riskBand`, and public-source citations | — | ☐ |

**Acceptance criteria:**
- Both tenant-known and public-only suppliers produce a dossier.
- Provenance differentiation is visually unambiguous (blue vs orange cards + chips).
- A paper audit can be triggered directly from the intel view.

---

## Scenario 7

### S7 · Quarterly Management Review

**Story:** Elena chairs quarterly MRM. Platform aggregates inputs from every module: open CAPAs, deviation trends, audit findings, training compliance, supplier risk, equipment calibration due.

**Personas:** VP · QA-Head · QA-Spec · TRN
**Modules:** MRM + reads (CAPA · Deviation · Audit · Training · Supplier Quality · Asset)

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 7.1 | VP | UI · `/management-review` · click "New review" | Form opens with review types (quarterly, annual) | — | ☐ |
| 7.2 | VP | UI · Select Q2-2026 · click "Auto-populate inputs" | System pulls: open-CAPA count, overdue-CAPA count, deviation-trend-last-quarter, open-audit count, training-compliance %, supplier-risk list, calibration-due list | GET `/api/management-reviews/auto-inputs` (Wave 2 scaffold) | ⚠️ (feature partial) |
| 7.3 | VP | Manual fallback: tester fills input sections by hand if 7.2 not implemented · add KPIs | Inputs populate inputSections array | PUT `/api/management-reviews/:id` | ☐ |
| 7.4 | QA-Head | UI · Adds "audit-program status" input + recommendation | Input appended with contributor = QA-Head | PUT `/api/management-reviews/:id` | ☐ |
| 7.5 | QA-Spec | UI · Presents top-5 risk-register items | Input appended | — | ☐ |
| 7.6 | TRN | UI · Presents training compliance breakdown by role | Input appended | — | ☐ |
| 7.7 | VP | UI · Enter decisions + action items (2 items: "allocate QA headcount", "approve new curriculum") | Action items saved with owners + due dates | POST `/api/management-reviews/:id/action-items` | ☐ |
| 7.8 | VP | UI · Click "Conclude review with adequacyDecision = ADEQUATE" · e-sign minutes | Review status `CLOSED`; minutes PDF produced | POST `/api/management-reviews/:id/close` | ☐ |
| 7.9 | QA-Head | Follow-up: open the first action item; start work on it | Action item status moves `OPEN` → `IN_PROGRESS` | PUT `/api/action-items/:id` | ☐ |

**Acceptance criteria:**
- Review record has ≥5 inputs (populated), ≥2 action items, adequacyDecision, e-signed.
- Action items are tracked as separate items with owners + due dates.

---

## Scenario 8

### S8 · Emergency Change Control with FDA Impact

**Story:** Excipient supplier goes out of business. Production proposes switch to alternate supplier. This is a MAJOR change requiring FDA CBE-30 supplement. Emergency workflow: Sarah drafts · Marcus flags FDA-reportable · submits supplement · hold implementation · VP final-approves post-FDA · training cascades.

**Personas:** DOC · REG · VP · TRN
**Modules:** Change Control · Regulatory Intel · Doc Control · Training

| # | Actor | Action | Expected Result | Data / API | Status |
|---:|---|---|---|---|---|
| 8.1 | DOC | UI · `/change-controls` · "New change" · type `SUPPLIER` · riskLevel `HIGH` · description "Replace excipient supplier for Novexolimus 1mg" | Change saved; emergency workflow template applied | POST `/api/universal/change-controls` | ☐ |
| 8.2 | REG | UI · Opens change · clicks "Assess regulatory impact with AI" (Wave 2 pending) | AI classifies: `CBE-30` (or `PAS` for some formulations) with reasoning · cites FDA guidance | *Wave 2 stub; tester enters manually* | ⚠️ (feature pending) |
| 8.3 | REG | UI · Mark "FDA supplement required · CBE-30"; hold implementation · save assessment | Change `regulatoryAssessment` populated; implementation blocked | PUT `/api/universal/change-controls/:id` | ☐ |
| 8.4 | REG | UI · Click "Prepare FDA supplement" from change detail | Stub creates a regulatorySubmission record | POST `/api/regulatory-submissions` (Wave 2 scaffold) | ⏭ (feature pending) |
| 8.5 | REG | Simulate FDA acknowledgement (30-day clock): tester updates submission status | regulatorySubmission status = `ACKNOWLEDGED`; 30-day clock runs | PUT `/api/regulatory-submissions/:id` | ☐ |
| 8.6 | VP | UI · After 30-day pass (tester ticks forward in test env): approve change implementation · e-sign | Change `status` = `APPROVED`; implementation unblocked | POST `/api/universal/change-controls/:id/approval` | ☐ |
| 8.7 | DOC | UI · Update affected SOP (material spec) → new rev · publish after CC approved | SOP rev published; super-seeds old rev | POST `/api/document-control/:id/publish` | ☐ |
| 8.8 | TRN | UI · Auto-assign training on the new SOP rev to Production + QC | Training tasks created for all affected roles | POST `/api/training-records/bulk-assign` | ☐ |
| 8.9 | — | DB check: change + submission + SOP rev + training all linked via IDs | 4-way link | — | ☐ |

**Acceptance criteria:**
- Change classified as FDA-reportable; implementation blocked until post-FDA approval.
- Regulatory submission record created and tracked.
- Downstream SOP + training cascaded automatically after change approval.
- Full audit trail across all 4 modules.

---

## 5 · Pass/Fail summary table (tester fills in during run)

| Scenario | Planned steps | Passed | Failed | Partial | Skipped | Blockers |
|---|---:|---:|---:|---:|---:|---|
| S1 SOP Revision Lifecycle | 20 | | | | | |
| S2 OOS Deviation → CAPA | 17 | | | | | |
| S3 Internal GMP Audit | 20 | | | | | |
| S4 External Supplier Audit | 11 | | | | | |
| S5 Equipment Qualification | 14 | | | | | |
| S6 Supplier Risk Re-eval | 7 | | | | | |
| S7 Quarterly MRM | 9 | | | | | |
| S8 Emergency Change Control | 9 | | | | | |
| **Total** | **107** | | | | | |

---

## 6 · AI-assist coverage map

Visible to the tester so they know exactly which clicks should produce AI output:

| Step | Agent | Endpoint | Expected on success |
|---|---|---|---|
| 1.4 | AuditAutofillAgent | `POST /api/ai/audit-agents/autofill-form` | `{ok:true, suggestions:[...]}` |
| 2.3 | DeviationFiveWhyScaffolder | `POST /api/ai/deviation/scaffold-five-why` | `{ok:true, scaffold:{fiveWhy,...}}` |
| 2.7 | CapaRcaDrafter | `POST /api/ai/capa/draft-rca` | `{ok:true, draft:{rootCauseAnalysis,...}}` |
| 2.9 | PredictiveCapa | `POST /api/ai/predict/capa-outcome` | `{ok:true, prediction:{pOnTime,pEffective,topFactors}}` |
| 3.2 | AuditPrepAgent | `POST /api/ai/audit-agents/prepare-questionnaire` | `{ok:true, plan:{sections,high_risk_signals,...}}` |
| 3.15 | FollowupSuggester | `POST /api/ai/cross-co/followup-suggestions` | `{ok:true, suggestions:[...]}` |
| 3.16 | ObservationDrafter | `POST /api/ai/cross-co/observation/draft` ×3 | `{ok:true, draft:{severity,capa_worthy,...}}` |
| 3.18 | AuditReportAgent | `POST /api/ai/audit-agents/assemble-report` | `{ok:true, html:"...", integrityHash:"..."}` |
| 4.2 | SupplierIntelAgent | `POST /api/ai/audit-agents/supplier-intel` | `{verdict,tenant,public}` |
| 4.7 | AuditPrepAgent | (same) | (same) |
| 5.3 | AuditAutofillAgent | (same) | (same) |
| 6.1, 6.3 | SupplierIntelAgent | (same) | (same) |
| 6.5 | PublicDataFusion · Warning letters | `POST /api/ai/audit-agents/public/fda/warning-letters` | `{ok:true, results:[...]}` |

**Expected pass rate for AI steps (free-tier Gemini):** ≥ 10/13 on first run. Rate-limit retries are built in.

---

## 7 · What's NOT in this run (flagged as feature gap)

Steps marked ⏭ or ⚠️ depend on features still at scaffold stage (as of 2026-04-22):

- Regulatory-impact classifier agent (S1.10, S8.2) — spec exists, not implemented
- Risk scenario brainstormer (S5.5) — spec exists, not implemented
- MRM auto-populate-inputs endpoint (S7.2) — partially scaffolded
- Training auto-assign on SOP rev (S1.18, S8.8) — manual path works; automation is scaffold
- Regulatory submission tracking (S8.4-S8.5) — stub model only

When tester encounters these, fall back to the manual path noted in the step and record as "⚠️ feature pending".

---

## 8 · After the run — what to produce

1. This document with every step marked ✅/❌/⚠️/⏭ and the pass/fail summary table filled in.
2. Screenshots for any failure (attach to each failed step's NOTES column).
3. A follow-up bug list in `backend/docs/09-test-reports/eqms-workflow-bugs-YYYY-MM-DD.md`.
4. Re-ingest into AuditTrail: `db.audit-trails.count()` before vs after (sanity check — expect +150 entries minimum).

---

**End of test plan · v1.0 · 2026-04-22**

*Revision history:*
- v1.0 · 2026-04-22 · First draft for review
