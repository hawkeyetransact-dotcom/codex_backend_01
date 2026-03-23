# Backend Structure Map

## Scope
This map documents the backend structure in the `dev` worktree. It is implementation-facing but stops short of proposing code changes.

## Top-Level Backend Layout
| Path | Purpose | Notes |
|---|---|---|
| `src/app.js` | Express composition root | mounts all HTTP routes and runtime init hooks |
| `src/server.js` | server bootstrap | starts HTTP server and Socket.IO |
| `src/models/` | core Mongoose schemas | legacy + additive platform models |
| `src/controllers/` | HTTP orchestration layer | most business entrypoints |
| `src/controllers/v2/` | emerging assessment V2 controllers | partial newer workflow engine |
| `src/routes/` | route declarations | main API surface |
| `src/routes/v2/` | V2 assessment routes | parallel to legacy audit flows |
| `src/services/` | cross-controller business logic | workflow, compliance, tracking, integrations |
| `src/modules/` | module-local bounded contexts | notifications, auditEngine, capaV2, compliance |
| `src/middlewares/` | auth, tenant, validation, flags | central runtime guardrails |
| `src/constants/` | shared enums/constants | audit phases, assessment tracking, etc. |
| `src/jobs/` | scheduled jobs | risk and monitoring schedulers |
| `src/integrations/` | external integration layer | provider connections and scheduler hooks |
| `src/validators/` | Joi validators | request shape validation |

## Request Processing Pattern
1. `src/app.js` mounts middleware and route namespaces.
2. Route files apply authentication, tenant resolution, role checks, and validation.
3. Controllers orchestrate reads/writes across multiple Mongoose models.
4. Services encapsulate reusable logic for milestones, compliance, AI assist, scheduling, or notifications.
5. Models persist document state directly in MongoDB.
6. Side effects are emitted through notification orchestrators, audit trail/event services, and schedulers.

## Core Functional Domains
### Identity, tenancy, and access
- Models: `tenantModel.js`, `userModel.js`, role-specific profile models
- Middleware: `authMiddleware.js`, tenant resolution and role middleware
- Additive ACL/share layer: access grants, share policies, document views, consent records

### Legacy GMP audit request workflow
- Routes: `buyerRoutes.js`, `auditRequestRoutes.js`, `auditorRoutes.js`, `auditPhaseRoutes.js`, `preAuditRoutes.js`
- Controllers: `buyerController.js`, `auditRequestController.js`, `auditorController.js`, `auditPhaseController.js`, `preAuditController.js`, `reportController.js`, `capaController.js`
- Models: `auditRequestsMasterModel.js`, `auditQuestionsModels.js`, `auditArtifactModel.js`, `auditArtifactVersionModel.js`, `auditPlanModel.js`, `auditAgendaModel.js`, `auditReportModel.js`, `capaModel.js`

### Evidence and document handling
Two parallel patterns exist:
- audit-specific evidence: `evidenceModel.js`
- document-vault style evidence: `digilockerDocumentModel.js`, versioning, evidence maps, checklists

### Compliance engine
- Routes: `complianceRunRoutes.js`, `complianceStandardsRoutes.js`
- Services: `services/compliance/*`
- Models: runs, snapshots, question results, standards, controls

### Workflow tracking and status layers
Three overlapping mechanisms exist:
- embedded `phaseState` on `audit-requests-master`
- generic-ish status tracker/history/definitions
- workflow milestone definition/instance system

### Emerging assessment V2 engine
- Routes: `src/routes/v2/*`
- Models: `assessments`, `assessment-findings`, `assessment-capas`, `assessment-evidence`, `questionnaire-artifacts`
- Important observation: V2 is parallel to the legacy GMP flow, not a replacement yet

### Notifications and audit logging
- Notifications: root-level models plus module-local notification models
- Audit/event logging: `audit-trails`, `audit-events`, admin audit logs, document access events

### Additive enterprise/master-data domains
- org directory
- engagements and qualification
- marketplace/product catalog V2

## Coupling Hotspots
- `src/controllers/buyerController.js`
- `src/controllers/auditorController.js`
- `src/controllers/reportController.js`
- `src/controllers/auditPhaseController.js`
- `src/services/assessmentTrackingService.js`
- `src/services/workflowMilestoneService.js`
- `src/models/auditRequestsMasterModel.js`
- `src/models/auditQuestionsModels.js`

## Structural Conclusion
The backend already has enough domain depth to support an additive kernel approach later, but the live flow is still concentrated in a legacy audit-request model with multiple overlay systems for tracking, compliance, reporting, and evidence.
