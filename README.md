# Multitenant Admin (Platform & Tenant) - Backend Notes

This backend provides tenant isolation, audit logging, platform/tenant admin APIs, and now PSCI SAQ evidence coverage utilities.

## Environment & offline testing
- Env loader supports `.env.<env>` based on `APP_ENV` or `NODE_ENV` (falls back to `.env`).
- Override with `ENV_FILE=path/to/.env`.
- For offline local testing, point `MONGO_URI` to a local MongoDB instance (example: `mongodb://127.0.0.1:27017/hawkeye_dev`).
- Use a separate test DB (example: `hawkeye_test`) to avoid automation resets wiping dev data.

## Models (admin/tenant)
- `Tenant`: name, displayName, type (SUPPLIER|BUYER|AUDITOR|INTERNAL), status, branding, security.
- `User`: includes `tenant_id`, `status` (ACTIVE|DISABLED), `permissions`, `lastLoginAt`. Unique index on `{ email, tenant_id }`.
- Profiles (`supplier-profiles`, `buyer-profiles`, `auditor-profiles`): include `tenant_id`.
- `AdminAuditLog`: admin actions with optional tenant scope.

## Migration
`node scripts/migrate_add_tenants.js`
- Connects to `MONGO_URI`.
- Groups existing users by role + companyName (or email domain), creates tenants, updates users and profiles with `tenant_id`.
- Prints summary counts.

## Auth
- Login JWT includes `tenantId`; `lastLoginAt` is updated.
- `authenticate` middleware sets `req.tenantId` and blocks DISABLED users.
- `src/middlewares/tenantMiddleware.js` adds helpers:
  - `resolveTenant`, `requireRole`, `requireSuperAdmin`, `requireTenantAdmin`
  - `writeAdminAuditLog()` helper (redacts sensitive fields)

## Routes
Mounted in `src/app.js`:
- Platform (superadmin only): `/api/platform`
  - `GET /tenants`, `POST /tenants`, `GET /tenants/:tenantId`, `PATCH /tenants/:tenantId`
  - `GET /users` (global search)
  - `GET /audit-logs` (global)
- Tenant Admin (tenant_admin or superadmin): `/api/admin`
  - `GET/PATCH /company`
  - `GET /users`, `POST /users/invite`, `PATCH /users/:userId`, `POST /users/:userId/disable|enable`
  - `GET /audit-logs` (tenant-scoped)

## Audit RFQ module
### How to use RFQ module
- Buyer users create RFQs via `POST /api/rfqs`, then update draft details and `POST /api/rfqs/:id/publish`.
- Invite auditor orgs with `POST /api/rfqs/:id/invite`, then monitor quotes via `GET /api/rfqs/:id/quotes`.
- Award a quote with `POST /api/rfqs/:id/award` to generate an `AuditRequest` linked by `rfqId` and `awardedQuoteId`.
- Auditors access their inbox at `GET /api/rfqs?myInvites=true`, submit quotes via `POST /api/rfqs/:id/quotes`, and use Q&A threads (`/api/rfqs/:id/thread`).

### Manual test steps
1) Buyer: create RFQ draft, fill supplier/site/product, scope, and dates, then publish.
2) Buyer: invite an auditor org and confirm notification delivery.
3) Auditor: open RFQ inbox, post a Q&A message, and submit a quote.
4) Buyer: compare quotes, award one, and verify the created audit request shows `rfqId` and `awardedQuoteId`.
5) Auditor: confirm award notification and that quote status becomes ACCEPTED/REJECTED.

## API Master + Supplier Products
### How to run migration
- Set `MONGO_URI` and run `node scripts/migrateToApiMaster.js`.
- The script upserts `api-master` entries, backfills `apiMasterId` on supplier products and site mappings, and creates indexes.
- It also attempts to drop the legacy unique index on `casNumber` so the same CAS can exist across different supplier plants.

### New flow overview
- Search canonical APIs: `GET /api/api-master/search?q=metform&cas=50-00-0`.
- Create supplier products via `POST /api/supplier-products` using `chooseMode=select_master` (requires `apiMasterId`) or `chooseMode=create_new` (creates/links ApiMaster).
- Mappings now store `apiMasterId`, `manufacturingRole`, and `visibility`.

### Manual test steps
1) Run migration and verify existing products now have `apiMasterId`.
2) In UI, add a product by selecting an API Master entry and choose sites + role/visibility.
3) Add another product with “Create new API” and confirm it creates a new ApiMaster entry.
4) Verify listings show “API Master” name and mappings include the right site/role.

### API Master sync (FDA DMF)
- Env:
  - `FDA_DMF_SOURCE_URL` (xlsx download URL for FDA DMF Type II data)
  - `API_MASTER_REFRESH_COOLDOWN_HOURS` (optional, default 24)
