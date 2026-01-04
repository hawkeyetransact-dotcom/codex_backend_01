# Multitenant Admin (Platform & Tenant) - Backend Notes

This backend provides tenant isolation, audit logging, platform/tenant admin APIs, and now PSCI SAQ evidence coverage utilities.

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
