# Part 2: Page-by-Page / Screen-by-Screen Detailed Specification (DEV Branch)

This part fulfills **SECTION 4** with two layers:
1. **Deep micro-spec** for core business-critical screens.
2. **Complete route inventory** for all discovered screens, linked to component/API hints.

Primary artifacts:
- `route_page_inventory.csv` (all pages)
- `page_component_inventory.csv` (all page files + imported components + API usage hints)
- `frontend_api_route_inventory.csv` (all Next API proxy routes)

Confidence policy:
- Control-level behavior in deep-spec pages: mostly `Confirmed from code`, with runtime nuances marked explicitly.
- Wrapper-only pages where logic sits in child components: `Strong inference from code` unless child inspected.

---

## SECTION 4 — DEEP PAGE SPECS (Critical Flows)

## 4.1 Page: Login
### A. Basic Identification
- Page name: Login
- Route: `/auth/signin`
- Purpose: Authenticate user, establish role/tenant session
- Personas: All
- Source file: `frontend/app/auth/signin/page.tsx`
- Related components: auth form components + server action `actions/auth.ts::login`
- Initial API call: `POST /api/auth/login`
- State management: local form state + server action + cookie session
- Query/path params: none (base login)

### B. UI Layout Breakdown
- Email/password inputs
- Submit action
- Recovery/verification links (from auth flow)
- Error state and validation message rendering

### C. Field-Level Inventory
| Label | Type | Required | Validation | Payload mapping | Backend persistence | Confidence |
|---|---|---|---|---|---|---|
| Email | text/email | Yes | non-empty + backend credential validation | `email` | checked against `users.email` | Confirmed from code |
| Password | password | Yes | non-empty + bcrypt compare backend | `password` | compared against `users.password` hash | Confirmed from code |

### D. Action-Level Inventory
| Action | Preconditions | API | Success | Failure | Next navigation |
|---|---|---|---|---|---|
| Sign in | valid form fields | `POST /api/auth/login` | create session cookie; load profile; route to dashboard or onboard | error message from backend | `/dashboard` or `/onboard` logic in auth action |

### E. Table/Grid Behavior
- N/A

### F. Workflow Relevance
- Entry point for every persona and role-bound navigation.

### G. Test Readiness Notes
- Invalid creds
- disabled user
- token/session creation
- profile-complete redirect behavior

---

## 4.2 Page: Signup + Import From Document
### A. Basic Identification
- Route: `/auth/signup`
- Purpose: Register role-specific account and bootstrap profile data
- Source: `frontend/app/auth/signup/page.tsx`, `components/auth/register.tsx`
- APIs:
  - `POST /api/auth/supplier-register-and-create-profile`
  - `POST /api/auth/buyer-register-and-create-profile`
  - `POST /api/auth/auditor-register-and-create-profile`
  - `POST /api/auth/register-prefill`
  - `POST /api/auth/register-prefill-agentic`
  - `POST /api/auth/register-archive-evidence`

### B. UI Layout Breakdown
- Company details block
- Personal details block
- Role selector
- Password + confirmation
- `Import from document` button (prefill path)

### C. Field-Level Inventory (primary)
| Field | Required | Key validations | Mapped payload key | Notes |
|---|---|---|---|---|
| Company Name | Yes | non-empty | `companyName` | Prefill target from extracted entities |
| Address Line 1 | Yes | non-empty | `addressline1` | Prefill candidate from address extraction |
| Country/State/City/Zip | country + zip typically mandatory | pattern/option checks (UI + backend) | `country`,`state`,`city`,`zipcode` | Prefill may fail if evidence weak |
| Title/First/Last | first+last required | non-empty | `title`,`firstName`,`lastName` | Name parsing from contact/email fallback in agentic service |
| Email | Yes | email format + uniqueness | `email` | backend unique index by email+tenant |
| Phone | Yes | phone format | `phone`,`countryCode` | Normalized by extraction service heuristics |
| Register As | Yes | enum set supplier/buyer/auditor | `role` | Controls target auth registration endpoint |
| Password/Confirm | Yes | match + complexity policy (if enforced UI) | `password` | never auto-filled from docs |

### D. Action-Level Inventory
| Action | Preconditions | API | Success behavior | Failure behavior |
|---|---|---|---|---|
| Import from document | file selected | `/api/auth/register-prefill` or `/register-prefill-agentic` | form fields populated + imported file counter | extraction failure message + follow-up prompts |
| Submit signup | required fields valid | role-specific register endpoint | account/profile created; potential verify-email flow | validation/server error |
| Archive signup evidence | uploaded files present | `/api/auth/register-archive-evidence` | evidence persisted to DigiLocker | role/tenant validation errors |

### E. Table/Grid
- N/A

