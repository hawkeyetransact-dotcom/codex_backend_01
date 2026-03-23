# Part 4: User Journeys, Test Script Pack, Permission/Status Matrix, State Machine, Risks, Backlog (DEV Branch)

This part covers:
- **SECTION 6 — Click-by-click user journeys**
- **SECTION 8 — Test script pack**
- **SECTION 9 — Role/permission/status matrix**
- **SECTION 10 — Workflow state machine**
- **SECTION 12 — Gaps/Risks/Incomplete wires**
- **SECTION 13 — Implementation backlog recommendations**
- **SECTION 14 consolidated artifacts checklist**

---

## SECTION 6 — CLICK-BY-CLICK USER JOURNEYS

## 6.1 Journey: Buyer creates audit request and assigns auditor
1. Persona: Buyer
2. Starting page: `/request-audit`
3. Preconditions:
- Buyer logged in
- Supplier/site/product exists
- Template list available
4. Steps and system responses:
- Step 1: Open `Request New Audit` menu.
  - System: loads form and lookup lists (`templates`, suppliers/products/sites). `Confirmed from code`
- Step 2: Select supplier.
  - System: loads supplier-linked products/sites. `Confirmed from code`
- Step 3: Select product and site.
  - System: validates combination and availability. `Strong inference from code`
- Step 4: Set compliance date and optional template.
  - System: client validation for required fields. `Confirmed from code`
- Step 5: Click submit.
  - API: `POST /api/buyer/audit-request`.
  - System: creates `audit-requests-master` record and phase defaults. `Confirmed from code`
- Step 6: Redirect to `Audit Summary` and open created audit.
- Step 7: Assign auditor if not auto-assigned.
  - API: `POST /api/audit-requests/:id/assign-auditors`.
5. Validation/error possibilities:
- Missing required fields
- Duplicate/active audit conflict by site/product context (`Needs functional validation in UI/runtime`)
6. Status changes:
- `phaseState.currentPhase = INITIATED`
- `questionnaireStatus = request_received`
7. Notifications/tasks:
- Assignment/phase notifications expected (`Strong inference from code`)
8. Final outcome:
- Audit is initialized and visible in role-specific lists.
9. Negative/recovery paths:
- If duplicate conflict, user should open existing audit.
- If assignment fails, retry from audit detail.

## 6.2 Journey: Supplier uploads evidence, scans docs, and submits questionnaire
1. Persona: Supplier Admin
2. Starting page: `/audits/[id]/report?mode=questionnaire`
3. Preconditions:
- Audit visible to supplier
- Questionnaire released (`sent_to_supplier` or in progress)
4. Steps:
- Step 1: Open Attachments/DigiLocker and upload evidence.
  - API: `/api/digilocker/upload` or `/api/next/digilocker/upload`.
- Step 2: Attach evidence per question or via attachment tab.
  - API: `/api/digilocker/questions/:questionId/attach`.
- Step 3: Click `Scan docs & fill questionnaire`.
  - API: `/api/next/auditor/auto-fill/:auditRequestId` (fallback path exists).
- Step 4: Review highlighted auto-filled questions.
  - System: should show confidence, evidence references, and mapping metadata.
- Step 5: Manually adjust uncertain responses.
- Step 6: Click `Save All`.
  - API: questionnaire update endpoint.
- Step 7: Submit to auditor.
  - System updates questionnaire status to supplier-submitted/followup-submitted.
5. Validation/errors:
- No evidence -> mapped=0 expected clear message
- API route mismatch -> 404 risk
- radio/checkbox visible-state mismatch risk
6. Status changes:
- `in_progress` -> `supplier_submitted` or follow-up variant
7. Notifications/tasks:
- Auditor follow-up queue expected after submission
8. Final outcome:
- Responses + evidence persisted and ready for auditor review.

