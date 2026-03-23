# Part 1: Executive Map, Persona Catalog, Navigation Inventory (DEV Branch)

Analysis scope:
- Backend repo: `C:\Users\debab\Code - Hawkeye\hawkeye-clean\_wt_backend_dev_artifacts_20260223`
- Frontend repo: `C:\Users\debab\Code - Hawkeye\hawkeye-clean\_wt_frontend_dev_artifacts_20260223`
- Branch context: `dev` worktrees for both repos
- Timestamp baseline: 2026-03-09

Confidence tags used throughout:
- `Confirmed from code`
- `Strong inference from code`
- `Needs functional validation in UI/runtime`

---

## SECTION 1 — APPLICATION EXECUTIVE MAP

### 1.1 Product purpose
| Name | Description | Where found in code | Related files/routes/models | Confidence |
|---|---|---|---|---|
| Hawkeye audit lifecycle platform | Multi-tenant GMP audit orchestration platform covering request, planning, execution questionnaire, evidence, findings, CAPA, closure, and surveillance | Frontend route map + backend route mounts | `frontend/app/(console)/*`, `backend/src/app.js`, `backend/src/constants/auditPhases.js`, `backend/src/models/auditRequestsMasterModel.js` | Confirmed from code |
| AI-assisted compliance + reporting | AI-assisted questionnaire autofill, compliance suggestion/runs, report draft generation, AskHawk contextual assistant | Auditor routes/controllers + AskHawk routes | `backend/src/routes/auditorRoutes.js`, `backend/src/routes/complianceRunRoutes.js`, `backend/src/controllers/reportController.js`, `backend/src/routes/askHawkRoutes.js` | Confirmed from code |

### 1.2 Core business domains covered
| Domain | Why it exists | Where found | Key components/routes/models | Confidence |
|---|---|---|---|---|
| Supplier discovery & risk | Identify and monitor suppliers and external risk signals | Discovery menus/pages | `frontend/constant/app-config.ts`, `/supplier-marketplace`, `/fda-dashboard`, `/insights`; `buyerRoutes`, `fdaRoutes`, risk routes | Confirmed from code |
| Audit procurement | Create audit requests, RFQs, assign auditors | Procurement menus and APIs | `/request-audit`, `/rfqs`; `buyerRoutes`, `rfqRoutes`, `auditRequestRoutes` | Confirmed from code |
| Audit operations | Manage phase progression, questionnaires, findings, CAPAs, report signoff | Audit summary and detail flows | `/audits`, `/audits/[id]/*`; `auditPhaseRoutes`, `trackingRoutes`, `auditorRoutes`, `capaRoutes` | Confirmed from code |
| Evidence governance | Upload/manage evidence, map evidence to questions, policy/redaction/audit logs | DigiLocker + attachment flows | `/digilocker`; `digilockerRoutes`, document disclosure routes/models | Confirmed from code |
| Tenant/platform governance | Tenant admin and platform admin controls for users/company/workflow config | `/admin/*`, `/platform/*` | `adminTenantRoutes`, `platformRoutes`, `workflowMilestoneRoutes`, `tenant model` | Confirmed from code |
| AI knowledge & automation | AskHawk, RAG vectors, standards-based compliance processing | AskHawk + RAG admin pages | `/admin/askhawk`, `/admin/rag-vectors`; `askHawkRoutes`, `complianceStandardsRoutes`, `complianceRunRoutes` | Confirmed from code |

### 1.3 Primary user personas / roles
| Persona | Role key(s) in code | Purpose | Source | Confidence |
|---|---|---|---|---|
| Supplier Admin | `supplier` | Own supplier onboarding, evidence upload, questionnaire completion, supplier-team management | `frontend/constant/constants.ts`, `backend/src/models/userModel.js` | Confirmed from code |
| Supplier User | `supplierUser` | Contribute assigned questionnaire sections and attachments | `userModel`, `SidebarNav` restrictions, questionnaire assignment APIs | Confirmed from code |
| Buyer | `buyer` | Create and govern audit requests, RFQ and supplier selection workflows | `buyerRoutes`, buyer pages | Confirmed from code |
| Auditor | `auditor` | Review supplier responses, run compliance checks, generate report and findings | `auditorRoutes`, compliance/report/test-artifacts pages | Confirmed from code |
| Tenant Admin | `tenant_admin` | Tenant governance: users/company/workflow settings and admin utilities | admin routes + middleware | Confirmed from code |
| Admin (tenant privileged) | `admin` | Broad tenant operational/admin powers and AI admin pages | menu + route permits + middleware | Confirmed from code |
| Superadmin / Platform admin | `superadmin` + `adminScope=PLATFORM` | Platform-level multi-tenant governance | `platformRoutes`, auth middleware adminScope handling | Confirmed from code |
| Generic user (legacy) | `user` | Legacy default role in schema, limited explicit workflow rights | `userModel` enum | Strong inference from code |

