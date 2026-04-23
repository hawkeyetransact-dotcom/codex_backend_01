---
doc: CAPA_MODULE_BLUEPRINT
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: capa
status: current
---

# Hawkeye CAPA Module Blueprint (Dev Branch)

Date: 2026-03-10  
Scope: CAPA product architecture + additive implementation path for Hawkeye (`dev`)  
Authoring basis: backend + frontend code inspection, no runtime assumptions

## 1. Executive Summary

Hawkeye already has partial CAPA capabilities:
- A basic CAPA entity (`capas`) with status updates, actions, ownership, and links.
- CAPA generation from audit report observations.
- Questionnaire-level auditor comments/flags/follow-up signals that can be used as CAPA triggers.
- Report observations with evidence/finding/CAPA link fields.

What is missing for a pharma-grade closed-loop CAPA module is a normalized workflow and data model for:
- Candidate intake and triage (`No CAPA` vs `Correction only` vs `Formal CAPA`).
- Structured investigation and RCA.
- Structured action plan/action item execution.
- Effectiveness checks and staged approvals.
- Full source-to-CAPA provenance, status history, and recurrence intelligence.

This blueprint proposes:
- A Hawkeye-native CAPA V2 domain (additive, non-breaking).
- CAPA candidate queue + intelligent prefill from existing audit artifacts.
- Controlled status machine with role-based stage gates.
- GMP-grade traceability, audit trail, and metrics.
- MVP-first implementation with progressive hardening.

---

## 2. Current-State Inventory of Existing Hawkeye Features

### 2.1 Backend entities and collections relevant to CAPA

Confirmed from code:
- `src/models/capaModel.js`
  - Existing CAPA master (`capas`), basic statuses, owner, links, action log.
- `src/models/auditQuestionsModels.js`
  - Auditor comments, compliance markers, follow-up flags, attachments, and linked CAPA/finding/evidence IDs.
- `src/models/auditReportModel.js`
  - Observations with severity/classification/follow-up and linked evidence/finding/CAPA IDs.
- `src/models/auditRequestsMasterModel.js`
  - Questionnaire status and audit phase/status context.
- `src/models/questionnaireSectionAssignmentModel.js`
  - Supplier section assignment and submission status.
- `src/models/assessmentFindingModel.js`, `src/models/assessmentCapaModel.js`
  - Secondary assessment-centric finding/CAPA path (partial).
- `src/models/complianceRunModel.js`, `src/models/complianceQuestionResultModel.js`
  - Compliance analysis output with verdicts, references, evidence suggestions.
- `src/models/auditTrailModel.js`, `src/models/auditEventModel.js`
  - Click/audit event trails.
- `src/models/approvalRequestModel.js`
  - Generic approval request, not CAPA-stage-specific.

### 2.2 Backend controllers/services/routes relevant to CAPA flow

Confirmed from code:
- `src/controllers/capaController.js` + `src/routes/capaRoutes.js`
  - List/get/create/update status/update links/add action endpoints for basic CAPA.
- `src/controllers/reportController.js`
  - `generateDraftReport`, `getAuditComplianceSuggestion`, `generateCapasFromReport`.
  - Existing CAPA generation logic from observations.
- `src/controllers/auditorController.js`
  - `flagQuestionFollowUp`.
  - `listSupplierAttachmentsByUser` for consolidated attachment visibility.
- `src/routes/auditorRoutes.js`
  - CAPA generation/compliance/report/attachments endpoints.
- `src/services/compliance/complianceFlowService.js`
  - Standardized compliance run that can feed CAPA triage signals.
- `src/services/auditEventService.js`, `src/controllers/auditTrailController.js`
  - Existing trace logging framework.

### 2.3 Frontend pages/components relevant to CAPA

Confirmed from code:
- `app/(console)/audits/[id]/report/page.tsx`
  - Full auditor review, follow-up, compliance check, report draft, CAPA generation action.
  - Shows supplier consolidated attachments and compliance suggestion summary.
  - Includes auto-fill provenance UI and radio/checkbox verification telemetry.
- `app/(console)/auditor/capas/page.tsx`
  - Placeholder only.
- `app/(console)/buyer/capas/page.tsx`
  - Placeholder only.
- `components/audits/questionnaire.tsx`
  - Existing question review UI with comments/flags/internal notes/attachments.
