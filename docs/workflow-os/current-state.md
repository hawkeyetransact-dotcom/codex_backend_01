# Hawkeye Workflow OS - Current State Inventory

## Scope and Branch
- Repository: `backend` + `frontend`
- Branch target: `demo`
- DB target: Demo MongoDB
- Date of inventory: 2026-02-21

## 1) System map (as-is)

```text
+--------------------+        HTTP (cookie/JWT)        +----------------------+
| Next.js Frontend   |  ----------------------------->  | Node/Express Backend |
| (App Router, MUI)  |                                  | (Monolith modules)   |
+--------------------+  <-----------------------------  +----------------------+
          |                                                         |
          | /api/next/* proxy routes + direct API calls            |
          |                                                         |
          v                                                         v
  UI workflows (audits, templates,                         MongoDB (Mongoose models)
  digilocker, v2 assessments, settings)                    + local uploads + S3 refs
                                                                    |
                                                                    v
                                                          Optional AI sidecar:
                                                          `python_services/llm_service`
                                                          (FastAPI + Ollama API)
```

### Runtime components currently in use
- Frontend: Next.js 15, React 18, MUI 6 (`frontend/package.json`)
- Backend: Express + Mongoose (`backend/src/app.js`)
- AI capabilities:
  - Local/remote LLM wrapper (`src/services/llmServiceClient.js`)
  - Auto-fill + report preview controller (`src/controllers/autoFillController.js`)
  - DigiLocker extraction/classification/suggestion service (`src/services/digilocker/digilockerService.js`)
  - Optional Python LLM/docx service (`python_services/llm_service/main.py`)

## 2) Current pharma audit flow (implemented today)

There are **three overlapping orchestration layers** in production code:

1. Legacy audit request status model  
   - Primary entity: `audit-requests-master` (`src/models/auditRequestsMasterModel.js`)
   - Fields used as state:
     - `trackStatus`
     - `questionnaireStatus`
     - `high_status`
     - `nextAuditOn`

2. Audit phase abstraction (phaseState)
   - `phaseState.currentPhase` + `phaseState.phases[*].status`
   - Phase keys: `INITIATED -> PREP -> PLANNING -> EXECUTION -> FINDINGS -> CAPA -> CLOSURE -> SURVEILLANCE`
   - Source:
     - `src/constants/auditPhases.js`
     - `src/services/auditPhaseService.js`
     - `src/controllers/auditPhaseController.js`

3. Workflow milestone tracker layer
   - Tenant milestone definitions + SLA + per-audit milestone instances
   - Source:
     - `src/models/workflowMilestoneDefinitionModel.js`
     - `src/models/workflowMilestoneInstanceModel.js`
     - `src/services/workflowMilestoneService.js`
     - `src/routes/workflowMilestoneRoutes.js`

### Core transition behavior observed
- Audit request creation (`buyerController.submitAuditRequest`) initializes:
  - request IDs
  - baseline statuses (`questionnaireStatus=request_received`, `trackStatus=...`)
  - default artifacts (intimation/pre-audit if templates resolved)
- Artifact send/submit in `auditPhaseController` drives transitions:
  - INTIMATION sent -> INITIATED progress
  - SCOPE/AGENDA signoff -> PREP complete -> PLANNING start
  - EXECUTION_QUESTIONNAIRE sent -> EXECUTION starts
- Questionnaire response/review plus compliance run/report features execute in parallel modules.

### Existing flow states (legacy)
- `questionnaireStatus` enum:
  - `request_received`
  - `in_progress`
  - `sent_to_supplier`
  - `supplier_submitted`
  - `followup_requested`
  - `followup_submitted`
  - `review_completed`
  - `auditor_submitted`

## 3) Key frontend route inventory (relevant to migration)

### Existing onboarding/settings
- `/onboard` (role/profile onboarding)
- `/settings` (tabs include general, security, invites, workflow/SLA config, previews)

### Existing audit/pharma flow screens
- `/audits`
- `/audits/[id]`
- `/audits/[id]/artifacts`
- `/audits/[id]/questionnaire`
- `/audits/[id]/report`
- `/audits/[id]/generate-report`
- `/audits/[id]/progress`
- `/audits/[id]/milestones`
- `/digilocker`

