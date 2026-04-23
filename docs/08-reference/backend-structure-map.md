---
doc: backend-structure-map
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: reference
status: current
---

# Backend Structure Map

> Generated: 2026-03-23 | Read-only analysis

## Controllers (`src/controllers/`)

### Core Audit Controllers

| Controller | Key Methods | Routes |
|------------|-------------|--------|
| `auditRequestController.js` | getAuditRequestsByBuyer, getAuditRequestsByAuditor, getAuditRequestsBySupplier, assignAuditors | `auditRequestRoutes.js` |
| `auditPhaseController.js` | startPrepPhase, completePrepPhase, transitionAuditPhase, createAuditArtifact, submitAuditArtifact | `auditPhaseRoutes.js` |
| `auditTrailController.js` | getAuditTrail, createTrailEntry | `auditTrailRoutes.js` |
| `auditEventController.js` | listEvents, createEvent | `auditEventRoutes.js` |
| `auditNoteController.js` | createNote, listNotes, getAttachment | `auditNoteRoutes.js` |
| `auditRagController.js` | queryAuditKnowledge, ingestAuditEvidence | `(inline in routes)` |
| `preAuditController.js` | getPreAuditData, submitPreAudit | `preAuditRoutes.js` |
| `remoteAuditController.js` | setupRemoteAudit, joinAuditSession | `remoteAuditRoutes.js` |
| `capaController.js` | listCapas, getCapa, createCapa, updateCapaStatus, addCapaAction | `capaRoutes.js` |
| `evidenceController.js` | uploadEvidence, listEvidence, updateEvidenceLinks | `evidenceRoutes.js` |
| `reportController.js` | getReport, downloadReport | `reportTemplateRoutes.js` |
| `reportTemplateController.js` | listTemplates, createTemplate | — |
| `reportInstanceController.js` | createInstance, finalizeReport | `reportInstanceRoutes.js` |

### V2 Assessment Controllers (`src/controllers/v2/`)

| Controller | Key Methods | Routes |
|------------|-------------|--------|
| `assessmentController.js` | createAssessment, getAssessment, listAssessments, updateAssessment | `v2/assessments.js` |
| `assessmentCapaController.js` | listAssessmentCapas, createAssessmentCapa, updateStatus | `v2/capas.js` |
| `assessmentEvidenceController.js` | uploadEvidence, listEvidence | `v2/evidence.js` |
| `findingController.js` | createFinding, listFindings, updateFinding | `v2/findings.js` |
| `questionnaireController.js` | listQuestionnaires, submitQuestionnaire | `v2/questionnaires.js` |
| `moduleAdminController.js` | listModules, configureModule | `v2/admin.js` |

### Participant Controllers

| Controller | Purpose |
|------------|---------|
| `authController.js` | JWT auth, register, login, password reset, email verification |
| `supplierProfileController.js` | Supplier company profile CRUD |
| `supplierSiteController.js` | Manufacturing/warehouse site management |
| `supplierProductController.js` | Products manufactured by suppliers |
| `supplierUserProfileController.js` | Supplier user account management |
| `buyerController.js` | Buyer company profiles |
| `buyerMarketplaceController.js` | Buyer marketplace features |
| `auditorController.js` | Auditor profile and availability |
| `auditorNetworkController.js` | Auditor network and affiliates |
| `auditorAvailabilityController.js` | Auditor scheduling availability |

### Questionnaire Controllers

| Controller | Purpose |
|------------|---------|
| `questionaireController.js` | Legacy questionnaire management (V1) |
| `questionnaireUploadController.js` | Questionnaire file upload + extraction |
| `questionnaireAssignmentController.js` | Assign questionnaires to suppliers |
| `autoFillController.js` | AI-driven questionnaire auto-fill |
| `aiPrefillController.js` | Gemini AI pre-fill of form fields |

### Workflow & Scheduling Controllers

| Controller | Purpose |
|------------|---------|
| `workflowDefinitionController.js` | Workflow template CRUD |
| `workflowInstanceController.js` | Active workflow instance management |
| `workflowTaskController.js` | Task execution within workflows |
| `workflowMilestoneController.js` | Milestone tracking and SLA |
| `workflowDocumentController.js` | Documents attached to workflows |
| `schedulingController.js` | Scheduling operations |

### Compliance & Risk Controllers

| Controller | Purpose |
|------------|---------|
| `complianceStandardsController.js` | Compliance standard definitions |
| `complianceRunController.js` | Execute compliance audit runs |
| `riskAdminController.js` | Admin risk management |
| `riskBuyerController.js` | Buyer risk dashboard |
| `riskSupplierController.js` | Supplier risk profile |

### Intelligence & AI Controllers

