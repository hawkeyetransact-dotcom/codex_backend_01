# Part 3: Feature Inventory + Development View + UI/UX Interaction Catalog (DEV Branch)

This part covers:
- **SECTION 5 — Feature Inventory (Business + Software)**
- **SECTION 7 — Technical Implementation Map**
- **SECTION 11 — UI/UX Control and Interaction Catalog**
- Includes consolidated artifact references required in SECTION 14.

Primary generated artifacts used:
- `master_feature_inventory.csv`
- `api_catalog.csv`
- `db_entity_catalog.csv`
- `frontend_api_route_inventory.csv`
- `page_component_inventory.csv`

---

## SECTION 5 — FEATURE INVENTORY (BUSINESS + SOFTWARE)

### 5.1 Master feature register
- Full artifact: `docs/application-analysis/master_feature_inventory.csv`
- Contains: feature name, category, business purpose, technical implementation, personas, UI triggers, source files, APIs, DB entities, validations, status dependencies, known gaps, test needs, confidence.

### 5.2 Category A — Business/workflow feature groups (compiled)

1. Audit lifecycle orchestration
- What: End-to-end phase-based audit workflow from request to closure/surveillance.
- Why: Preserve accountable progression and ownership.
- Who: Buyer/Supplier/Auditor/Admin.
- Where: `/audits`, `/audits/[id]/*`, tracking/milestones.
- APIs: `auditRequestRoutes`, `auditPhaseRoutes`, `trackingRoutes`, `workflowMilestoneRoutes`.
- DB: `audit-requests-master`, milestone models, status trackers.
- Confidence: `Confirmed from code`.

2. Execution questionnaire management
- What: Dynamic questionnaire rendering with supplier responses and auditor verification.
- Why: Structured compliance data capture.
- Who: Supplier/SupplierUser/Auditor.
- Where: `/audits/[id]/report?mode=questionnaire`.
- APIs: `/api/auditor/audit-questionsId`, `/api/auditor/audit-question/update-data/:auditRequestId`.
- DB: `auditQuestions` with `responseSchema` and `autoFillMeta`.
- Confidence: `Confirmed from code`.

3. Evidence and DigiLocker governance
- What: Evidence storage, versioning, mapping, tags, checklist.
- Why: Traceable documentary support for responses/findings.
- Who: Supplier/SupplierUser/Auditor/Buyer/Admin.
- Where: `/digilocker` and questionnaire attachment controls.
- APIs: `/api/digilocker/*` routes.
- DB: DigiLocker document/version/mapping/checklist/policy models.
- Confidence: `Confirmed from code`.

4. Compliance check engine
- What: Run-level compliance analysis against standards (ICH/CFR contexts).
- Why: Early risk insight and auditor guidance.
- Who: Auditor (primary), admin roles.
- Where: questionnaire page (`Run First Compliance Check`).
- APIs: `/api/auditor/compliance/runs*` and `/api/auditor/audits/:id/compliance-suggestion`.
- DB: compliance run/result/standard models.
- Confidence: `Confirmed from code`.

5. Report generation and signoff
- What: Draft report generation with observations and signatures.
- Why: Formal audit output and closure evidence.
- Who: Auditor, Buyer, Supplier.
- Where: questionnaire/report page.
- APIs: `/api/auditor/audits/:id/report/draft`, `/report`, `/report/sign`, `/report/capas/generate`.
- DB: `audit-reports`, CAPA models.
- Confidence: `Confirmed from code`.

6. RFQ procurement workflow
- What: RFQ creation, quote comparison, award.
- Why: Auditor sourcing and commercial alignment.
- Who: Buyer, Auditor.
- Where: `/rfqs*` pages.
- APIs: `/api/rfqs/*`.
- DB: RFQ models.
- Confidence: `Confirmed from code`.