- `components/shared/Datatable/index.tsx`
  - Reusable smart table controls (fuzzy search, density, variants, export).
- `constant/app-config.ts`
  - Sidebar has CAPA-related menu entry points but CAPA pages are not implemented.

### 2.4 Existing APIs and services reusable for CAPA V2

Confirmed from code:
- Audit/question/report retrieval and save APIs.
- CAPA basic API (`/api/capas`) for backward compatibility.
- Compliance suggestion API (`/api/auditor/audits/:auditId/compliance-suggestion`).
- Report generation + observation linking + CAPA generation APIs.
- Notification orchestration (`NotificationOrchestratorService`).
- Audit event and audit trail logging services.

### 2.5 Existing AI/automation assets reusable for CAPA prefill

Confirmed from code:
- Compliance engine with verdict + reason + regulatory references + evidence suggestions.
- Auto-fill metadata on questionnaire fields (`autoFillMeta`).
- Report observation synthesis pipeline.
- Existing RAG/AskHawk and evidence extraction modules.

### 2.6 Current limitations and code smells (CAPA context)

Confirmed from code:
- CAPA workflow is flat; no formal intake/triage/investigation/RCA/effectiveness models.
- Two CAPA tracks (`capas` and `assessment-capas`) with overlapping semantics.
- CAPA UI pages (`buyer/capas`, `auditor/capas`) are placeholders.
- No dedicated candidate queue model.
- No strict status transition guard rails for CAPA lifecycle.
- No stage-specific approvals model for CAPA.
- Existing CAPA generation is report-observation centric only; questionnaire comments are not first-class candidates.

Strong inference from code:
- Existing `capas` model is useful as a compatibility layer but not enough for regulated CAPA governance.
- Existing report and questionnaire fields already contain enough source context to auto-prefill CAPA intake at high utility.

Needs functional validation in UI/runtime:
- Whether all role combinations can currently view CAPA records created via report generation.
- Notification behavior for CAPA state transitions across buyer/supplier/auditor personas.

---

## 3. Gap Analysis

### 3.1 What can be reused

Confirmed from code:
- Existing audit artifact graph:
  - `AuditRequestMaster` -> `AuditQuestions` -> `AuditReport.observations`.
- Existing source link fields:
  - `linkedEvidenceIds`, `linkedFindingId`, `linkedCapaIds`.
- Existing compliance output:
  - `ComplianceQuestionResult` verdict/reason/reference/evidence suggestion.
- Existing non-functional controls:
  - authentication/tenant role middleware.
  - audit event + trail logging.
  - notification orchestrator.
  - shared frontend Datatable patterns.

### 3.2 What must be added

Must add (new domain objects):
- CAPA candidate queue.
- CAPA intake and triage records.
- CAPA investigation/RCA/action/effectiveness records.
- CAPA stage approvals.
- CAPA status history and metrics snapshots.
- similarity/recurrence links.

Must add (new process):
- Candidate generation from multiple audit source types.
- Triage branch: no CAPA vs correction-only vs formal CAPA.
- Formal status machine with transition validation.
- Role/stage permission checks for edits/approvals/closure.

Must add (new UI):
- CAPA candidate queue.
- CAPA intake workspace with prefill provenance.
- CAPA detailed workspace tabs.
- CAPA dashboard.

### 3.3 What should be refactored later (not MVP-breaking)

Strong inference from code:
- Long-term convergence path for `capas` and `assessment-capas`.
- Harmonize “issue/finding/observation” terminology and IDs.
- Standardize status enums across audit findings/CAPA.

### 3.4 Lowest-risk implementation path

Recommended:
- Additive CAPA V2 module under new routes/models.
- Keep existing `/api/capas` and report CAPA generation intact.
- Dual-write optional bridge later after validation.
- No hard migration in MVP; introduce read adapters where needed.

---

## 4. Recommended CAPA Product Design

### 4.1 Core principles

1. Closed-loop CAPA lifecycle.  
2. Risk-based triage and SLA.  
3. Human approvals at controlled gates.  
4. Source-linked traceability to audit artifacts.  
5. Minimal duplicate data entry via prefill.  
6. AI-suggested, human-authoritative decisions.  
7. Role-based visibility and edit scope.  
8. Immutable stage/event history.  
9. Multi-tenant isolation by default.  
10. Backward compatibility with current audit/report flow.

### 4.2 Hawkeye-native flow