### 1.4 High-level end-to-end workflows
| Workflow | Business intent | Main steps | Code anchors | Confidence |
|---|---|---|---|---|
| Buyer-led audit initiation | Start audit lifecycle for supplier/site/product | Login -> Request Audit -> assign auditor -> phases begin | `request-audit` page + `POST /api/buyer/audit-request`, `auditRequestsMaster` | Confirmed from code |
| Supplier questionnaire execution | Supplier responds to execution questionnaire with evidence | Open audit questionnaire -> fill/edit answers -> attach evidence -> submit/followup | report/questionnaire pages, `updateAuditResponses`, DigiLocker attach endpoints | Confirmed from code |
| Auditor compliance + report | Auditor validates responses and generates report | Review answers/comments -> run compliance -> generate draft report -> sign/share | `runAuditComplianceSuggestionApi`, `generateAuditReportDraftApi`, `reportController` | Confirmed from code |
| CAPA closure | Track and close corrective actions from findings | Findings/observations -> generate CAPAs -> supplier actions -> closure | CAPA routes/model + report CAPA generation | Strong inference from code |
| AskHawk operational assistance | Role-aware user help with citations and tenant safety | Ask question -> retrieval/tool/fallback -> response + citations -> telemetry | `askHawkController`, `authorizeAskHawk`, `AskHawkDrawer` | Confirmed from code |

### 1.5 Main modules
| Module | UI location | Backend domain | Confidence |
|---|---|---|---|
| Discovery | `DISCOVERY` sidebar section | Dashboard/risk/fda/buyer marketplace routes | Confirmed from code |
| Procurement | `PROCUREMENT` sidebar section | buyer/rfq/audit-request routes | Confirmed from code |
| Operations | `OPERATIONS` sidebar section | audit/tracking/questionnaire/report workflow | Confirmed from code |
| Assets | `ASSETS` sidebar section | digilocker/sites/products/integrations | Confirmed from code |
| Admin | `ADMIN` sidebar section | user/admin settings, AskHawk admin, RAG vectors | Confirmed from code |
| Platform Admin | `/platform/*` routes | platform management APIs | Confirmed from code |

### 1.6 Navigation structure (high level)
- Navigation source of truth: `frontend/constant/app-config.ts` (`SidebarMenuSections`) and runtime filtering in `frontend/components/layout/Drawer/SidebarNav.tsx`. `Confirmed from code`
- Runtime visibility gates:
  - Role match
  - Module entitlement (`/api/v2/modules/active`)
  - Supplier sub-user special restriction (`USERS` hidden)
  - Hard hide for `WORK`
  - AskHawk and onboarding coach rendered inline at sidebar footer

### 1.7 Major entities / objects in system
| Entity | Purpose | File | Confidence |
|---|---|---|---|
| `audit-requests-master` | Canonical audit request + phase/questionnaire status fields | `backend/src/models/auditRequestsMasterModel.js` | Confirmed from code |
| `auditQuestions` | Renderable questionnaire question/answer records + autoFill metadata | `backend/src/models/auditQuestionsModels.js` | Confirmed from code |
| `workflow_milestone_instances` | SLA/milestone execution status per audit entity | `backend/src/models/workflowMilestoneInstanceModel.js` | Confirmed from code |
| `digilocker_documents` + versions/maps | Evidence lifecycle and question linkage | DigiLocker model set | Confirmed from code |
| `compliance_runs` + results | Compliance check lifecycle and verdict details | compliance models/routes | Confirmed from code |
| `audit-reports` | Generated report body/signature status | report model/controller | Confirmed from code |
| `users` + `tenant` | Identity, role, scope, tenant boundaries | `userModel`, `tenantModel` | Confirmed from code |
| `kb_articles`/`kb_chunks`/`hawk_conversations` | AskHawk KB and conversation telemetry | AskHawk models | Confirmed from code |