7. Onboarding + profile import automation
- What: Profile/sites/products/users onboarding with document prefill.
- Why: Reduce manual registration burden.
- Who: Supplier (primary), buyer/auditor registration flows.
- APIs: `/api/auth/register-prefill`, `/register-prefill-agentic`, `/api/profile/import`.
- DB: profile/site/product/user models plus optional document archive.
- Confidence: `Confirmed from code`.

8. API claim and plant mapping
- What: Claim API master entries and map to sites/plants.
- Why: Accurate product/site context for audits.
- Who: Supplier.
- APIs: `/api/api-master/*`, `/api/supplier-products/*`, `/api/product-site-mappings/upsert`.
- Confidence: `Confirmed from code`.

### 5.3 Category B — Platform/software utility features

1. Role-based access control
- Stack: frontend menu filter + backend `permit()` + auth middleware tenant checks.
- Confidence: `Confirmed from code`.

2. Feature flags and module entitlements
- Flags in frontend feature flag file + entitlement API (`/api/v2/modules/active`).
- Confidence: `Confirmed from code`.

3. Notification engine
- Legacy and modular stacks coexist (functional but risk noted).
- Confidence: `Confirmed from code`.

4. AskHawk assistant
- Multi-intent response modes (faq/tool/knowledge/generic), citations, telemetry, evals.
- Confidence: `Confirmed from code`.

5. Table variants/saved views (backend)
- API exists; UI usage partial by module.
- Confidence: `Confirmed from code` + `Needs functional validation in UI/runtime`.

6. Dashboard analytics (including AI metrics)
- Dashboard API response includes KPI/workQueue/aiMetrics structures.
- Confidence: `Confirmed from code`.

---

## SECTION 7 — DEVELOPMENT VIEW / TECHNICAL IMPLEMENTATION MAP

## 7.1 Frontend architecture

| Dimension | Implementation | Source | Confidence |
|---|---|---|---|
| Framework | Next.js app router (`app/*`) | frontend `package.json`, route structure | Confirmed from code |
| UI stack | React + MUI + icons + SweetAlert + DataGrid | dependencies + component usage | Confirmed from code |
| Routing | File-system route convention, nested route groups (`(console)`) | `frontend/app/*` | Confirmed from code |
| State management | Component-local state, hooks, server actions, session context | `useSession`, React hooks in pages/components | Confirmed from code |
| Form handling | Mixture of local state + reusable controls; some `react-hook-form` dependencies available | components/auth/onboard/questionnaire | Strong inference from code |
| Validation | UI schema checks + backend validators/Joi | validators + page logic | Confirmed from code |
| API service layer | `nextApi` wrapper + `axiosInstance` + fetch in file uploads | `lib/nextApi.ts`, `lib/dashboardApi.ts`, `lib/digilockerApi.ts` | Confirmed from code |
| Auth guard | Next middleware token validation and redirects | `frontend/middleware.ts` | Confirmed from code |
| Feature flags | `constant/featureFlags.ts` (`ASKHAWK`, nav grouping, etc.) | feature flag file | Confirmed from code |
| Theming/styling | MUI theme + CSS modules/classes + palette behavior | layout and MUI usage | Confirmed from code |

### Frontend architecture observations
- Mixed API client patterns (`nextApi`, `axiosInstance`, raw `fetch`) increase routing drift risk. `Confirmed from code`
- Sidebar behavior depends on role + entitlement + hardcoded exceptions (`WORK` hidden). `Confirmed from code`

## 7.2 Backend architecture

| Dimension | Implementation | Source | Confidence |
|---|---|---|---|
| Framework | Express (ESM) + Mongoose | backend `package.json`, `src/app.js` | Confirmed from code |
| Route grouping | Large domain route files mounted in `src/app.js` | app mounts | Confirmed from code |
| Middleware | auth, role permit, tenant guards, module entitlement guards, validation | `src/middlewares/*` | Confirmed from code |
| Validation | Joi validators + `validate` middleware | `src/validators/*`, middleware | Confirmed from code |
| File handling | Multer memory storage + extraction services | auth/profile/digilocker/testArtifact controllers | Confirmed from code |
| Background jobs | notifications/public-intel/risk/integration schedulers in non-serverless runtime | `src/app.js` + scheduler services | Confirmed from code |
| Notification logic | legacy routes + modular notification package | route mounts and module folder | Confirmed from code |
| AI integration points | AskHawk, profile import, autofill, report/compliance pipelines, LLM service wrappers | controllers/services | Confirmed from code |
| Logging/error handling | Try/catch JSON error patterns + audit logs; mixed consistency | controllers + middleware | Strong inference from code |