1. Finding signal captured (question flag/report observation/compliance verdict/manual).  
2. CAPA candidate generated with source links and confidence.  
3. Intake drafted (auto-prefilled).  
4. Triage decision:
   - No CAPA needed (closed rationale).
   - Correction only.
   - Formal CAPA.
5. Formal CAPA created and owner assigned.  
6. Investigation and RCA completed.  
7. Action plan approved.  
8. Action items executed with evidence.  
9. Effectiveness check completed.  
10. Closure decision (effective/ineffective/reopen).  
11. Metrics and recurrence links updated.  
12. Exposed in dashboards and future audit intelligence.

### 4.3 UX target screens

1. CAPA Candidate Queue  
2. CAPA Intake Form (prefill + provenance + confidence)  
3. CAPA Detail Workspace tabs:
   - Overview
   - Source Findings
   - Investigation
   - Root Cause Analysis
   - Action Plan
   - Implementation Evidence
   - Effectiveness Check
   - Approvals
   - Audit Trail/History
4. RCA Workspace (5 Whys + Fishbone sections)  
5. Action Plan Builder (correction/corrective/preventive rows)  
6. Effectiveness Workspace  
7. CAPA Dashboard

---

## 5. Detailed Workflow

### 5.1 Candidate creation triggers

From existing assets:
- Auditor follow-up flagged question.
- Non-compliant/insufficient compliance check verdict.
- Report observation with major/critical/follow-up.
- Manual candidate creation by authorized roles.
- Recurrence detection from historical CAPAs/findings.

### 5.2 Triage decision logic

Input:
- severity, impact, recurrence, source type, evidence quality.

Decision:
- `NO_CAPA_NEEDED`: rationale required.
- `CORRECTION_ONLY`: containment + correction actions only.
- `FORMAL_CAPA_REQUIRED`: full lifecycle.

### 5.3 Formal CAPA lifecycle

Draft -> Intake -> Triage -> Open -> Investigation -> RCA approval -> Action plan approval -> Implementation -> Effectiveness -> Closure.

### 5.4 Merge/duplicate handling

System suggests merge candidates by:
- supplier + site + process category + semantic similarity.
- no automatic merge without human confirmation.

---

## 6. Detailed Data Model

Proposed entities (additive V2 namespace):

1. `CAPA` (core case record)  
2. `CAPA_Source_Link`  
3. `CAPA_Intake`  
4. `CAPA_Triage`  
5. `CAPA_Investigation`  
6. `CAPA_Root_Cause`  
7. `CAPA_Action_Plan`  
8. `CAPA_Action_Item`  
9. `CAPA_Implementation_Evidence`  
10. `CAPA_Effectiveness_Check`  
11. `CAPA_Approval`  
12. `CAPA_Comment`  
13. `CAPA_Status_History`  
14. `CAPA_Risk_Assessment`  
15. `CAPA_Metric_Snapshot`  
16. `CAPA_Similarity_Link`  

Additional operational entity:
- `CAPA_Candidate`

### 6.1 Key relationship map

```text
AuditRequest / AuditQuestions / AuditReportObservations
        -> CAPA_Candidate
        -> CAPA_Intake
        -> CAPA (formal)
             -> CAPA_Source_Link (1..N)
             -> CAPA_Triage (1)
             -> CAPA_Investigation (0..1)
             -> CAPA_Root_Cause (0..1)
             -> CAPA_Action_Plan (0..1)
             -> CAPA_Action_Item (0..N)
             -> CAPA_Implementation_Evidence (0..N)
             -> CAPA_Effectiveness_Check (0..1)
             -> CAPA_Approval (0..N)
             -> CAPA_Comment (0..N)
             -> CAPA_Status_History (0..N)
             -> CAPA_Risk_Assessment (0..N revisions)
             -> CAPA_Metric_Snapshot (0..N)
             -> CAPA_Similarity_Link (0..N)
```

### 6.2 Minimum field strategy

For all entities:
- `tenantOrgId` (required, indexed).
- `auditId`/`supplierId`/`siteId` where relevant.
- `createdBy`, `updatedBy`, timestamps.
- stage status and lock metadata where relevant.

### 6.3 Locks and revision rules

- Intake editable until submitted for triage.
- RCA editable until RCA approval submitted.
- Action plan editable until approved.
- Effectiveness editable until closure decision.
- Every major stage transition records immutable status history.

---