### F. Workflow relevance
- Entry for net-new stakeholders and profile bootstrap automation.

### G. Test readiness
- Document types: SMF, audit reports, 483, WHO PIR, SOPs
- Ensure tenant creation and `tenant_id` handling
- Verify archive-to-DigiLocker post-signup path

---

## 4.3 Page: Onboarding Wizard
### A. Basic Identification
- Route: `/onboard`
- Purpose: Complete profile, locations/sites, products, users
- Source: `frontend/app/onboard/page.tsx`, `components/onboard/*`
- APIs: profile/site/product/user endpoints under `/api/profile/*`, `/api/supplier-sites/*`, `/api/supplier-products/*`, onboarding APIs

### B. Layout
- Multi-tab wizard pattern: primary info, locations, products, users
- Optional import-from-document affordances on onboarding tabs (implemented in relevant components)
- Save/continue actions

### C. Field-level patterns
- Strongly typed primary fields (company/contact/address)
- Site-level address + plant metadata
- Product/API mapping fields
- User invite/create fields

### D. Actions
- Save tab draft
- Submit onboarding completion
- Add site/product/user rows

### E. Grids
- Tabular forms in locations/products/users where row operations are present

### F. Workflow
- Blocks supplier full operational usage until complete (banner shown in console layout).

### G. Test notes
- onboarding incomplete banner overlay/spacing
- user creation from onboarding
- profile import quality and missing field prompts

---

## 4.4 Page: Request New Audit
### A. Basic Identification
- Route: `/request-audit`
- Source: `frontend/app/(console)/request-audit/page.tsx` -> `components/audits/newRequest.tsx`
- Personas: buyer/admin
- Initial APIs:
  - template list (`/api/next/templates`)
  - supplier/product/site lookup APIs

### B. Layout
- Header/title
- Request form with supplier/product/site/template/date context
- Submit action

### C. Field-level inventory (derived)
| Field cluster | Required | API dependencies | Persistence target |
|---|---|---|---|
| Supplier selection | Yes | buyer supplier list APIs | `audit-requests-master.supplier_id` |
| Product selection | Yes | products by supplier | `supplier_product_id` |
| Site selection | Yes | sites by supplier/product | `site_id` |
| Compliance date | Yes | form + validator | `complianceDate` |
| Template | Optional/required by workflow | templates API | `selectedTemplateId` |
| Auditor assignment (post create) | Optional immediate / later | assign-auditor API | `auditor_id` + assignment arrays |

### D. Actions
- Create request: `POST /api/buyer/audit-request`
- Assign auditors: `POST /api/audit-requests/:id/assign-auditors`

### E. Grid behavior
- Lookup dropdowns and possibly list selectors; no heavy table in base wrapper.

### F. Workflow
- Starts `INITIATED` phase and seeds default artifacts/milestones.

### G. Test notes
- duplicate audit prevention by supplier/product/site
- required field validation and date handling

---

## 4.5 Page: Audit Summary (Index)
### A. Basic Identification
- Route: `/audits`
- Purpose: Role-specific audit list and entry to detail flow
- Source: `frontend/app/(console)/audits/page.tsx`, `components/audits/index.tsx`
- APIs: `/api/audit-requests/buyer|supplier|auditor`, request detail lookups

### B. Layout
- Filter/search area
- Audit table/list
- CTA actions depending on role and status

### C. Field-level (table columns typical)
- Audit IDs (internal/hawkeye IDs)
- Supplier/site/product
- Phase/status/questionnaire status
- Updated date and action buttons

### D. Actions
- Open audit detail
- Assign auditor (buyer/admin)
- Archive/request decisions depending on role

### E. Table behavior
- Sorting/filtering/pagination expected via reusable table patterns (`Needs functional validation in UI/runtime`)

### F. Workflow relevance
- Central control board for progressing audits through stages.

### G. Test notes
- role scoping correctness
- archived visibility
- status chips consistency across tabs

---

## 4.6 Page: Audit Detail Questionnaire Mode (most critical)
### A. Basic Identification
- Route: `/audits/[id]/report?mode=questionnaire`
- Source: `frontend/app/(console)/audits/[id]/report/page.tsx`
- Personas: supplier/supplierUser/auditor/buyer/admin variants by controls
- Initial APIs:
  - fetch request details
  - fetch audit questions
  - fetch assignments
  - auditor-only: supplier attachments, compliance/report data

### B. UI Layout Breakdown
- Phase stepper + tabs (`Details`, `Tracking`, `Audit Log`, `Artifacts`)
- Questionnaire category tabs
- Question rows with supplier responses + auditor verification pane
- Section assignment panel
- Action buttons:
  - `Save All`
  - `Send to Supplier` / submit variants
  - `Scan docs & fill questionnaire`
  - `Run First Compliance Check`
  - `Summarize and Generate Report`