### Existing v2 workflow-like screens
- `/work/assignments`
- `/work/questionnaires`
- `/work/requests`
- `/assessments/[id]`

## 4) Key backend endpoint inventory (relevant to migration)

### Audit request + legacy flow
- `/api/buyer/audit-request` (create request)
- `/api/audit-requests/*` (role-specific request lists, assignment/decision/archive)

### Questionnaire + template
- `/api/template-questions/*`
- `/api/questionnaires/upload`, `/api/questionnaires/jobs/:id`, `/publish`
- `/api/v2/questionnaires/*` (artifact-based pre/full questionnaire)

### Phase/milestone/status tracking
- `/api/audits/:auditId/phases` + transition/artifact ops (`auditPhaseRoutes`)
- `/api/workflow-milestones/*` (definitions/SLA/instances)
- `/api/audits/:auditId/tracking` + status updates (`trackingRoutes`)

### Evidence + DigiLocker + compliance + report
- `/api/audits/:auditId/evidence*` + secure stream/token
- `/api/digilocker/*` (document/version/tag/suggest/attach/checklist)
- `/api/auditor/compliance/runs*`
- `/api/compliance/standards/*`
- `/api/auditor/audits/:auditId/report*`

## 5) Current DB collections and relationships (high-impact)

### Tenant/auth
- `Tenant` (`tenantModel`)
- `users` (`userModel`) -> `tenant_id`

### Audit domain (legacy + phase/artifact)
- `audit-requests-master`
- `auditQuestions`
- `templates`
- `templateQuestions`
- `audit-artifacts`
- `audit-reports`
- `questionnaire-section-assignments`
- `workflow_milestone_definitions`
- `workflow_milestone_instances`

### v2 assessment domain (already workflow-like)
- `assessments`
- `questionnaire-artifacts`
- `assessment-evidence`
- `assessment-findings`
- `assessment-capas`
- `assessment-types`
- `tenant-module-configs`

### DigiLocker/compliance
- `digilocker_documents`
- `digilocker_document_versions`
- `digilocker_document_extractions`
- `digilocker_question_evidence_maps`
- `compliance_standard_registry`
- `compliance_runs`
- `compliance_question_results`
- `compliance_response_snapshots`

## 6) Pain points in current implementation

1. State orchestration is fragmented.
- Legacy status fields, phaseState, milestones, and v2 assessment flow all coexist.
- No single source-of-truth event log across all flows.

2. Workflow logic is partially hard-coded.
- Transitions are embedded in controller branches (`auditPhaseController`, questionnaire/report controllers).
- Reuse across industries/use-cases is limited.

3. Pack/template semantics are not first-class.
- cGMP module packs exist in code (`modulePacks.js`) but not generalized as tenant-installable versioned packs with explicit contracts.

4. Task abstraction is incomplete.
- Human actions are spread across artifacts/questionnaires/status calls; no single task inbox contract for all node types.

5. Documents are split by subsystem.
- Evidence, DigiLocker, and document-disclosure all manage document metadata differently; linkage is possible but not normalized for a generic workflow runtime.

6. Backward compatibility complexity.
- Existing production routes are broad; migration must be additive and feature-flagged.

## 7) Reusable assets for Workflow OS

### Reuse directly
- `assessments` / `questionnaire-artifacts` models and v2 controllers as runtime building blocks.
- `workflow_milestone_*` definitions/SLA UI and APIs for timing/escalation patterns.
- DigiLocker extraction + evidence suggestion for AI/document nodes.
- Compliance evaluation services for ICH Q7 mapping/verdict logic.
- Existing role + tenant middleware and admin audit logs.

### Reuse with adapter
- `audit-requests-master` legacy lifecycle can emit Workflow OS instance events behind flags.
- Existing questionnaire/report screens can write to Workflow OS tasks/events while preserving legacy writes.

### Must be newly introduced
- Versioned workflow definition registry + immutable workflow event stream + pack registry/install lifecycle + generic task API + canonical workflow documents collection.