## 7. Status Model and Permissions

### 7.1 CAPA status machine (target)

Statuses:
- Draft Candidate
- Intake Draft
- Under Triage
- Triage Completed – No CAPA Needed
- Correction Only
- CAPA Open
- Investigation In Progress
- RCA Pending Approval
- Action Plan Pending Approval
- Action Plan Approved
- In Implementation
- Awaiting Effectiveness Check
- Effectiveness Review In Progress
- Closed Effective
- Closed Ineffective
- Reopened
- Cancelled
- Superseded
- Merged

### 7.2 Role model (minimum)

Roles:
- Auditor
- Lead Auditor
- Supplier User
- Supplier Quality Lead
- Buyer Quality User
- QA / Quality Unit
- CAPA Coordinator
- Tenant Admin
- System Admin

### 7.3 Permission highlights

Confirmed from code (current):
- Auditor/admin-side users can already create CAPAs via report path.
- Supplier currently has limited interaction in legacy CAPA endpoints.

Recommended for V2:
- Candidate creation: auditor, lead auditor, QA, CAPA coordinator, admin roles.
- Triage approval: lead auditor / QA / CAPA coordinator.
- RCA edit: owner + assigned team, approval by QA/lead auditor.
- Closure approval: QA/lead auditor/capa coordinator only.
- Supplier view:
  - only external-facing fields and actions.
  - no internal-only notes/comments.

---

## 8. Auto-Prefill and AI Mapping Logic

### 8.1 Source inputs

Use existing records:
- Audit question text/category/code.
- Supplier response text/yes-no/details.
- Auditor comments/internal notes/follow-up flags.
- Report observations.
- Compliance suggestion verdict/reason/reference/evidence hints.
- linked evidence IDs and document URLs.

### 8.2 Prefill fields

Auto-populate (draft):
- source classification and source IDs.
- issue title + one-line issue statement.
- detail description.
- supplier/site/product scope.
- question and evidence references.
- category/severity suggestion.
- risk rationale draft.
- immediate containment suggestion.
- owner role suggestion.
- CAPA type suggestion (`correction_only` vs `formal`).
- due date window suggestion.
- similar past CAPAs.

### 8.3 Strict rules

- AI suggests only; does not approve.
- AI never finalizes RCA.
- each auto-filled field stores:
  - source IDs
  - confidence
  - generated timestamp
- human edits become authoritative.
- preserve `draftFromSource` and `finalUserValue` where applicable.

### 8.4 Candidate generation heuristics

1. If flagged question OR non-compliant/insufficient verdict OR major report observation -> candidate.  
2. If repeated theme across questions in same audit -> merge suggestion.  
3. If repeated theme across prior audits/CAPAs for same supplier/site -> recurrence flag.  
4. Informational comments only -> low-priority candidate, default no formal CAPA suggestion.  
5. High-risk keywords (sterility/data integrity/contamination) -> escalate suggested severity.

---

## 9. Frontend Design

### 9.1 Existing UI to preserve

Confirmed from code:
- `app/(console)/audits/[id]/report/page.tsx` remains the execution questionnaire + report workspace.
- Existing manual entry/save/send/sign flows remain unchanged.

### 9.2 Additive UI components

1. `Auditor CAPA Queue` page:
   - candidate queue table.
   - filters by audit/supplier/site/severity/triage state.
   - actions: review intake, triage, create formal CAPA.
2. `Buyer CAPA Dashboard/List` page:
   - cross-supplier CAPA list and KPIs.
3. CAPA detail workspace shell:
   - tabbed sections for investigation/RCA/action/effectiveness/approvals/history.
4. Source traceability drawer:
   - source references and confidence chips.

### 9.3 UX behavior

- Smart controls reuse existing `Datatable`.
- highlighted prefilled fields with provenance.
- non-blocking warnings for low-confidence content.
- explicit stage submit/approve transitions with confirmation.

---

## 10. Backend/API Design

Additive route namespace: `/api/capa-v2`

### 10.1 API contracts (target)

