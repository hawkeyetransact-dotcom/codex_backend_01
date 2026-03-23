# GMP Audit Data Flow

## Scope
This is the actual current GMP audit flow reconstructed from routes, controllers, models, and services in the backend `dev` worktree. It documents the live legacy audit-request path, not the future target architecture.

## End-to-End Steps

### 1. Audit request creation
- API route: `POST /api/buyer/audit-request`
- Controller: `createAuditRequest` in `src/controllers/buyerController.js`
- Write type: insert into `audit-requests-master`, plus conditional inserts/updates into `audit-artifacts`
- Models involved: `users`, `supplier-sites`, `supplier-master-products`, `product-site-mappings`, `audit-requests-master`, `audit-artifacts`, `auditor-profiles`, `templates`
- Key fields populated: parties (`supplier_id`, `auditor_id`, `create_by_buyer_id`), scope (`supplier_product_id`, `supplier_product_ids`, `site_id`), org context, status (`trackStatus`, `questionnaireStatus`, `nextAuditOn`, `high_status`), calendar fields, `assignedAuditors[]`, `artifactChecklist[]`
- Source of truth: `audit-requests-master`
- Derived/projection side effects: milestone sync and notifications
- Duplication risk: lifecycle stored in `trackStatus`, `questionnaireStatus`, ETA strings, `phaseState`, and milestone projections simultaneously

### 2. Template selection / execution questionnaire draft generation
- API route: `POST /api/auditor/create-draft-questions`
- Controller: `createPreviewAuditQuestions` in `src/controllers/auditorController.js`
- Write type: bulk upsert into `auditQuestions`, update to `audit-requests-master`
- Models involved: `audit-requests-master`, `templateQuestions`, `auditQuestions`
- Behavior: soft-deletes previous question rows, upserts selected template questions, copies rendering metadata, then updates `questionnaireStatus = in_progress`, `trackStatus = Questionnaire in progress`, and `selectedTemplateId`

### 3. Questionnaire release to supplier
- API route: `POST /api/audits/:auditId/artifacts/:artifactId/send`
- Controller: `sendAuditArtifact` in `src/controllers/auditPhaseController.js`
- Write type: update `audit-artifacts`, insert `audit-artifact-versions`, update `audit-requests-master`
- Key behavior for `EXECUTION_QUESTIONNAIRE`: marks artifact sent, versions it, updates audit request to `questionnaireStatus = sent_to_supplier`, `trackStatus = Request sent to Supplier`, `nextAuditOn = supplier`

### 4. Supplier responses
- API route: `PUT /api/auditor/audit-question/update-data/:auditRequestId`
- Controller: `updateAuditResponses` in `src/controllers/auditorController.js`
- Write type: bulk update `auditQuestions`, update supplier section assignments
- Key fields updated per question: `YesNoAnswers`, `textResponse`, `docUrls`, `responseDetails`, `responseStatus`, `submittedByUserId`, `lastUpdatedByUserId`, `flagStatus`, `messages`, `auditorAttachments`, `internalNotes`
- Guardrails: supplier edits only when audit questionnaire is editable; supplier users limited to assigned categories

### 5. Auditor review and follow-up
- API route: `POST /api/auditor/audit-question/flag-follow-up`
- Controller: `flagQuestionFollowUp`
- Write type: update one `auditQuestions` row, update `audit-requests-master`, update milestone runtime
- Key fields updated: question `flagStatus = auditor_flagged`; audit request `questionnaireStatus = followup_requested`, `trackStatus = Supplier follow up open`, `nextAuditOn = supplier`

### 6. Evidence attach
Two active evidence paths exist.

#### 6A. Legacy audit evidence
- API routes: `POST /api/audits/:auditId/evidence`, `GET /api/audits/:auditId/evidence`
- Model: `evidence`
- Source of truth: audit-coupled legacy evidence store

#### 6B. DocVault evidence mapping
- API routes: `POST /api/digilocker/documents`, `POST /api/digilocker/documents/:documentId/upload`, `POST /api/digilocker/questions/:questionId/attach`, `GET /api/digilocker/audits/:auditId/evidence-checklist`
- Models: `digilocker_documents`, `digilocker_document_versions`, `digilocker_question_evidence_maps`, `digilocker_audit_evidence_checklists`
- Source of truth: reusable document vault + question/document bridge model

### 7. Compliance run
- API routes under `/api/auditor/compliance/runs`
- Controller: `src/controllers/complianceRunController.js`
- Service core: `runComplianceFlowForAudit` in `src/services/compliance/complianceFlowService.js`
- Models involved: `compliance_response_snapshots`, `compliance_runs`, `compliance_question_results`, standards/control registries
- Source of truth split: `auditQuestions` for live responses, snapshot for frozen input, run/results for derived outputs

### 8. Report generation
- API route: `POST /api/auditor/audits/:auditId/report/draft`
- Controller: `generateDraftReport`
- Write type: upsert into `audit-reports`
- Models involved: `audit-requests-master`, `auditQuestions`, `audit-artifacts`, `audit-reports`, compliance services
- Output fields: summary, observations, template metadata, rendered blocks, context snapshot, `status = DRAFT`

### 9. CAPA generation and update
- Generation route: `POST /api/auditor/audits/:auditId/report/capas/generate`
- CAPA CRUD routes: `/api/capas/*`
- Models involved: `audit-reports`, `capas`, `auditQuestions`
- Behavior: creates CAPAs from report observations and back-links CAPA IDs into observations and questions

### 10. Closure, phase transitions, and milestones
- API routes: `GET /api/audits/:auditId/phases`, `POST /api/audits/:auditId/phases/transition`, `POST /api/audits/:auditId/prep/start`, `POST /api/audits/:auditId/prep/complete`
- Services involved: `auditPhaseService`, `workflowMilestoneService`, `assessmentTrackingService`
- Models involved: `audit-requests-master.phaseState`, `phase-trackers`, `status-trackers`, `status-history`, `workflow_milestone_instances`
- Source-of-truth problem: no single authoritative workflow runtime; these layers are synchronized from controller/service code

### 11. Notifications
- Trigger points observed in `buyerController`, `questionnaireAssignmentController`, `workflowMilestoneService`, and report/CAPA flows
- Models involved: notification module models and outbox/event logs

## Source-of-Truth Summary
| Concern | Current source of truth | Derived / projected layers |
|---|---|---|
| Audit case header | `audit-requests-master` | phase tracker, status tracker, milestones, notifications |
| Execution questionnaire | `auditQuestions` | compliance snapshots/results, report observations |
| Artifact lifecycle | `audit-artifacts` | `audit-artifact-versions`, milestones |
| Evidence | split between `evidence` and DocVault models | checklists, suggestions, mappings |
| Compliance | `compliance_runs` + `compliance_question_results` | report observations, AI metrics |
| Report | `audit-reports` | CAPAs, audit events |
| CAPA | `capas` | report observation link arrays |

## Duplication Hotspots
- audit lifecycle: `trackStatus`, `questionnaireStatus`, `high_status`, `phaseState`, milestone instances, status trackers
- evidence: `evidence` vs DocVault model set
- findings/observations: embedded in report vs linked to CAPA vs emerging V2 finding model
- workflow runtime: legacy audit request fields vs assessment V2 vs milestone/status projections