### Backend route groups (major)
- Identity/profile: `authRoutes`, profile routes, vendor registration.
- Audit core: `buyerRoutes`, `auditorRoutes`, `auditRequestRoutes`, `auditPhaseRoutes`, `trackingRoutes`, `workflowMilestoneRoutes`.
- Evidence/docs: `digilockerRoutes`, `documentDisclosureRoutes`, evidence routes.
- Reporting/compliance: report + compliance routes.
- Intelligence/assistants: AskHawk, FDA/public intel/risk.
- Governance: tenant admin and platform routes.

## 7.3 Database / domain model map
- Full catalog: `docs/application-analysis/db_entity_catalog.csv`
- Model count (dev extraction): 120+ model files discovered.
- High-value transactional entities:
  - `audit-requests-master`
  - `auditQuestions`
  - `workflow_milestone_instances`
  - `digilocker_*`
  - `compliance_*`
  - `audit-reports`
  - `rfq` entities
  - `notifications` entities
  - `kb_*` and `hawk_*` entities
- Master/reference entities:
  - templates, categories, assessment types, API master, standards registry.

### Relationship highlights
- `audit-requests-master` links supplier, buyer, auditor, site, product, template, phase state.
- `auditQuestions` keyed by `auditRequestId` and template question references.
- Compliance runs tie back to audit + standard vectors.
- DigiLocker evidence maps to question IDs and audit checklists.

## 7.4 API catalog
- Full extracted API endpoint inventory: `docs/application-analysis/api_catalog.csv` (424 lines incl. header)
- Includes: HTTP method, full path (mounted), route file, mount source, confidence.

### API design notes
- Frontend primarily consumes proxied routes under `/api/next/*`, but legacy direct route proxies also exist.
- Role and tenant authorization are implemented at route level using middleware combinations.

## 7.5 Reusable control catalog (frontend)

| Reusable control | Where used | Business value | Confidence |
|---|---|---|---|
| `PageTitle` | Most pages | Uniform page heading/subheading | Confirmed from code |
| Sidebar + grouped sections | Global console layout | Role-aware navigation and module discoverability | Confirmed from code |
| `AuditQuestionnaire` renderer | Core questionnaire/report mode | Dynamic question schema rendering | Confirmed from code |
| `ButtonComponent` save/send footer | Questionnaire page | Consistent save/submit actions | Confirmed from code |
| `AskHawk` + `AskHawkDrawer` | Sidebar/footer | In-context assistant access | Confirmed from code |
| `RoleOnboardingCoach` | Sidebar/footer | Onboarding task guidance | Confirmed from code |
| Shared selectors (`SupplierSelector`, `SiteSelector`, etc.) | request/onboarding flows | Reduce duplicated selector logic | Confirmed from code |
| `SupplierOnboardingBanner` | Console layout | Incomplete onboarding visibility | Confirmed from code |
| Shared popups/alerts/toasts | Across modules | User feedback and confirmation consistency | Strong inference from code |
| Data table wrappers (Datatable module) | list pages | Sorting/filtering/pagination patterns | Strong inference from code |

## 7.6 Test and seed asset map