- Supplier Attachments (Consolidated) panel
- Compliance suggestion result table
- Draft report panel with observations/signature

### C. Field-Level Inventory (by question control type)
| Control type | Source schema | Value path | Validation | Persist API |
|---|---|---|---|---|
| Yes/No/NA radio | `answerType` or response schema blocks | `YesNoAnswers` or `responseDetails[blockKey]` | enum match + render-state verification | `PUT /api/auditor/audit-question/update-data/:auditRequestId` |
| Checkbox group | schema options/layout blocks | `textResponse` + `responseDetails` merged | option normalization, dedupe | same update endpoint |
| Text/Textarea | direct field | `textResponse` | required for mandatory questions | same update endpoint |
| Comments/observations | auditor side controls | `messages`, `internalNotes`, flags | role-restricted editing | same update endpoint |
| Attachment inputs | uploader components | `docUrls` + `auditorAttachments` | file URL/value integrity | same update endpoint / attachment endpoints |

### D. Action-Level Inventory
| Action | Preconditions | API/service call | Success behavior | Failure behavior |
|---|---|---|---|---|
| Save draft | editable scope + form state | update audit responses | toast/status update | error alert and unsaved changes |
| Send/submit to supplier | role + state checks | update audit request/questionnaire status | status transitions and notifications | blocked by validation or permission |
| Scan docs autofill | selected docs or attachments available | `POST /api/next/auditor/auto-fill/:auditRequestId` (with fallback `/api/auto-fill-questionnaire`) | mapped counts + metadata shown | detailed failure panel with mapped=0 and reason |
| Run first compliance check | auditor role + question data | compliance suggestion/run APIs | suggestion table populated | popup error (e.g., 404/not found/no standard) |
| Summarize and generate report | auditor role + context | report draft API | report panel renders with observations | error modal |
| View supplier attachments | auditor/admin role | `/api/auditor/audits/:auditId/supplier-attachments` | grouped and consolidated lists shown | no data or 404 state |

### E. Table/Grid behavior
- Question tables by category/subsection
- Section assignment grid with assignee, due date, status, notes
- Supplier attachment grouped cards/tables
- Compliance suggestion top findings table
- Report observations table with severity/chips

### F. Workflow relevance
- Core execution stage in audit workflow.
- Bridges supplier self-assessment to auditor validation, compliance analysis, and report drafting.

### G. Test readiness notes
- Radio/checkbox render verification vs mapped claims
- Supplier comments retention during auditor review
- Endpoint routing consistency (`/api/next/*` vs legacy)
- Attachment consolidation correctness across supplier users

---

## 4.7 Page: Test Artifacts Workbench
### A. Basic Identification
- Route: `/test-artifacts`
- Source: `frontend/app/(console)/test-artifacts/page.tsx` + `components/audits/TestArtifactsWorkbench.tsx`
- Persona: auditor/admin-like testing roles
- APIs:
  - `/api/next/auditor/test-artifacts/options`
  - `/api/next/auditor/test-artifacts/prefill`
  - `/api/next/auditor/test-artifacts/execution-rag-preview`
  - report-template preview endpoints

### B. Layout
- Artifact/template context selectors
- Buyer/supplier/site/product selectors
- Evidence selection/upload control
- Run preview action
- Output sections for autofill/report preview

### C. Field-level controls
- artifact type, template, org/site/product selectors
- multiple evidence file selection

### D. Actions
- Select evidence
- Run test preview
- Clear evidence

### E. Workflow relevance
- Safe test harness outside live audit flow for RAG/autofill/report behavior.

### G. Test notes
- bulk file selection and payload size handling
- preview output structure and confidence visibility

---

## 4.8 Page: DigiLocker Library
### A. Basic Identification
- Route: `/digilocker`
- Source: `frontend/app/(console)/digilocker/page.tsx`, `components/digilocker/DigiLockerLibrary`
- APIs: full DigiLocker suite (`/api/next/digilocker/*`)

### B. Layout
- Upload controls
- Document cards/list
- Tag suggestions and apply actions
- question evidence attach/retrieval entry points

### C. Key fields
- document title/type/department/tags/confidentiality
- version metadata (effective/expiry, file)

### D. Actions
- upload file
- create/update document metadata
- suggest/apply tags
- attach to question

### E. Table/grid behavior
- list view with status and actions

### F. Workflow relevance
- Shared evidence repository used by questionnaire autofill and auditor review.

### G. Test notes
- role access and tenant scope
- multi-file upload and version behavior
- share policy/audit-log traceability

---

