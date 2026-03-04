# Hawkeye Functional Spec (Role-by-Role)

## 1) Scope and source of truth
This spec is generated from live code paths in `dev`:
- Frontend menu and role filters:
  - `frontend/constant/app-config.ts`
  - `frontend/components/layout/Drawer/SidebarNav.tsx`
  - `frontend/locales/en.json`
- Frontend route surface:
  - `frontend/app/(console)/**/page.tsx`
  - `frontend/app/api/next/**/route.ts`
- Backend auth, tenant, and role enforcement:
  - `backend/src/middlewares/authMiddleware.js`
  - `backend/src/middlewares/roleMiddleware.js`
  - `backend/src/app.js`
- Core workflow APIs:
  - `backend/src/routes/auditorRoutes.js`
  - `backend/src/routes/digilockerRoutes.js`
  - `backend/src/routes/askHawkRoutes.js`
  - `backend/src/controllers/testArtifactController.js`
  - `backend/src/controllers/reportController.js`
  - `backend/src/controllers/auditorController.js`

## 2) Access and tenant model
- Every protected API request is JWT-authenticated (`authenticate` middleware).
- Tenant context is taken from JWT/user and attached as `req.tenantId`.
- Tenant health is enforced via `requireTenantActive`.
- AskHawk adds an additional tenant mismatch guard in `authorizeAskHawk`:
  - Explicit tenant in body/header/query cannot differ from authenticated tenant.
- Role permissions are enforced using `permit(...)`.
- Additional UI gates:
  - `WORK` menu is intentionally hidden in sidebar render.
  - `DIGILOCKER` appears only when tenant has vault entitlement.
  - Audit-heavy menus are hidden when tenant has audit module disabled.

## 3) Role manuals

### Buyer
Goal: create audits, select suppliers/products/sites, and track execution.

Main menus:
- Discovery: `Insights`, `Supplier Risk`, `Supplier Marketplace`, `Product Catalog`, `Auditor Network`, `FDA Dashboard`
- Procurement: `Request New Audit`, `Audit RFQs`
- Operations: `Workspace`, `Audit Summary`
- Assets: `DigiLocker`, `API Library`, `Integration`
- Admin: `Notification Preferences`, `Settings`

Critical click workflows:
1. Create audit request (shortcut flow)
- UI: `Procurement -> Request New Audit` (`/request-audit`)
- Steps:
1. Select supplier, site, product.
2. Select ETA/compliance date.
3. Select Intimation and PAQ templates.
4. Click submit.
- API sequence:
1. `GET /api/next/templates?templateType=INTIMATION_LETTER`
2. `GET /api/next/templates?templateType=PRE_AUDIT_Q`
3. `POST /api/buyer/audit-request`

2. Create audit request (marketplace flow)
- UI: `Discovery -> Supplier Marketplace` (`/supplier-marketplace`)
- Steps:
1. Search supplier.
2. Click `Invite to Hawkeye` for public supplier.
3. Open supplier card/action and continue request creation.
- API sequence:
1. `GET /api/buyer/marketplace/suppliers`
2. `POST /api/buyer/marketplace/invite`

3. Track active requests
- UI: `Operations -> Audit Summary` (`/audits`)
- Steps:
1. Open audit row.
2. Navigate milestones, tracking, artifact tabs, and audit log.
- API sequence (typical):
1. `GET /api/audit-requests/requestSingleAudit`
2. `GET /api/audits/:auditId/tracking`
3. `GET /api/audits/:auditId/audit-trail`

### Supplier
Goal: complete profile, upload evidence, answer questionnaires.

Main menus:
- Discovery: `Insights`, `My Risk`, `Product Catalog`, `FDA Dashboard`
- Operations: `Workspace`, `Audit Summary`, `Calendar`
- Assets: `DigiLocker`, `Sites`, `API Library`, `Mass Upload`, `Integration`
- Admin: `Users` (supplier admin), `Notification Preferences`, `Settings`

Critical click workflows:
1. Signup/profile prefill from document
- UI: `/auth/signup` -> `Import from document`
- Steps:
1. Upload one or more files (PDF/DOC/DOCX/XLSX/TXT/image as configured).
2. Auto-map extracted fields into signup form.
3. User edits and submits.
- API:
1. `POST /api/auth/register-prefill-agentic`

2. Existing profile auto-fill from uploads + DigiLocker
- UI: profile import flows in onboarding/profile screens
- Steps:
1. Upload files and/or select DigiLocker documents.
2. Trigger auto-fill.
3. Review extracted fields and save.
- API:
1. `POST /api/profile/auto-fill`

3. Evidence upload and reuse
- UI: `Assets -> DigiLocker` (`/digilocker`)
- Steps:
1. Click `Upload Evidence`.
2. View document detail.
3. Apply/suggest tags.
4. Attach evidence to questions when prompted.
- API sequence:
1. `POST /api/digilocker/upload`
2. `GET /api/digilocker/documents`
3. `POST /api/digilocker/documents/:id/tags/suggest`
4. `POST /api/digilocker/questions/:questionId/attach`

### Supplier User
Goal: execute assigned questionnaire/evidence tasks for supplier organization.