1. `POST /candidates/from-finding` -> createCandidateFromAuditFinding  
2. `POST /candidates/bulk-from-audit/:auditId` -> bulkGenerateCandidatesFromAudit  
3. `GET /candidates` -> getCandidateQueue  
4. `POST /intakes` -> createCAPAIntake  
5. `PATCH /intakes/:intakeId` -> updateCAPAIntake  
6. `POST /intakes/:intakeId/submit` -> submitForTriage  
7. `POST /triage/:triageId/decision` -> triageCAPA  
8. `POST /capas` -> createFormalCAPA  
9. `POST /capas/:capaId/assign` -> assignCAPAOwner  
10. `PUT /capas/:capaId/investigation` -> saveInvestigation  
11. `PUT /capas/:capaId/root-cause` -> saveRootCauseAnalysis  
12. `PUT /capas/:capaId/action-plan` -> saveActionPlan  
13. `POST /capas/:capaId/action-items` -> addActionItem  
14. `PATCH /action-items/:actionItemId/status` -> updateActionItemStatus  
15. `POST /capas/:capaId/implementation-evidence` -> uploadImplementationEvidence  
16. `PUT /capas/:capaId/effectiveness` -> saveEffectivenessCheck  
17. `POST /capas/:capaId/approvals` -> approveCAPAStage  
18. `POST /capas/:capaId/close` -> closeCAPA  
19. `POST /capas/:capaId/reopen` -> reopenCAPA  
20. `GET /dashboard` -> getCAPADashboard  
21. `GET /capas/:capaId/related` -> getRelatedFindingsAndPastCAPAs  
22. `POST /prefill/from-audit/:auditId` -> generateDraftPrefillFromAuditSources

### 10.2 Validation/auth/side-effects

- tenant scoping enforced on all reads/writes.
- role checks by endpoint.
- status transition guard on lifecycle-changing endpoints.
- automatic `CAPA_Status_History` append on transition.
- optional notification emit on owner assignment and approval requests.
- audit event log call on key milestones.

---

## 11. Notifications and Audit Trail

### 11.1 Notifications

Use existing notification orchestrator with new event keys:
- `capa_v2.candidate.created`
- `capa_v2.triage.required`
- `capa_v2.owner.assigned`
- `capa_v2.rca.approval.required`
- `capa_v2.plan.approval.required`
- `capa_v2.effectiveness.required`
- `capa_v2.overdue.alert`
- `capa_v2.closed`

### 11.2 Audit trail

Log mandatory events:
- candidate created/merged/rejected.
- triage decision and rationale.
- stage submissions/approvals/rejections.
- action item completion.
- effectiveness outcome and closure.
- reopen reason.

---

## 12. Dashboard and Reporting Design

### 12.1 CAPA dashboard KPIs

- Open CAPAs by severity.
- Overdue CAPAs.
- Aging buckets.
- CAPA by supplier/site/category.
- Correction-only vs full CAPA.
- Effectiveness pass/fail rate.
- Reopened CAPA rate.
- recurrence trend.

### 12.2 Report integrations

- Audit report observation rows show linked CAPA state.
- Supplier profile shows open/overdue CAPAs and recurrence signal.
- Buyer dashboard includes supplier CAPA burden/risk.

---

## 13. Phased Implementation Plan

### MVP (Phase A)

1. CAPA V2 candidate/intake/triage/formal CAPA baseline models.  
2. Prefill generation from audit sources.  
3. Candidate queue APIs + basic CAPA detail APIs.  
4. Basic status machine + history records.  
5. Auditor and buyer CAPA pages (minimal, functional).  
6. Dashboard summary endpoint.

### Phase B

1. Structured investigation/RCA/action/effectiveness tabs fully editable.  
2. Stage approvals and sign-off rules.  
3. similarity + recurrence analytics.  
4. notification templates and SLA breach alerts.

### Phase C

1. EQMS integration enrichment for CAPA recurrence intelligence.  
2. Advanced RCA templates (5-Whys/Fishbone/FMEA scoring).  
3. configurable CAPA policies by tenant (SLA and approval matrix).

---

## 14. Detailed Technical Task Breakdown

### Backend tasks

1. Create CAPA V2 models and enums.  
2. Add status transition utility.  
3. Build prefill mapping service from audit/report/question/compliance.  
4. Build controller routes for 22 core APIs.  
5. Add route mount in app bootstrap.  
6. Add baseline tests for transition guards + candidate generation.

### Frontend tasks

1. Replace CAPA placeholder pages with queue/workspace.  
2. Add CAPA API client wrappers.  
3. Render source provenance/confidence chips.  
4. Add stage actions (submit/approve/close/reopen).  
5. Add dashboard widgets and filters.

---

## 15. DB Migration Plan