- Admin refresh: `POST /api/api-master/refresh` with body `{ "sources": ["FDA_DMF"], "force": true }`
- Status: `GET /api/api-master/status`
- Alphabet list: `GET /api/api-master/list?letter=A&limit=200&skip=0`
- Letter counts: `GET /api/api-master/letters`

## Document Disclosure
### How to use locally
- Upload a file via `POST /api/upload-file` (used by the UI), then create a document record using `POST /api/documents`.
- Review redaction drafts at `POST /api/documents/:id/redaction/draft`, generate a view via `POST /api/documents/:id/redaction/generate?viewType=AUDITOR`.
- Configure share windows with `POST /api/documentViews/:id/sharePolicies` and inspect access logs at `GET /api/documentViews/:id/auditLog`.

### Manual test steps
1) Supplier onboarding: open Documents tab and upload a file.
2) Open Redaction Studio, save a draft, accept redaction to generate a view.
3) Configure a share policy with a window and recipient email.
4) Verify document status transitions DRAFT → REDACTION_ACCEPTED → SHARED.
5) In audit questionnaire, upload evidence for a question and confirm the document card appears.

### Demo script (supplier flow)
1) Upload onboarding evidence → document enters DRAFT.
2) Open “View redaction” → add a redaction box → Accept → view version created.
3) Set share policy window + recipients → status becomes SHARED.
4) Open audit questionnaire → upload evidence → DocumentCard shows pending redaction.

## Tenant isolation checklist
- Run migration script, verify tenants created and users/profiles have `tenant_id`.
- Login response includes `tenantId`.
- `/api/platform/tenants` accessible only by superadmin.
- `/api/admin/users` returns only current tenant's users.
- Attempting to access another tenant's user by ID returns 404/403.
- Audit logs written for tenant/company/user updates (visible via `/api/platform/audit-logs` or `/api/admin/audit-logs`).

## Document coverage (PSCI SAQ → evidence)
Dev endpoints:
- `POST /api/evidence/ingest` (multipart field `file`) – extracts PDF text per page into `evidence_uploads` + `evidence_pages`.
- `POST /api/saq/coverage` – body `{ templateDocxPath, topN? }`; returns per-question confidence + provenance.

Run a local demo (uses sample PDF if none provided):
```
npm run coverage:demo
```
Env helpers (optional): `PSCI_TEMPLATE_PATH`, `DEMO_PDF_PATH`, `DEMO_TENANT_ID`, `DEMO_USER_ID`.

Curl examples (auth token required):
```
curl -H "Authorization: Bearer <token>" -F "file=@./uploads/demo.pdf" http://localhost:8101/api/evidence/ingest
curl -H "Authorization: Bearer <token>" -H "Content-Type: application/json" ^
  -d "{\"templateDocxPath\":\"uploads/1765409212052-Full_PSCI_SAQ_&_Audit_Report_Template_for_Core_Suppliers,_External_Manufacturers,_Component_and_Material_Suppliers_(WORD_VERSION)_(1).docx\",\"topN\":3}" ^
  http://localhost:8101/api/saq/coverage
```
Artifacts are written to `./out/question_coverage.json` and `.csv`.

## Public API Intelligence Marketplace (public data only)
- Collections: `public_suppliers`, `public_sites`, `public_apis`, `public_inspections`, `public_actions`, `public_sources`, `public_claim_requests`, `public_unmatched`.
- Connectors implemented: FDA inspections (CSV), FDA recalls (openFDA). More can be added under `src/services/publicIntel/connectors/`.
- CLI: `npm run public-intel:sync` (runs all) or `node scripts/publicIntelSync.js --source=fdaInspections`.
- Scheduler: enable with `PUBLIC_INTEL_SCHEDULER_ENABLED=true` (cron via `PUBLIC_INTEL_SYNC_CRON`, default daily 2am).
- API routes (public read):
  - `GET /api/public-intel/suppliers?query=&country=&signals=`
  - `GET /api/public-intel/suppliers/:id`
  - `GET /api/public-intel/apis?query=`
  - `GET /api/public-intel/apis/:id`
  - `GET /api/public-intel/inspections?supplierId=&siteId=`
  - `GET /api/public-intel/actions?supplierId=&type=`
  - `POST /api/public-intel/claim-requests` (payload: supplier_id, request_type=claim|dispute, requester_email, message)
- Admin routes (auth + admin scope):
  - `POST /api/admin/public-intel/run` (optional `{source:"fdaInspections"}`)
  - `POST /api/admin/public-intel/upload` (multipart `file` for manual dataset load)
- Env:
  - `PUBLIC_INTEL_ENABLED=true`
  - `PUBLIC_INTEL_SCHEDULER_ENABLED=true|false`
  - `PUBLIC_INTEL_SYNC_CRON="0 2 * * *"`
  - `PUBLIC_INTEL_FDA_INSPECTIONS_URL` (optional override for CSV)