| Asset type | Evidence from code | Purpose | Confidence |
|---|---|---|---|
| Backend automated tests | `package.json -> npm test` chain includes AskHawk, report template, RFQ, scheduling, risk, digilocker, compliance, tracking tests | Baseline regression safety for core backend features | Confirmed from code |
| Backend seed scripts | `scripts/seed_*` and `scripts/backfill_*` commands in backend `package.json` | Demo/dev environment initialization and migration support | Confirmed from code |
| Frontend e2e scaffolding | `frontend/e2e`, Playwright config and scripts | Browser-level regression hooks | Confirmed from code |
| Dev helper routes | `devRoutes`, `e2eSeedRoutes` mounted in `src/app.js` | Non-production testing/seed shortcuts | Confirmed from code |

---

## SECTION 11 — UI/UX CONTROL AND INTERACTION CATALOG

### 11.1 Navigation and shell interactions
| Pattern | Where used | Behavior | Config/flags | Test focus |
|---|---|---|---|---|
| Role-based sidebar | Console layout | Filters menu by role + entitlement | `FF_NAV_GROUPED`, module access API | Persona/menu matrix correctness |
| Grouped section collapse | Sidebar | Persisted open/closed state in localStorage | `NEXT_PUBLIC_FF_NAV_GROUPED` | Persistence across reloads |
| AskHawk launcher | Sidebar footer + optional floating | Inline (menu bar) and floating modes | `FF_ASKHAWK_ENABLED`, `FF_ASKHAWK_FLOAT_SAFE` | Accessibility + non-obstruction |
| Onboarding banner | Console top | Warns supplier if profile incomplete | profile completion state | Overlay/layout clash |

### 11.2 Data interaction patterns
| Pattern | Evidence in code | Business value | Test cases |
|---|---|---|---|
| Search/filter in list modules | audit/rfq/insights/products/suppliers components | faster operational triage | filter persistence, server query correctness |
| Tabbed questionnaire categories | report/questionnaire page | segment large questionnaire set | tab switching state persistence |
| Stepper phase visualization | audit detail pages | explain workflow stage and ownership | stage labels, action enable/disable by phase |
| Table chips/status tags | tracking/report/questionnaire | quick risk/status signaling | color/label accuracy |
| Modals/popups (confirm/warn) | SweetAlert + shared popups | prevent accidental destructive actions | confirm/cancel/escape handling |

### 11.3 File/evidence interactions
| Pattern | Where | Behavior | Test focus |
|---|---|---|---|
| Multi-file upload | DigiLocker + test artifacts | Upload files and track versions | file limits, MIME, progress/error |
| Evidence attach per question | questionnaire popups | map files to specific questions | confirmation and persisted map |
| Bulk evidence preview | Test Artifacts | submit many files for RAG preview | payload size handling (413) |
| Redaction/share policy | DigiLocker cards | policy and auditability controls | policy propagation and access enforcement |

### 11.4 Feedback/empty/error/loading states
| Pattern | Where | Behavior in code | Risk |
|---|---|---|---|
| Loading skeletons/labels | Questionnaire and lists | loading booleans with skeleton fallback | spinner deadlock if request fails silently |
| Empty states | attachments/compliance/report lists | explicit "No data" messaging | false-empty due permission/query mismatch |
| Error alerts/modals | questionnaire actions and uploads | popup/alert with server message | HTML payload leak in UI if API returns non-JSON |
| Toast/notification feedback | global and module-level | asynchronous action confirmation | duplicates from dual notification stacks |

### 11.5 Autosave/draft/highlight patterns
- Draft/save model exists for questionnaire (`supplier_draft`, `auditor_draft`, etc.) `Confirmed from code`
- Autofill highlight metadata path (`autoFillMeta`) exists and is consumed in questionnaire UI `Confirmed from code`
- Render-level verification for enum controls is implemented in report/questionnaire page code; requires runtime validation end-to-end. `Confirmed from code` + `Needs functional validation in UI/runtime`

---

## Consolidated artifacts produced/updated in this part

1. `docs/application-analysis/master_feature_inventory.csv`
2. `docs/application-analysis/api_catalog.csv`
3. `docs/application-analysis/db_entity_catalog.csv`
4. `docs/application-analysis/frontend_api_route_inventory.csv`
5. `docs/application-analysis/page_component_inventory.csv`