## 4.9 Page: API Library
### A. Basic Identification
- Route: `/library/apis`
- Purpose: browse/claim APIs and map supplier products/plants
- Source: `frontend/app/(console)/library/apis/page.tsx`
- APIs: `/api/api-master/*`, `/api/supplier-products/*`, `/api/product-site-mappings/upsert`

### B. Layout
- API search/filter table
- claim modal
- CAS display/edit handling
- plant mapping controls

### C. Workflow relevance
- Drives audit subject context (product/API/site linkage).

### G. Test notes
- missing CAS flow
- multi-claim and multi-plant mapping

---

## 4.10 Page: RFQs
### A. Basic Identification
- Routes: `/rfqs`, `/rfqs/new`, `/rfqs/[id]`, `/rfqs/[id]/compare`, `/auditor/rfqs`
- Purpose: auditor sourcing and award process
- APIs: `/api/rfqs/*`

### B. Layout
- RFQ list table
- creation/edit forms
- quote comparison matrix

### G. Test notes
- permission split buyer vs auditor
- award action transition to audit assignment

---

## 4.11 Page: Insights
### A. Basic Identification
- Route: `/insights`
- Purpose: KPI and work queue reporting
- APIs: `/api/next/dashboard/{role}` + drilldown endpoints
- Key data structures include work queue items with audit identifiers (`hawkeyeRequestId`, etc.)

### G. Test notes
- work queue ID column correctness (`HAWK*` display requirement)
- role-specific dataset filtering

---

## 4.12 Page: FDA Dashboard
### A. Basic Identification
- Route: `/fda-dashboard`
- Purpose: external regulatory signal dashboard
- APIs: `/api/fda/dashboard`, `/api/fda/inspections`, `/api/fda/citations`, `/api/fda/forms483`

### G. Test notes
- supplier default filter and tenant scoping
- refresh behavior and stale snapshot handling

---

## 4.13 Page: AskHawk Admin
### A. Basic Identification
- Route: `/admin/askhawk` (+ `/admin/askhawk/unanswered`)
- Purpose: AskHawk KB ops and unanswered management
- APIs: `/api/askhawk/kb/stats`, `/api/askhawk/kb/sync`, `/api/askhawk/unanswered`, `/api/askhawk/evals*`

### G. Test notes
- hawkeye-admin/platform admin accessibility
- sync kb visibility and run status

---

## 4.14 Page: RAG Vector Setup
### A. Basic Identification
- Route: `/admin/rag-vectors`
- Purpose: manage compliance guideline document/vector ingestion
- APIs: compliance standards routes under `/api/compliance/standards/*`

### G. Test notes
- one-time extraction vs per-audit extraction behavior
- standard activation/version update effects

---

## 4.15 Page: Workspace Notifications + Preferences
### A. Basic Identification
- Routes: `/workspace/notifications`, `/workspace/notification-preferences`
- APIs: `/api/notifications*`, `/api/notification-preferences*`

### G. Test notes
- bell count parity with notification list
- preference enforcement

---

## 4.16 Page: Platform Console
### A. Basic Identification
- Routes: `/platform/*`
- Purpose: tenant/user/subscription/platform debug administration
- APIs: `/api/platform/*`

### G. Test notes
- platform admin without tenant context
- audit log and notifications-debug views

---

## SECTION 4 — COMPLETE PAGE INVENTORY (all discovered pages)

- Full list: `docs/application-analysis/route_page_inventory.csv` (123 lines including header)
- Component/API hint map: `docs/application-analysis/page_component_inventory.csv`

Fields in these artifacts:
- route
- page_name
- source file
- persona hint
- imported components
- API usage hint (nextApi/axios/fetch/server actions)

This provides full route-level coverage for all pages including:
- auth pages
- console pages by module
- nested dynamic audit routes
- tenant admin pages
- platform pages
- hidden/dev routes

---

## SECTION 4 — Known edge conditions by page family

| Page family | Hidden dependencies | Failure points | Confidence |
|---|---|---|---|
| Audit questionnaire/report mode | assignment model + status gating + attachment mapping + API proxy route consistency | false autofill counts, 404 on wrong proxy path, role-specific edit lock bugs | Confirmed from code + Needs runtime validation |
| Test Artifacts | large multipart payload + template/evidence selection dependencies | HTTP 413 payload too large, no-preview edge cases | Confirmed from code + Strong inference |
| DigiLocker | entitlement checks + owner/supplier scope logic | inaccessible docs for cross-user supplier context; attach confirmation UX gaps | Confirmed from code + Strong inference |
| AskHawk | tenant scope resolution + feature flag + role admin scope | tenantId required errors, disabled routes, citation quality | Confirmed from code |
| Onboarding import | extraction quality from varied doc types | weak prefill outcomes, missing mandatory fields | Confirmed from code + Needs runtime validation |