Main menus:
- Discovery: `Insights`, `My Risk`, `Product Catalog`, `FDA Dashboard`
- Operations: `Workspace`, `Audit Summary`, `Calendar`
- Assets: `DigiLocker`, `API Library`
- Admin: `Notification Preferences`, `Settings`

Critical click workflows:
1. Upload assigned evidence in DigiLocker.
2. Respond to assigned questionnaires from workspace/audit artifacts.
3. Add attachments during response (file/photo/audio where enabled).

### Auditor
Goal: review supplier evidence, run compliance checks, generate report and CAPAs.

Main menus:
- Discovery: `Insights`, `FDA Dashboard`
- Procurement: `Audit RFQs`
- Operations: `Workspace`, `Audit Summary`, `Calendar`, `Template Management`, `Test Artifacts`
- Assets: `DigiLocker`, `API Library`, `Integration`
- Admin: `Notification Preferences`, `Settings`

Critical click workflows:
1. Test Artifacts execution RAG run
- UI: `Operations -> Test Artifacts` (`/test-artifacts`)
- Steps:
1. Select artifact `Execution Questionnaire`.
2. Select template + buyer + supplier + site + product.
3. Click `Select Evidence` and upload multiple files.
4. Click `Run Test Preview`.
- API sequence:
1. `GET /api/auditor/test-artifacts/options`
2. `POST /api/upload-file` (per selected file)
3. `POST /api/auditor/test-artifacts/execution-rag-preview`
- Output includes:
1. Question-level autofill
2. Compliance summary and references (ICH Q7/CFR mapping)
3. WHO-GMP style report preview payload

2. View/download supplier attachments by supplier user
- UI: audit detail/attachments areas
- API:
1. `GET /api/auditor/audits/:auditId/supplier-attachments`
- Response is grouped by supplier user with per-file URL and metadata.

3. Compliance suggestion before final report
- UI: audit detail compliance actions
- API:
1. `POST /api/auditor/audits/:auditId/compliance-suggestion`

4. Final report generation from questionnaire + follow-up + auditor inputs
- API:
1. `POST /api/auditor/audits/:auditId/report/draft`
- Included evidence for narrative/observations:
1. `responseDetails.auditorVerification.comments`
2. `messages` (follow-ups)
3. `internalNotes`
4. `textResponse`
5. `auditorAttachments` (`audio`, `photo`, `file`)
6. linked supplier `docUrls`

5. Generate CAPAs from report observations
- API:
1. `POST /api/auditor/audits/:auditId/report/capas/generate`
- CAPA candidates come from follow-up signals and observation severity/classification.

6. CFR Part 11 style traceability view
- UI: `Audit Log` tab (`/audits/:id/audit-log`)
- API:
1. `GET /api/audits/:auditId/audit-trail`

### Admin / Tenant Admin
Goal: configure tenant standards/vectors, users, workflow controls, and quality telemetry.

Main menus:
- Discovery: `Insights`, `Supplier Risk`, `Supplier Marketplace`, `Product Catalog`, `Auditor Network`, `FDA Dashboard`
- Procurement: `Request New Audit`, `Audit RFQs` (admin role), tenant admin RFQ route support
- Operations: `Audit Summary`, `Template Management`
- Assets: `DigiLocker`, `Sites` (admin), `API Library`, `Mass Upload` (admin), `Integration`
- Admin: `Notification Preferences`, `RAG Vector Setup` (admin/superadmin), `Settings`

Critical click workflows:
1. Configure compliance guideline vectors (one-time standard index, then refresh)
- UI: `Admin -> RAG Vector Setup` (`/admin/rag-vectors`)
- Steps:
1. Select compliance standard/version.
2. Upload guideline files.
3. Add instruction context and tags.
4. Upload/index or reindex.
- API sequence:
1. `GET /api/compliance/standards`
2. `GET /api/compliance/standards/:key/:version/guidelines/status`
3. `POST /api/compliance/standards/:key/:version/guidelines/upload`
4. `POST /api/compliance/standards/:key/:version/guidelines/reindex`

2. AskHawk quality governance
- UI: `/admin/askhawk`
- API sequence:
1. `GET /api/askhawk/telemetry`
2. `GET /api/askhawk/kb/stats`
3. `POST /api/askhawk/kb/sync`
4. `POST /api/askhawk/evals/run`
5. `GET /api/askhawk/evals`

### Superadmin (Platform admin scope)
Goal: platform-wide governance across tenants.

Main menus:
- Standard menu items per role gating plus forced `Audit Summary`.
- Platform surfaces:
1. `/platform/tenants`
2. `/platform/audit-logs`
3. `/platform/notifications-debug`

Critical click workflows:
1. Review tenant posture and users.
2. Review platform audit logs and governance events.
3. Trigger AskHawk KB sync/evals where access is enabled.

## 4) Current known menu behavior (intentional)
- Sidebar does not render `WORK` item.
- `DIGILOCKER` route resolves to:
  - `/qms/vault` if full vault entitlement is active.
  - `/digilocker` otherwise.
- Superadmin/platform admin is force-granted `Audit Summary` menu if filtered out by module flags.
