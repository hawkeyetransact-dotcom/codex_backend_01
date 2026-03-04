# Menu Click Action Index (Role, Route, API)

## Notes
- Source: `frontend/constant/app-config.ts`, `frontend/components/layout/Drawer/SidebarNav.tsx`, route/page + API proxy files.
- Menu titles are shown in English labels from `frontend/locales/en.json`.
- `WORK` menu is configured but filtered out at runtime in sidebar render.

## Global menu gates
| Gate | Behavior |
| --- | --- |
| `hasVaultAccess` | Hides `DigiLocker` menu when vault entitlement is disabled. |
| `hasAuditAccess` | Hides audit-heavy menus (`Request New Audit`, `Audit RFQs`, `Audit Summary`, `Auditor Network`, `Template Management`, `Test Artifacts`, `RAG Vector Setup`) when audit module is disabled. |
| Supplier sub-user | Hides `Users` menu when role is supplier sub-user/invited supplier account. |

## Menu to action map
| Menu | Route | Roles | Primary page/component | Primary user action(s) | Primary API(s) |
| --- | --- | --- | --- | --- | --- |
| Insights | `/insights` | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/insights/page.tsx` | View KPI/work queue widgets | `GET /api/*/dashboard/summary`, `POST /api/dashboard/drilldown` |
| Supplier Risk | `/buyer/suppliers` | buyer, tenant_admin, admin, superadmin | `app/(console)/buyer/suppliers/page.tsx` | View supplier risk detail | `GET /api/buyer/suppliers`, risk APIs under `/api/buyer/risk/*` |
| My Risk | `/supplier/risk` | supplier, supplierUser | `app/(console)/supplier/risk/page.tsx` | View own risk posture | `/api/supplier/risk/*` |
| Supplier Marketplace | `/supplier-marketplace` | buyer, admin | `app/(console)/supplier-marketplace/page.tsx` | Search suppliers, invite suppliers, open supplier card | `GET /api/buyer/marketplace/suppliers`, `POST /api/buyer/marketplace/invite` |
| Product Catalog | `/products` | buyer, supplier, supplierUser, admin | `app/(console)/products/page.tsx` | View/add/edit products | `/api/supplier-products/*`, `/api/api-master/*`, `/api/product-site-mappings/upsert` |
| Auditor Network | `/auditor-network` | buyer, admin | `app/(console)/auditor-network/page.tsx` | Invite/search/revoke auditor affiliation | `/api/auditors/*` |
| FDA Dashboard | `/fda-dashboard` | buyer, supplier, supplierUser, auditor, admin, superadmin | `app/(console)/fda-dashboard/page.tsx` | View FDA snapshots and filters | `/api/fda/dashboard`, `/api/fda/*` |
| Request New Audit | `/request-audit` | buyer, admin | `app/(console)/request-audit/page.tsx` -> `components/audits/newRequest.tsx` | Create audit request | `GET /api/templates?templateType=*`, `POST /api/buyer/audit-request` |
| Audit RFQs | `/rfqs` or `/auditor/rfqs` | buyer, auditor, tenant_admin, admin, superadmin | `app/(console)/rfqs/*`, `app/(console)/auditor/rfqs/*` | Create/publish/invite/quote/award RFQ | `/api/rfqs/*` |
| Workspace | `/workspace` | buyer, supplier, supplierUser, auditor, admin | `app/(console)/workspace/page.tsx` | Work notifications/tasks | `/api/notifications/*`, `/api/v1/user/*` |
| Audit Summary | `/audits` | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/audits/page.tsx` and nested audit routes | Open audit details, phases, artifacts, reports | `/api/audit-requests/*`, `/api/audits/*`, `/api/workflow-milestones/*` |
| Calendar | `/calendar` | supplier, supplierUser, auditor | `app/(console)/calendar/page.tsx` | Add/remove availability blocks | `/api/calendar/me`, `/api/calendar/me/availability/*` |
| Template Management | `/template-management` | auditor, admin | `app/(console)/template-management/*` | Create/update/publish templates | `/api/templates/*`, `/api/template-questions/*` |
| Test Artifacts | `/test-artifacts` | auditor | `app/(console)/test-artifacts/page.tsx` -> `components/audits/TestArtifactsWorkbench.tsx` | Upload evidence in bulk, run preview, inspect autofill/compliance/report | `GET /api/auditor/test-artifacts/options`, `POST /api/auditor/test-artifacts/execution-rag-preview`, `POST /api/auditor/test-artifacts/prefill`, `POST /api/auditor/test-artifacts/report-preview` |
| DigiLocker | `/digilocker` (or `/qms/vault`) | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/digilocker/page.tsx` -> `components/digilocker/DigiLockerLibrary.tsx` | Upload evidence, view/download docs, suggest/apply tags, map evidence | `/api/digilocker/upload`, `/api/digilocker/documents*`, `/api/digilocker/questions/:id/*` |
| Sites | `/sites` | supplier, admin | `app/(console)/sites/*` | Add/edit sites, site-product mapping | `/api/supplier-sites/*` |
| API Library | `/library/apis` | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/library/apis/page.tsx` | Search APIs, refresh master (admin), map API to site | `/api/api-master/search`, `/api/api-master/list`, `/api/api-master/refresh`, `/api/product-site-mappings/upsert` |
| Mass Upload | `/mass-upload` | supplier, admin | `app/(console)/mass-upload/page.tsx` | Bulk upload master files | Feature-specific endpoints per uploader |
| Integration | `/integrations` | buyer, supplier, auditor, tenant_admin, admin, superadmin | `app/(console)/integrations/*` | Configure integration, run sync, mapping | `/api/integrations/*` |
| Users | `/users` | supplier (not supplier sub-user) | `app/(console)/users/*` | Invite/edit supplier users | `/api/profile/supplier/users`, `/api/profile/supplier-user/*` |
| Notification Preferences | `/workspace/notification-preferences` | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/workspace/notification-preferences/page.tsx` | Configure notification channels/rules | `/api/notification-preferences`, `/api/v1/user/*` |
| RAG Vector Setup | `/admin/rag-vectors` | admin, superadmin | `app/(console)/admin/rag-vectors/page.tsx` | Upload standards/guidelines, reindex vectors | `/api/compliance/standards/*/guidelines/upload`, `/guidelines/status`, `/guidelines/reindex` |
| Settings | `/settings` | buyer, supplier, supplierUser, auditor, tenant_admin, admin, superadmin | `app/(console)/settings/page.tsx` | Update profile/security/preferences | `/api/profile/*`, role-specific profile APIs |

## Audit detail tab actions (high-value)
| Tab/Action | Route | Role | Action | API(s) |
| --- | --- | --- | --- | --- |
| Questionnaire updates | `/audits/:id/questionnaire` | supplier, supplierUser, auditor | Save answers/comments/follow-up payloads | `PUT /api/auditor/audit-question/update-data/:auditRequestId` |
| Attachments by supplier user | audit detail actions | auditor/admin/superadmin/tenant_admin | View/download grouped supplier uploads | `GET /api/auditor/audits/:auditId/supplier-attachments` |
| First compliance check | audit detail actions | auditor/admin/superadmin/tenant_admin | Generate suggestions from questionnaire | `POST /api/auditor/audits/:auditId/compliance-suggestion` |
| Draft report generation | `/audits/:id/generate-report` | auditor | Generate observations from responses + follow-up + attachments | `POST /api/auditor/audits/:auditId/report/draft` |
| CAPA generation | report actions | auditor/admin/superadmin/tenant_admin | Generate CAPAs from report observations | `POST /api/auditor/audits/:auditId/report/capas/generate` |
| Audit log | `/audits/:id/audit-log` | all participant roles | Review traceability entries | `GET /api/audits/:auditId/audit-trail` |