Mongo approach (no relational migrations):
- Additive collections only, no destructive schema rewrite.
- No immediate backfill required to keep current flow operational.
- Optional backfill:
  - create CAPA candidates from existing report observations and flagged questions for recent audits.
  - map existing `capas` into `capa-v2` as bootstrap data (optional script).
- rollback:
  - disable route via feature flag and ignore new collections.

---

## 16. QA/Test Plan

### 16.1 Unit tests

- status transition validation.
- prefill source mapping and confidence fallback.
- recurrence/similarity scoring utilities.

### 16.2 Integration/API tests

- candidate generation from flagged questions.
- triage branch behavior.
- formal CAPA creation and owner assignment.
- stage approval guard rails.
- close/reopen logic.
- tenant isolation.

### 16.3 UI tests

- queue filtering/search/sort.
- intake prefill + edit override.
- provenance visibility per field.
- role-based editability.
- stage submit/approve buttons.

### 16.4 Regression tests

- existing audit questionnaire save/send/follow-up unaffected.
- existing report generation and legacy CAPA generation unaffected.
- existing `/api/capas` unaffected.

### 16.5 Scenario tests (minimum)

1. Single finding -> single CAPA candidate -> formal CAPA.  
2. Multiple related comments -> merge suggestion.  
3. Low-risk issue triaged as no-CAPA-needed.  
4. Correction-only path without full RCA requirement.  
5. Formal CAPA requires RCA + plan + effectiveness before closure.  
6. Supplier cannot view internal-only notes.  
7. AI draft edited by human; human version retained.  
8. Effectiveness fail -> reopen path.  
9. Recurrence signal appears on new candidate generation.

---

## 17. Risks, Tradeoffs, and Open Questions

### Risks

1. Dual CAPA model coexistence may confuse consumers if APIs are mixed.  
2. Source text quality from comments may reduce prefill precision in early runs.  
3. Over-aggressive candidate generation could create noise.

### Tradeoffs

1. Additive V2 avoids breakage but introduces temporary duplication.  
2. Strict stage gates increase compliance but add workflow friction.

### Open questions

1. Which role is final closure authority per tenant: QA vs Lead Auditor vs Buyer QA?  
2. Should correction-only records be tracked in same dashboard KPIs as full CAPAs?  
3. Should supplier users execute CAPA action items directly in MVP or phase B?  
4. Required e-signature/legal hold requirements for stage approvals?

---

## 18. Concrete Recommended Next Build Steps

1. Implement additive CAPA V2 backend models/routes/services under `/api/capa-v2`.  
2. Ship candidate generation from:
   - report observations.
   - flagged/noncompliant questionnaire items.
3. Replace CAPA placeholder pages (auditor/buyer) with queue + detail shell.  
4. Add stage transition/history enforcement.  
5. Add minimal CAPA dashboard endpoint and UI cards/table.  
6. Add integration tests for:
   - candidate generation.
   - triage and formal CAPA creation.
   - close/reopen guards.
7. Roll out behind feature flag (`CAPA_V2_ENABLED`) and validate tenant-by-tenant.

---

## Appendix A: Current-state summary tables

### Reusable now

| Capability | Current Asset | Reuse Strategy |
|---|---|---|
| CAPA base persistence | `capaModel` + `capaController` | Keep as legacy compatibility |
| Observation sourcing | `auditReport.observations` | Primary candidate source |
| Question-level findings | `auditQuestions` comments/flags | Primary candidate source |
| Compliance hints | compliance run/question results | Severity/risk/reference enrichment |
| Attachment traceability | `listSupplierAttachmentsByUser` + document models | Source evidence links |
| Event logging | `AuditEvent`, `AuditTrail` | CAPA stage event records |
| Notifications | `NotificationOrchestratorService` | CAPA stage notifications |

### Must add for GMP-grade CAPA

| Gap | Needed Artifact |
|---|---|
| Candidate queue | `CAPA_Candidate` + queue APIs/UI |
| Intake and triage | `CAPA_Intake`, `CAPA_Triage` |
| Structured lifecycle | investigation/RCA/action/effectiveness models |
| Stage approvals | `CAPA_Approval` with stage-specific decisions |
| Transition controls | status machine + server guard utility |
| Trace complete lineage | source link records + immutable status history |
| Metrics/trending | `CAPA_Metric_Snapshot` + dashboard endpoints |