## 6.3 Journey: Auditor reviews, runs compliance, and generates report
1. Persona: Auditor
2. Starting page: `/audits/[id]/report?mode=questionnaire`
3. Preconditions:
- Supplier responses submitted
- Auditor role permitted
4. Steps:
- Step 1: Open questionnaire categories and review supplier responses.
- Step 2: Add auditor observations/comments and criticality.
- Step 3: Optionally flag follow-up questions.
- Step 4: Click `Run First Compliance Check`.
  - APIs: compliance suggestion/run endpoints.
- Step 5: Review compliance verdict table and references.
- Step 6: Click `Summarize and Generate Report`.
  - API: `/api/auditor/audits/:auditId/report/draft`.
- Step 7: Review report observations and signatures panel.
- Step 8: Sign report or request counterpart signatures.
5. Validation/errors:
- Missing standard vectors can fail run
- Endpoint/proxy mismatch can 404
- Empty/weak data can produce low-quality narrative
6. Status changes:
- questionnaire to auditor completion status
- report status transitions
7. Notifications:
- Signoff and follow-up events expected
8. Final outcome:
- Draft report generated; signoff pathway initiated/completed.

## 6.4 Journey: Admin updates RAG vectors and AskHawk KB
1. Persona: Admin / Tenant Admin / Superadmin (scope dependent)
2. Start: `/admin/rag-vectors`, `/admin/askhawk`
3. Steps:
- Upload/activate guideline documents in RAG vector setup.
- Trigger AskHawk KB sync from admin page.
- Run AskHawk quality evals and inspect unanswered queue.
4. APIs:
- `/api/compliance/standards/*`
- `/api/askhawk/kb/sync`, `/api/askhawk/kb/stats`, `/api/askhawk/evals*`, `/api/askhawk/unanswered`
5. Outcome:
- Updated standards and KB available for compliance/reporting/assistant.

## 6.5 Journey: Platform admin manages tenants (platform scope)
1. Persona: Superadmin / platform admin
2. Start: `/platform/tenants`
3. Steps:
- Create/update tenant, manage users/subscriptions.
- Review audit logs and notifications debug.
4. Risks:
- tenant-required middleware on some endpoints may block platform flows if not platform-safe.

---

## SECTION 8 — TEST SCRIPT PACK

### 8.A Persona-wise test pack
Artifacts:
- `top_100_manual_test_cases.csv` (100 detailed UAT cases)
- `smoke_test_pack.csv` (12 deployment smoke checks)
- `regression_test_pack.csv` (30 high-risk regression scenarios)

Persona coverage map:
- Buyer: request creation, RFQ, assignment, tracking
- Supplier: onboarding, evidence upload, questionnaire, submission
- SupplierUser: section-level permissions and limited menu
- Auditor: review/compliance/report/attachments
- Tenant Admin: company/users/workflow configs
- Superadmin: platform tenant ops and cross-tenant safety controls

### 8.B Module-wise test pack (minimum set)
| Module | Happy path | Edge cases | Failure behaviors to test |
|---|---|---|---|
| Auth | valid login | expired token, disabled user | redirect + cookie/session cleanup |
| Request Audit | create request | duplicate active audit | validation errors, no partial writes |
| Questionnaire | save/submit | unassigned sections, enum prefill mismatch | no false success counts |
| DigiLocker | upload/list/attach | large files, unsupported types | clear upload and attach errors |
| Compliance | run and read results | no standards, no evidence | graceful fail and actionable message |
| Report | generate draft/sign | empty or weak inputs | clear errors and no stale report corruption |
| Notifications | unread/list/open | preference changes | consistent bell count and deep-link |
| AskHawk | answer with citations | tenant mismatch, no KB hits | safe fallback with no cross-tenant leakage |

### 8.C Click-by-click manual UAT format
- Implemented in `top_100_manual_test_cases.csv` with columns:
  - `testCaseId`
  - `module`
  - `persona`
  - `preconditions`
  - `steps`
  - `expected`
  - `actual`
  - `result`
  - `defectNotes`

### 8.D API-backed validation scenarios
Core mappings:
- UI `Run First Compliance Check` -> `POST /api/auditor/compliance/runs` and/or `/audits/:id/compliance-suggestion`.
- UI `Summarize and Generate Report` -> `POST /api/auditor/audits/:id/report/draft`.
- UI `Scan docs & fill questionnaire` -> `POST /api/next/auditor/auto-fill/:auditRequestId`.
- UI evidence attach -> `POST /api/digilocker/questions/:questionId/attach`.