| Controller | Purpose |
|------------|---------|
| `askHawkController.js` | AskHawk AI chatbot (RAG-based) |
| `fdaController.js` | FDA inspection and citation data |
| `publicIntelController.js` | Regulatory intelligence data |
| `docIntelController.js` | Document intelligence and OCR |
| `digilockerController.js` | DigiLocker document access (India) |

### Platform & Admin Controllers

| Controller | Purpose |
|------------|---------|
| `adminController.js` | Platform admin operations |
| `tenantAdminController.js` | Tenant management |
| `dashboardController.js` | Dashboard data aggregation |
| `monitoringController.js` | System monitoring |
| `trackingController.js` | Progress tracking |
| `systemSettingsController.js` | System configuration |
| `tableVariantsController.js` | Data grid configuration |
| `notificationController.js` | Notification history and delivery |
| `integrationController.js` | Third-party integrations |
| `rfqController.js` | Request for Quote |
| `vendorRegistrationController.js` | Supplier onboarding |
| `profileImportController.js` | Bulk supplier profile import |
| `formLayoutController.js` | Form field layout definitions |
| `templateController.js` | Question template CRUD |
| `packRegistryController.js` | Module pack management |
| `documentDisclosureController.js` | Document sharing policies |

---

## Services (`src/services/`)

### Audit Services

| Service | Purpose |
|---------|---------|
| `auditPhaseService.js` | Phase state management: normalizePhaseState, applyPhaseTransition, canTransition |
| `auditTrailService.js` | Immutable audit event recording |
| `auditEventService.js` | Event publishing and retrieval |
| `auditNoteService.js` | Note CRUD with file attachment |
| `auditWorkflowTransitions.js` | Workflow integration with audit phase changes |
| `assessmentTrackingService.js` | Track assessment progress, resolve type config |
| `assessmentEvidenceService.js` | Evidence upload + S3 storage + PII detection |
| `evidenceService.js` | Legacy evidence service |

### Workflow Services

| Service | Purpose |
|---------|---------|
| `workflowDefinitionService.js` | Workflow template CRUD |
| `workflowMilestoneService.js` | Milestone tracking and SLA management |
| `workflowRuntimeService.js` | Active workflow execution engine |
| `workflowPharmaAdapterService.js` | Pharma-specific workflow adapter |

### AI & Intelligence Services

| Service | Purpose |
|---------|---------|
| `askHawkKnowledgeService.js` | RAG knowledge base queries |
| `questionnaireGeminiService.js` | Google Gemini AI for questionnaire auto-fill |
| `questionnaireExtractionService.js` | Extract structured data from questionnaire files |
| `questionnairePreviewService.js` | Preview AI pre-fill results |
| `docIntelService.js` | Document intelligence and analysis |
| `ai/digilockerAiService.js` | AI analysis of DigiLocker documents |
| `llmServiceClient.js` | Unified LLM client (OpenAI/Gemini) |

### Risk Services (`services/risk/`)

| Service | Purpose |
|---------|---------|
| `riskOrchestrator.js` | Orchestrate risk calculations |
| `scoringV1.js` | Legacy risk scoring algorithm |
| `scoringV2.js` | Current risk scoring algorithm |
| `auditorNormalization.js` | Normalize auditor input for scoring |
| `breakdown.js` | Risk breakdown by category |
| `buyerWeighting.js` | Buyer-specific risk weighting |
| `evidenceTrust.js` | Evidence trust scoring |
| `networkExposure.js` | Supplier network risk exposure |
| `trend.js` | Risk trend analysis over time |
| `improvements.js` | Track risk improvement actions |
| `reasons.js` | Risk reason explanations |

### Compliance Services (`services/compliance/`)

| Service | Purpose |
|---------|---------|
| `complianceEvaluationService.js` | Evaluate compliance against standards |
| `complianceRules.js` | Business rule definitions for compliance |
| `standardRegistryService.js` | Manage compliance standard registry |

### Public Intelligence Services (`services/publicIntel/`)

| Service | Purpose |
|---------|---------|
| `connectors/fdaInspections.js` | Fetch FDA inspection data |
| `connectors/fdaRecalls.js` | Fetch FDA recall data |
| `scheduler/` | Schedule periodic data sync |

### Integration Services (`services/integrations/`)

| Service | Purpose |
|---------|---------|
| `connectionService.js` | Manage third-party connections |
| `ingestionService.js` | Ingest data from external systems |
| `mappingService.js` | Map external data to internal models |
| `auditLogService.js` | Log integration operations |
| `crypto.js` | Encrypt/decrypt integration credentials |
| `schedulerService.js` | Schedule integration runs |

### Governance Services (`services/governance/`)

