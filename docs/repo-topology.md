# Repo Topology

## Scope
- Analysis target: `dev` backend worktree only
- Backend worktree: `C:/Users/debab/Code - Hawkeye/hawkeye-clean/_wt_backend_dev_artifacts_20260223`
- Frontend worktree: `C:/Users/debab/Code - Hawkeye/hawkeye-clean/_wt_frontend_dev_artifacts_20260223`
- Mode used for this deliverable: discovery, documentation, design, and planning only
- No application code, schema, branch, or dependency changes were made as part of this pass

## Workspace Shape
This is not a package-manager monorepo. It is a sibling-repository workspace under one parent folder.

| Path | Role | Stack | Notes |
|---|---|---|---|
| `backend/` | original backend working copy | Node.js + Express + Mongoose | current shell cwd in this session, but not the analysis target |
| `frontend/` | original frontend working copy | Next.js + React + MUI | not the analysis target |
| `_wt_backend_dev_artifacts_20260223/` | backend `dev` worktree | Node.js + Express + Mongoose | analysis target for this document set |
| `_wt_frontend_dev_artifacts_20260223/` | frontend `dev` worktree | Next.js + React + MUI | companion UI worktree |
| `Website/` | public/marketing site | separate web property | outside current scope |

## Backend Topology
- Runtime: Express application exported from `src/app.js` and bootstrapped by `src/server.js`
- Database access: Mongoose models under `src/models/` and some module-local models under `src/modules/**/models/`
- API style: route files under `src/routes/`, controllers under `src/controllers/`, business logic in `src/services/`
- Initialization: runtime initialization in `src/app.js` connects DB and starts schedulers
- WebSocket support: `src/server.js` initializes Socket.IO and the notification socket layer

## Frontend Topology
- Framework: Next.js App Router
- Main UI shell: `app/(console)/`
- API proxy pattern: `app/api/next/**` proxies browser traffic into backend `/api/**`
- Shared UI: `components/`
- API clients: `lib/*Api.ts`
- Validation schemas: `schemas/`

## Database Technology
- ODM: Mongoose
- Database type: MongoDB document model
- Registered Mongoose models discovered in the backend `dev` worktree: **185**

## Primary Audit/GMP Workflow Code Paths
| Concern | Files |
|---|---|
| Audit request creation | `src/routes/buyerRoutes.js`, `src/controllers/buyerController.js` |
| Audit request query/list/detail | `src/routes/auditRequestRoutes.js`, `src/controllers/auditRequestController.js` |
| Questionnaire generation and response | `src/routes/auditorRoutes.js`, `src/controllers/auditorController.js` |
| Pre-audit planning | `src/routes/preAuditRoutes.js`, `src/controllers/preAuditController.js` |
| Audit phases/artifacts | `src/routes/auditPhaseRoutes.js`, `src/controllers/auditPhaseController.js` |
| Evidence + DocVault | `src/routes/evidenceRoutes.js`, `src/routes/digilockerRoutes.js`, `src/controllers/digilockerController.js` |
| Compliance engine | `src/routes/complianceRunRoutes.js`, `src/controllers/complianceRunController.js`, `src/services/compliance/*` |
| Reporting | `src/controllers/reportController.js`, `src/models/auditReportModel.js` |
| CAPA | `src/routes/capaRoutes.js`, `src/controllers/capaController.js`, `src/routes/capaV2Routes.js`, `src/modules/capaV2/*` |
| Notifications | `src/modules/notifications/*`, `src/models/notification*.js` |
| Status/milestone tracking | `src/services/workflowMilestoneService.js`, `src/services/assessmentTrackingService.js`, `src/services/auditPhaseService.js` |

## Architectural Observation
The current platform is best described as an Express/Mongoose MVP with multiple generations of workflow logic coexisting: a legacy audit-request workflow, additive milestone/status layers, a partial assessment V2 domain, and newer org/engagement/qualification/catalog domains.