### 8.E Regression pack
- See `regression_test_pack.csv`.
- Top critical regression clusters:
  1. API routing consistency for core auditor/supplier actions
  2. Enum control hydration/render correctness
  3. Status engine synchronization across phase/questionnaire/tracking
  4. Notification consistency and deep-links
  5. Tenant boundary enforcement

### 8.F Smoke pack
- See `smoke_test_pack.csv`.
- Designed for post-deploy minimal confidence in core journey.

### 8.G Data integrity tests
Mandatory checks:
- UI value == API payload == DB stored value for questionnaire responses.
- Auto-fill metadata persistence without breaking manual overrides.
- Attachment list consistency across supplier users for auditor view.

---

## SECTION 9 — ROLE / PERMISSION / STATUS MATRIX

Primary artifacts:
1. `persona_vs_menu_matrix.csv`
2. `persona_vs_action_matrix.csv`
3. `role_permission_status_matrix.csv`
4. `workflow_status_matrix.csv`

### 9.1 Hidden permissions and inconsistencies
| Type | Observation | Impact | Confidence |
|---|---|---|---|
| Frontend-only restriction | `WORK` hidden in sidebar despite menu config entry | doc/UX drift | Confirmed from code |
| Frontend-only restriction | supplier sub-user users-menu hide done in UI logic | backend checks also required (partially present) | Confirmed from code |
| Backend-enforced not obvious in UI | tenant mismatch throws 403/404 | users may see unexpected not-found | Confirmed from code |
| Backend guard inconsistency risk | platform admin context not uniformly accepted on all tenant-guarded endpoints | admin failures | Strong inference from code |

---

## SECTION 10 — WORKFLOW STATE MACHINE

### 10.1 Textual state machine — audit phase
`INITIATED -> PREP -> PLANNING -> EXECUTION -> FINDINGS -> CAPA -> CLOSURE -> SURVEILLANCE`

For each phase:
- Entry condition: prior phase completion or request creation for INITIATED.
- Exit condition: phase-specific completion checks (artifacts/readiness/milestones).
- Who can change: role ownership from `auditPhases` + transition APIs.
- Downstream effects: artifact availability, milestone progression, notification events.

### 10.2 Textual state machine — questionnaire
`request_received -> in_progress -> sent_to_supplier -> supplier_submitted -> followup_requested -> followup_submitted -> review_completed -> auditor_submitted`

Transition drivers:
- Supplier save/submit actions
- Auditor follow-up and review completion
- API updates in report/questionnaire page logic and auditor controller.

### 10.3 Textual state machine — artifact status
`draft -> sent -> in_progress -> complete`

- Triggered by artifact send/submit actions and role signoffs.
- Intimation/scope specific lock behaviors implemented in audit phase controller paths.

### 10.4 Textual state machine — workflow milestones
`NOT_STARTED -> IN_PROGRESS -> COMPLETED`
`NOT_STARTED -> SKIPPED` (rule-based)

- Managed via workflow milestone instance APIs and tracking orchestration.

---

## SECTION 12 — GAPS / RISKS / INCOMPLETE WIRES

Primary artifact:
- `high_risk_gaps_register.csv` (12 curated gaps with evidence, impact, severity, fix, tests)

Top issues (critical):
1. API proxy path drift causing 404 for autofill/compliance/report actions.
2. Notification dual-stack inconsistency.
3. Platform admin tenant-context guard mismatches.
4. Potential plaintext password in supplier-user creation flow.
5. Status engine fragmentation (phase vs tracking vs questionnaire).
6. Autofill claimed counts vs rendered UI selected states.

All rows include impacted personas and post-fix test requirements.

---

## SECTION 13 — IMPLEMENTATION BACKLOG RECOMMENDATIONS