### 1.8 Lifecycle/status-driven process flows
Primary status families discovered:
- Audit phase (`INITIATED` -> `PREP` -> `PLANNING` -> `EXECUTION` -> `FINDINGS` -> `CAPA` -> `CLOSURE` -> `SURVEILLANCE`) `Confirmed from code`
- Phase detail status (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`) `Confirmed from code`
- Questionnaire status (`request_received` ... `auditor_submitted`) `Confirmed from code`
- Milestone status (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `SKIPPED`) `Confirmed from code`
- Artifact status (`draft`, `sent`, `in_progress`, `complete`) `Confirmed from constants + controller behavior` (`Strong inference from code` for full transition rules)

### 1.9 Integrations / external dependencies
| Integration | Purpose | Evidence in code | Confidence |
|---|---|---|---|
| LLM services | Autofill/compliance/report/AskHawk extraction and generation | `callLlmService`, report and profile import controllers | Confirmed from code |
| File parsing/OCR pipeline | Parse PDFs/images/docx for evidence/profile extraction | `extractTextFromBuffer`, questionnaire/document extraction services | Confirmed from code |
| SMTP/email helper | Invites, verification, password reset notifications | `sendMail` usage in auth controller | Confirmed from code |
| Scheduler jobs | notifications, public intel, risk, integration background runs | scheduler starts in `src/app.js` (non-serverless only) | Confirmed from code |
| Swagger docs | API docs endpoint | `/api-docs` in `src/app.js` | Confirmed from code |

### 1.10 AI/automation touchpoints
| Touchpoint | UI trigger | Backend | Confidence |
|---|---|---|---|
| Signup/onboarding prefill | `Import from document` | `POST /api/auth/register-prefill`, `/register-prefill-agentic` | Confirmed from code |
| Supplier questionnaire autofill | `Scan docs & fill questionnaire` | `/api/auditor/auto-fill/:auditRequestId` + fallback route | Confirmed from code |
| Auditor compliance check | `Run First Compliance Check` | `/api/auditor/compliance/runs` and `/audits/:id/compliance-suggestion` | Confirmed from code |
| Report generation | `Summarize and Generate Report` | `/api/auditor/audits/:id/report/draft` | Confirmed from code |
| AskHawk | Sidebar Ask Hawk launcher | `/api/askhawk/chat`, retrieval/tools/evals/sync | Confirmed from code |
| RAG vector setup | Admin `RAG Vector Setup` | compliance standards/vector routes | Confirmed from code |

---

## SECTION 2 — PERSONA CATALOG

### 2.1 Persona details

#### Supplier Admin (`supplier`)
1. Business purpose: Primary supplier account for onboarding, response submission, evidence handling, and supplier team management. `Confirmed from code`
2. System access scope: Tenant-scoped data; supplier-owned audits and assets; no platform scope. `Confirmed from code`
3. Menus visible: Insights, My Risk, Product Catalog, FDA Dashboard, Workspace, Audit Summary, Calendar, DigiLocker/QMS Vault, Sites, API Library, Mass Upload, Integrations, Users, Notification Preferences, Settings. `Confirmed from code`
4. Screens accessible: `/audits/*`, `/digilocker`, onboarding, sites/products/users, supplier dashboard/risk/api-library pages. `Confirmed from code`
5. Actions allowed: Fill questionnaire, upload evidence, submit supplier responses, add supplier users, manage profile/sites/products. `Confirmed from code`
6. Actions restricted: Buyer-only request creation, auditor-only compliance/report generation actions. `Confirmed from code`
7. Data CRUD: Supplier profile/site/product, supplier user records, evidence docs, questionnaire responses. `Confirmed from code`
8. Workflow ownership: PREP and CAPA ownership per phase constants. `Confirmed from code`
9. Special validations/notifications: onboarding banner if incomplete; assignment-based question editability; notification preferences. `Confirmed from code`
10. Backend authorization rules: `permit("supplier" ...)` across relevant routes; tenant checks via auth middleware. `Confirmed from code`
11. Frontend conditional rendering: supplier-only buttons, read-only states when questionnaire not released/assigned. `Confirmed from code`
12. Risks to test: supplier attachment visibility across supplier sub-users; profile extraction accuracy; autofill render mismatch for enums. `Strong inference from code`

#### Supplier User (`supplierUser`)
1. Business purpose: Delegated contributor for assigned questionnaire categories. `Confirmed from code`
2. Access scope: Tenant+supplier scoped; restricted admin controls. `Confirmed from code`
3. Menus visible: Similar to supplier but `USERS` hidden and certain admin capabilities restricted. `Confirmed from code`
4. Allowed actions: Edit assigned questionnaire sections, upload evidence, submit assigned sections. `Confirmed from code`
5. Restricted actions: Supplier team management, buyer/auditor/admin routes, unassigned section edits. `Confirmed from code`
6. Workflow ownership: Contributing actor in supplier phases; not final governance owner. `Strong inference from code`
7. Known gaps: Section-level authorization should be regression tested for bypass attempts. `Strong inference from code`

#### Buyer (`buyer`)
1. Business purpose: Trigger audits, select suppliers/auditors, own closure decisions. `Confirmed from code`
2. Menus: Insights, Supplier Risk/Marketplace, Product Catalog, Auditor Network, FDA Dashboard, Request Audits, RFQs, Workspace, Audit Summary, DigiLocker, API Library, Integration, notification preferences, settings. `Confirmed from code`
3. Allowed actions: Create audit request, invite auditors, manage RFQs, view/approve workflow progress, report signoff role. `Confirmed from code`
4. Restricted actions: Auditor-exclusive compliance run and detailed questionnaire review actions. `Confirmed from code`
5. Workflow ownership: INITIATED and CLOSURE owner roles in phase constants. `Confirmed from code`
6. Risks: supplier data scoping and marketplace-to-request routing integrity. `Strong inference from code`

#### Auditor (`auditor`)
1. Purpose: Lead audit execution, validate compliance, generate report/followups/CAPAs. `Confirmed from code`
2. Menus: Insights, RFQs (auditor view), Workspace, Audit Summary, Calendar, Template Management, Test Artifacts, DigiLocker, API Library, Integrations, notification preferences, settings. `Confirmed from code`
3. Actions allowed: Review/update questionnaire, flag follow-up, run compliance suggestions/runs, generate/report sign, list supplier attachments, test artifact preview and report preview. `Confirmed from code`
4. Restrictions: Buyer-only request creation and supplier organization administration. `Confirmed from code`
5. Workflow ownership: PLANNING, EXECUTION, FINDINGS, SURVEILLANCE phases. `Confirmed from code`
6. Risks: endpoint path drift for critical buttons; supplier comments retention; attachment consolidation reliability. `Strong inference from code`

#### Tenant Admin (`tenant_admin`)
1. Purpose: Tenant governance, company/users/workflow milestone SLA definitions. `Confirmed from code`
2. Access: `/admin/*` and permitted operations plus several operational pages. `Confirmed from code`
3. Actions: Manage tenant users/company, workflow milestone definitions/SLA, audit oversight. `Confirmed from code`
4. Restrictions: platform-wide tenant management unless superadmin/platform scope. `Confirmed from code`
5. Risks: role normalization and route guard consistency (`tenant_admin` vs `admin`). `Strong inference from code`

#### Admin (`admin`)
1. Purpose: Broad tenant operational + admin controls; can access RAG vectors and AskHawk admin in menu. `Confirmed from code`
2. Access: Multi-module including buyer-like and admin features based on route permits. `Confirmed from code`
3. Risks: mixed use as tenant admin vs platform fallback based on allowlist/scope in auth logic. `Strong inference from code`

#### Superadmin / Platform Admin (`superadmin`, `adminScope=PLATFORM`)
1. Purpose: Platform-level governance across tenants. `Confirmed from code`
2. Access: `/platform/*`, elevated admin routes, plus forced audit summary fallback in sidebar logic. `Confirmed from code`
3. Risks: tenant-required middleware on some endpoints causing context errors if not using platform-safe guard. `Confirmed from code` + `Strong inference from code`

#### Generic user (`user`)
1. Purpose: legacy/default role in user schema. `Confirmed from code`
2. Access: no major explicit workflow routes tied to this role. `Strong inference from code`
3. Risk: orphaned role can create access ambiguity if user records use this role. `Strong inference from code`

### 2.2 Persona vs feature matrix
- Full matrix artifact: `docs/application-analysis/persona_vs_feature_matrix.csv`
- Full menu matrix artifact: `docs/application-analysis/persona_vs_menu_matrix.csv`
- Full action matrix artifact: `docs/application-analysis/persona_vs_action_matrix.csv`

---

## SECTION 3 — FULL MENU / NAVIGATION INVENTORY

### 3.1 Canonical menu inventory
- Source file: `frontend/constant/app-config.ts`
- Runtime filter layer: `frontend/components/layout/Drawer/SidebarNav.tsx`
- Generated artifact: `docs/application-analysis/menu_inventory.csv`

Columns included in artifact:
1. Display label
2. Internal route/path
3. Parent menu
4. Sub-menu path
5. Persona visibility
6. Feature purpose
7. Frontend source file
8. Backend/API dependency hints
9. Entry conditions
10. Exit actions/onward navigation
11. Exposed in UI or not
12. Feature flag/role/status/module dependency notes

### 3.2 Hidden routes and non-sidebar entry points
| Route | Entry mode | Notes | Confidence |
|---|---|---|---|
| `/audits/[id]/report?mode=questionnaire` | Button/tab deep-link | Core questionnaire UI mode; not always explicit sidebar item | Confirmed from code |
| `/audits/[id]/audit-log` | Audit detail tab | CFR traceability view | Confirmed from code |
| `/audits/[id]/artifacts/[artifactId]` | Artifact list row click | Detail-level artifact management | Confirmed from code |
| `/admin/askhawk/unanswered` | AskHawk admin nested page | Unanswered triage | Confirmed from code |
| `/platform/tenants/[tenantId]` | Platform table row drilldown | Tenant detail | Confirmed from code |
| `/api/*` proxy routes | Programmatic only | Next proxy routes not directly navigated by users | Confirmed from code |

### 3.3 Hierarchical navigation tree (UI + nested child pages)
- `Discovery`
  - `Insights` -> `/insights`
  - `Supplier Risk` -> `/buyer/suppliers`
  - `My Risk` -> `/supplier/risk`
  - `Supplier Marketplace` -> `/supplier-marketplace`
  - `Product Catalog` -> `/products`
  - `Auditor Network` -> `/auditor-network`
  - `FDA Dashboard` -> `/fda-dashboard`
- `Procurement`
  - `Request New Audit` -> `/request-audit`
  - `RFQs` -> `/rfqs` (buyer/admin) and `/auditor/rfqs` (auditor)
- `Operations`
  - `Workspace` -> `/workspace`
    - `/workspace/notifications`
    - `/workspace/notification-preferences`
  - `Audit Summary` -> `/audits`
    - `/audits/[id]` detail shell
      - `Details` tab
      - `Tracking` tab
      - `Audit Log` tab
      - `Artifacts` tab
      - Routes: `questionnaire`, `report`, `report-view`, `generate-report`, `milestones`, `scheduling`, `summary`, `template`
  - `Calendar` -> `/calendar`
  - `Template Management` -> `/template-management`
  - `Test Artifacts` -> `/test-artifacts`
- `Assets`
  - `DigiLocker` -> `/digilocker` (or `/qms/vault` for vault full entitlement)
    - Upload route `/digilocker/upload`
  - `Sites` -> `/sites`
    - Add `/sites/add`
    - Edit `/sites/edit/[id]`
  - `API Library` -> `/library/apis`
  - `Mass Upload` -> `/mass-upload`
  - `Integration` -> `/integrations`
    - New `/integrations/new`
    - Connection `/integrations/connections/[id]`
- `Admin`
  - `Users` -> `/users` (supplier admin only)
  - `Notification Preferences` -> `/workspace/notification-preferences`
  - `RAG Vector Setup` -> `/admin/rag-vectors`
  - `AskHawk Admin` -> `/admin/askhawk`
    - Unanswered `/admin/askhawk/unanswered`
  - `Settings` -> `/settings`
- Platform-only routes (separate layout)
  - `/platform/tenants`
  - `/platform/users`
  - `/platform/subscriptions`
  - `/platform/audit-logs`
  - `/platform/notifications-debug`

### 3.4 Entry/exit condition patterns (cross-cutting)
- Entry conditions:
  - Auth token present + valid (`frontend/middleware.ts`) `Confirmed from code`
  - Role allowed by sidebar + backend `permit()` checks `Confirmed from code`
  - Tenant scope valid (except platform fallback conditions) `Confirmed from code`
  - Module entitlement gates for audit/vault features (`/api/v2/modules/active`) `Confirmed from code`
- Exit/onward actions:
  - Most table rows drill into detail routes
  - Save/submit actions typically persist and keep user in flow with toast/alert
  - Some buttons trigger workflow transitions and status updates

---

## Consolidated artifact links generated for Part 1

1. `docs/application-analysis/menu_inventory.csv`
2. `docs/application-analysis/persona_vs_menu_matrix.csv`
3. `docs/application-analysis/persona_vs_action_matrix.csv`
4. `docs/application-analysis/persona_vs_feature_matrix.csv`
5. `docs/application-analysis/route_page_inventory.csv`
6. `docs/application-analysis/page_component_inventory.csv`