| Service | Purpose |
|---------|---------|
| `governanceAuditLogService.js` | Governance-level audit logging |
| `notificationDispatchService.js` | Dispatch notifications from governance events |
| `notificationPolicyService.js` | Evaluate notification policies |
| `seedGovernance.js` | Seed default governance configuration |

---

## Middlewares (`src/middlewares/`)

| Middleware | Purpose |
|------------|---------|
| `authMiddleware.js` | JWT token validation and user injection into `req.user` |
| `roleMiddleware.js` | Role-based access control (RBAC) — checks `req.user.role` |
| `tenantMiddleware.js` | Multi-tenancy: extracts tenantId from token or header |
| `featureFlagMiddleware.js` | Evaluate feature flags per request |
| `uploadMiddleware.js` | File upload handling via multer (memory/disk storage) |
| `workflowFlagsMiddleware.js` | Workflow-specific feature flag evaluation |
| `authorizeAskHawk.js` | AskHawk service authorization and quota |
| `validate.js` | Zod/Joi request body validation |

---

## Routes Overview (`src/routes/`)

### V2 API Routes (`src/routes/v2/`)
Modern tenant-aware assessment API:
- `v2/assessments.js` — Assessment CRUD, phase management
- `v2/capas.js` — Assessment CAPA management
- `v2/evidence.js` — Evidence upload/retrieval
- `v2/findings.js` — Finding management
- `v2/questionnaires.js` — Questionnaire management
- `v2/admin.js` — Module admin
- `v2/moduleAdminRoutes.js` — Additional admin routes

### V1 Routes (`src/routes/v1/`)
- `v1/adminGovernanceRoutes.js` — Admin governance
- `v1/userGovernanceRoutes.js` — User governance

### Key Route Files

| Route File | Prefix | Controller |
|------------|--------|------------|
| `authRoutes.js` | `/api/auth` | authController |
| `auditRequestRoutes.js` | `/api/audits` | auditRequestController |
| `auditPhaseRoutes.js` | `/api/audits/:id/phases` | auditPhaseController |
| `capaRoutes.js` | `/api/capas` | capaController |
| `evidenceRoutes.js` | `/api/evidence` | evidenceController |
| `workflowDefinitionRoutes.js` | `/api/workflows/definitions` | workflowDefinitionController |
| `workflowInstanceRoutes.js` | `/api/workflows/instances` | workflowInstanceController |
| `complianceStandardsRoutes.js` | `/api/compliance/standards` | complianceStandardsController |
| `complianceRunRoutes.js` | `/api/compliance/runs` | complianceRunController |
| `askHawkRoutes.js` | `/api/askhawk` | askHawkController |
| `notificationRoutes.js` | `/api/notifications` | notificationController |
| `reportTemplateRoutes.js` | `/api/report-templates` | reportTemplateController |
| `reportInstanceRoutes.js` | `/api/report-instances` | reportInstanceController |
| `questionaireRoutes.js` | `/api/questionnaires` | questionaireController |
| `questionnaireUploadRoutes.js` | `/api/questionnaires/upload` | questionnaireUploadController |
| `adminRoutes.js` | `/api/admin` | adminController |
| `adminTenantRoutes.js` | `/api/admin/tenants` | tenantAdminController |
| `fdaRoutes.js` | `/api/fda` | fdaController |
| `publicIntelRoutes.js` | `/api/intel` | publicIntelController |
| `integrationRoutes.js` | `/api/integrations` | integrationController |
| `rfqRoutes.js` | `/api/rfq` | rfqController |
| `dashboardRoutes.js` | `/api/dashboard` | dashboardController |

---

## Configuration (`src/config/`)

```javascript
// Feature Flags (featureFlags.js)
ENABLE_PREP_PHASE          // Enables PREP phase in audit lifecycle
ENABLE_AUDIT_EVENT_LOG     // Detailed audit event capture
ENFORCE_AUDIT_PARTICIPANTS // Validates participant roles
ALLOW_EARLY_ARTIFACT_SEND  // Allow sending artifacts before phase completion
ENABLE_NEW_REQUEST_IDS     // New hawkeyeRequestId format
```

---

## Key Architectural Patterns

1. **Express.js Monolith** — All routes registered in `app.js`, no microservices (except optional Python services)
2. **Dual Version Pattern** — V1 legacy routes/models coexist with V2 assessment-centric API
3. **Tenant Middleware** — Every authenticated route injects tenant context from JWT
4. **Feature Flags** — Evaluated per-request via `featureFlagMiddleware.js`
5. **Background Schedulers** — 4 schedulers started at boot in `app.js`
6. **Plugin Modules** — `src/modules/` provides self-contained subsystems
7. **S3 for Storage** — Evidence and document uploads staged locally then pushed to S3
8. **Socket.IO** — Real-time notifications initialized in `server.js`