## 13.1 Critical production blockers
| Title | Problem | Recommendation | Impacted modules/personas | Priority | Size | Dependency |
|---|---|---|---|---|---|---|
| Standardize API proxy layer | Mixed `/api/*` proxy routes cause runtime drift | enforce one frontend API facade and contract test suite | questionnaire/compliance/report for supplier+auditor | P0 | M | frontend + backend contracts |
| Unify notification stack | Duplicate engines lead to inconsistent bell behavior | migrate all callers to modular notification stack and deprecate legacy routes | all personas | P0 | L | data migration + event mapping |
| Platform-safe guard audit | Platform admins blocked on tenant-required routes | audit and replace guards with platform-aware variants where intended | superadmin/platform admin | P0 | M | auth middleware review |
| Secure supplier user invitation | Plaintext password exposure risk | tokenized invite + forced first-login password setup | supplier admin + security | P0 | M | auth flow update |

## 13.2 Functional gaps
| Title | Problem | Fix | Priority |
|---|---|---|---|
| Autofill render verification | mapped != visibly selected controls | add render-level verifier + telemetry gate | P1 |
| Consolidated supplier attachments | inconsistent visibility across supplier users | org-scoped attachment query policy | P1 |
| Onboarding extraction feedback | unclear outcome quality | confidence + missing field prompts per field | P1 |
| CAS claim UX | missing CAS blocks claim workflow | inline CAS add/edit in claim modal | P1 |

## 13.3 UX improvements
- Improve explicit attach confirmation in question-level DigiLocker popup.
- Keep onboarding banner from overlapping responsive menu.
- Add stronger visual highlighting for autofilled answers + evidence references.
- Ensure milestone labels are user-friendly (no technical codes in UI).

## 13.4 QA automation priorities
1. API contract tests for core buttons (`autofill`, `compliance`, `report generate`).
2. UI integration tests for enum prefill render correctness.
3. Tenant isolation tests for AskHawk and data pages.
4. Notification end-to-end tests (event -> bell -> deep-link).

## 13.5 Documentation priorities
- Keep `docs/application-analysis` synced with route/matrix generators at release cut.
- Add generated docs timestamp + commit hash in index.

## 13.6 Security/permission hardening
- Enforce backend permission checks for all UI-hidden actions.
- Normalize role naming and scope handling across middleware.
- Ensure no plaintext credential transmission in mail content.

## 13.7 Performance improvements
- Chunk bulk evidence processing to avoid HTTP 413.
- Consider async jobs for heavy extraction/compliance generation.
- Add pagination and lazy retrieval in large attachment lists.

## 13.8 Technical debt cleanup
- Remove dead `WORK` menu config or feature-flag consistently.
- Consolidate status sources into single canonical engine with projections.
- Standardize error envelope across controllers.

---

## SECTION 14 — CONSOLIDATED ARTIFACT CHECKLIST

Delivered in `docs/application-analysis`:

1. Master Feature Inventory Table
- `master_feature_inventory.csv`

2. Persona vs Menu Matrix
- `persona_vs_menu_matrix.csv`

3. Persona vs Action Matrix
- `persona_vs_action_matrix.csv`

4. Route/Page Inventory
- `route_page_inventory.csv`
- `page_component_inventory.csv`

5. API Catalog
- `api_catalog.csv`
- `frontend_api_route_inventory.csv`

6. DB Entity Catalog
- `db_entity_catalog.csv`

7. Workflow Status Matrix
- `workflow_status_matrix.csv`
- `role_permission_status_matrix.csv`

8. Top 100 Manual Test Cases
- `top_100_manual_test_cases.csv`

9. Smoke Test Pack
- `smoke_test_pack.csv`

10. Regression Test Pack
- `regression_test_pack.csv`

11. High-Risk Gaps Register
- `high_risk_gaps_register.csv`

Sequenced narrative docs:
- `PART_1_EXEC_MAP_PERSONAS_NAV.md`
- `PART_2_PAGE_BY_PAGE_SPEC.md`
- `PART_3_FEATURE_TECH_ARCH.md`
- `PART_4_TEST_RISK_BACKLOG.md`

