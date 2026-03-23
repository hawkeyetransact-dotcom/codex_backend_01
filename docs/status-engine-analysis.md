# Status Engine Analysis

## Executive Summary
The system does not have one status engine. It has multiple overlapping status mechanisms:
1. legacy audit header fields on `audit-requests-master`
2. embedded phase state on `audit-requests-master.phaseState`
3. standalone `phase-trackers`
4. `status-definitions` + `status-trackers` + `status-history`
5. `workflow_milestone_definitions` + `workflow_milestone_instances`
6. assessment V2 embedded phase/milestone state on `assessments`

This is the core reason workflow behavior feels hard-coded and difficult to generalize.

## Core Status Fields and Their Meanings
| Model | Field | Values | Where updated | Business meaning | Overlaps / conflicts |
|---|---|---|---|---|---|
| audit-requests-master | `auditorDecision` | PENDING, ACCEPTED, REJECTED | buyerController, auditRequestController | Auditor acceptance posture for the request | Overlaps with trackStatus and milestones |
| audit-requests-master | `supplierDecision` | PENDING, ACCEPTED, REJECTED, PROPOSED | auditRequestController | Supplier acceptance/posture | Separate from questionnaireStatus |
| audit-requests-master | `questionnaireStatus` | request_received, in_progress, sent_to_supplier, supplier_submitted, followup_requested, followup_submitted, review_completed, auditor_submitted | buyerController, auditorController, auditPhaseController | Execution questionnaire lifecycle | Overlaps with trackStatus, phaseState, milestone state |
| audit-requests-master | `trackStatus` | free-text / convention driven | buyerController, auditorController, auditPhaseController, rfqController | Human-readable lifecycle label | Not normalized; duplicates other status fields |
| audit-requests-master | `high_status` | numeric/string legacy convention | buyerController and other legacy controllers | Legacy coarse progression signal | Meaning is not self-describing in schema |
| audit-requests-master | `phaseState.currentPhase / phaseState.phases.*.status` | INITIATED..SURVEILLANCE / NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED | auditPhaseService, auditPhaseController | Embedded phase projection on the audit request | Overlaps with PhaseTracker and milestone runtime |
| auditQuestions | `responseStatus` | supplier_draft, supplier_submitted, auditor_draft, auditor_submitted | auditorController.updateAuditResponses | Per-question response progression | Can diverge from audit-level questionnaireStatus |
| auditQuestions | `flagStatus` | auditor_flagged, supplier_responded, auditor_accepted | auditorController.flagQuestionFollowUp, updateAuditResponses | Per-question follow-up cycle | Partially duplicates report/follow-up posture |
| audit-artifacts | `status` | draft, sent, in_progress, complete | auditPhaseController | Artifact lifecycle | Not directly normalized to phase or questionnaire status |
| pre-audit-questionnaires | `status` | DRAFT, SENT, IN_PROGRESS, SUBMITTED, REVIEWED | preAuditController | PAQ lifecycle | Separate from execution questionnaire lifecycle |
| questionnaire-section-assignments | `status` | ASSIGNED, IN_PROGRESS, SUBMITTED, REOPENED, REASSIGNED | questionnaireAssignmentController, auditorController.updateAuditResponses | Supplier section delegation state | Can be out of sync with auditQuestions response status |
| compliance_runs | `status` | RUNNING, COMPLETED, FINALIZED, FAILED | complianceRunController / ComplianceEvaluationService | Compliance evaluation lifecycle | Independent of audit closure/report state |
| compliance_question_results | `reviewStatus` | OPEN, REVIEWED | ComplianceEvaluationService / complianceRunController | Auditor review state for per-question verdict | Separate from question response and report review states |
| audit-reports | `status` | DRAFT, PENDING_SIGNATURES, COMPLETED | reportController | Report maturity state | No generic signature engine behind it yet |
| capas | `status` | DRAFT, NEEDS_SUPPLIER, IN_REVIEW, REWORK_REQUESTED, APPROVED, CLOSED, OVERDUE | capaController, reportController.generateCapasFromReport | CAPA lifecycle | Separate from audit milestone closure |
| assessments | `currentPhaseKey` | PREP, SCOPE_AGENDA, SCHEDULING, EXECUTION, REPORTING, FOLLOWUP_CAPA | v2 assessment controller | Emerging V2 workflow current phase | Different phase model from legacy audit |
| assessments | `status` | DRAFT, ACTIVE, COMPLETED, ARCHIVED | v2 assessment controller | Assessment V2 lifecycle | Parallel workflow runtime |
| phase-trackers | `currentPhaseKey / phases.*.status` | INITIATED..SURVEILLANCE / NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED | assessmentTrackingService | Standalone phase projection | Duplicates embedded phaseState |
| status-trackers | `status` | NOT_STARTED, IN_PROGRESS, COMPLETED, BLOCKED, SKIPPED | tracking services | Per-phase/per-status-code runtime projection | Another status engine |
| workflow_milestone_instances | `status` | NOT_STARTED, IN_PROGRESS, COMPLETED, SKIPPED | workflowMilestoneService | Milestone runtime projection | Partially overlaps with status trackers and phase trackers |

## Key Conflicts
- `trackStatus` is user-readable but free-form, so it is not reliable as a machine state engine.
- `questionnaireStatus` drives live behavior, but it only covers one slice of audit execution.
- `phaseState`, `phase-trackers`, and `workflow_milestone_instances` are all phase/milestone projections of the same audit.
- Assessment V2 uses a different phase vocabulary from the legacy audit path.
- CAPA/report/compliance statuses are each internally coherent but not unified under a common case runtime.

## Appendix A: Declaration-Level Inventory of Status/Phase/State/Decision Fields
| Model | Collection | Field | Enum values | Default | File |
|---|---|---|---|---|---|
| access_grants | `access_grants` | `status` | ["ACTIVE", "REVOKED", "EXPIRED"] | `ACTIVE` | `src/models/accessGrantModel.js` |
| ai_action_metrics | `ai_action_metrics` | `status` | ["success", "error"] | `success` | `src/models/aiActionMetricModel.js` |
| api-master | `api-masters` | `regulatoryPresence.WHO_PQ.statuses` | `[]` | `[]` | `src/models/apiMasterModel.js` |
| api-master | `api-masters` | `status` | ["active", "merged", "deprecated"] | `active` | `src/models/apiMasterModel.js` |
| api_master_sync | `api_master_syncs` | `status` | ["idle", "running", "success", "failed"] | `idle` | `src/models/apiMasterSyncModel.js` |
| approval_requests | `approval_requests` | `decisionNote` | `[]` | `null` | `src/models/approvalRequestModel.js` |
| approval_requests | `approval_requests` | `status` | ["PENDING", "APPROVED", "REJECTED"] | `PENDING` | `src/models/approvalRequestModel.js` |
| AskHawkEvalRun | `askhawkevalruns` | `status` | ["PASS", "FAIL"] | `FAIL` | `src/models/askHawkEvalRunModel.js` |
| assessment-capas | `assessment-capas` | `status` | ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", "REWORK_REQUESTED", "APPROVED", "CLOSED", "OVERDUE"] | `DRAFT` | `src/models/assessmentCapaModel.js` |
| assessment-evidence | `assessment-evidences` | `status` | ["processing", "ready", "failed"] | `processing` | `src/models/assessmentEvidenceModel.js` |
| assessment-findings | `assessment-findings` | `status` | ["OPEN", "IN_REVIEW", "CLOSED"] | `OPEN` | `src/models/assessmentFindingModel.js` |
| assessment-types | `assessment-types` | `phases` | `[]` | `[]` | `src/models/assessmentTypeModel.js` |
| assessments | `assessments` | `currentPhaseKey` | ["PREP", "SCOPE_AGENDA", "SCHEDULING", "EXECUTION", "REPORTING", "FOLLOWUP_CAPA"] | `PREP` | `src/models/assessmentModel.js` |
| assessments | `assessments` | `phases` | `[]` | `[]` | `src/models/assessmentModel.js` |
| assessments | `assessments` | `status` | ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] | `ACTIVE` | `src/models/assessmentModel.js` |
| audit-agendas | `audit-agendas` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `PLANNING` | `src/models/auditAgendaModel.js` |
| audit-agendas | `audit-agendas` | `status` | ["DRAFT", "PROPOSED", "CONFIRMED"] | `DRAFT` | `src/models/auditAgendaModel.js` |
| audit-artifact-versions | `audit-artifact-versions` | `status` | `[]` | `null` | `src/models/auditArtifactVersionModel.js` |
| audit-artifacts | `audit-artifacts` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `null` | `src/models/auditArtifactModel.js` |
| audit-artifacts | `audit-artifacts` | `status` | ["draft", "sent", "in_progress", "complete"] | `draft` | `src/models/auditArtifactModel.js` |
| audit-cycle-templates | `audit-cycle-templates` | `phases` | `[]` | `[]` | `src/models/auditCycleTemplateModel.js` |
| audit-plans | `audit-plans` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `PREP` | `src/models/auditPlanModel.js` |
| audit-plans | `audit-plans` | `status` | ["DRAFT", "SUBMITTED", "APPROVED"] | `DRAFT` | `src/models/auditPlanModel.js` |
| audit-reports | `audit-reports` | `status` | ["DRAFT", "PENDING_SIGNATURES", "COMPLETED"] | `DRAFT` | `src/models/auditReportModel.js` |
| audit-requests-master | `audit-requests-masters` | `auditorDecision` | ["PENDING", "ACCEPTED", "REJECTED"] | `PENDING` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `auditorDecisionAt` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `auditorDecisionBy` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `complianceStatus` | ["complient", "non-complient"] | `non-complient` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `flagStatus` | `[]` | `auditor` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `high_status` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `phaseState` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `questionnaireStatus` | ["request_received", "in_progress", "sent_to_supplier", "supplier_submitted", "followup_requested", "followup_submitted", "review_completed", "auditor_submitted"] | `request_received` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `supplierDecision` | ["PENDING", "ACCEPTED", "REJECTED", "PROPOSED"] | `PENDING` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `supplierDecisionAt` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `supplierDecisionBy` | `[]` | `null` | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `audit-requests-masters` | `trackStatus` | `[]` | `Request Received` | `src/models/auditRequestsMasterModel.js` |
| audit-rfq-quotes | `audit-rfq-quotes` | `status` | ["DRAFT", "SUBMITTED", "REVISED", "WITHDRAWN", "ACCEPTED", "REJECTED"] | `DRAFT` | `src/models/auditRfqQuoteModel.js` |
| audit-rfqs | `audit-rfqs` | `location.state` | `[]` | `null` | `src/models/auditRfqModel.js` |
| audit-rfqs | `audit-rfqs` | `status` | ["DRAFT", "PUBLISHED", "IN_QA", "QUOTES_RECEIVED", "SHORTLISTED", "AWARDED", "CONVERTED", "CANCELLED", "EXPIRED"] | `DRAFT` | `src/models/auditRfqModel.js` |
| auditor-profiles | `auditor-profiles` | `state` | `[]` | `null` | `src/models/auditorProfileModel.js` |
| auditor_affiliations | `auditor_affiliations` | `status` | ["PENDING", "ACTIVE", "REVOKED"] | `PENDING` | `src/models/auditorAffiliationModel.js` |
| auditQuestions | `auditquestions` | `autoFillMeta.status` | ["exact_match", "supported_inference", "partial_evidence", "no_evidence", "needs_human_review"] | `null` | `src/models/auditQuestionsModels.js` |
| auditQuestions | `auditquestions` | `flagStatus` | ["auditor_flagged", "supplier_responded", "auditor_accepted"] | `auditor_accepted` | `src/models/auditQuestionsModels.js` |
| auditQuestions | `auditquestions` | `responseStatus` | ["supplier_draft", "supplier_submitted", "auditor_draft", "auditor_submitted"] | `supplier_draft` | `src/models/auditQuestionsModels.js` |
| AuditSchedule | `auditschedules` | `status` | ["DRAFT", "PROPOSED", "HELD", "ACCEPTED", "CONFIRMED", "RESCHEDULED"] | `DRAFT` | `src/models/auditScheduleModel.js` |
| buyer-profiles | `buyer-profiles` | `state` | `[]` | `null` | `src/models/buyerProfileModel.js` |
| capa-v2 | `capa-v2` | `issueStatement` | `[]` | `` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `lockState.actionPlanLocked` | `[]` | `false` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `lockState.effectivenessLocked` | `[]` | `false` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `lockState.intakeLocked` | `[]` | `false` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `lockState.investigationLocked` | `[]` | `false` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `lockState.rcaLocked` | `[]` | `false` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `status` | ["DRAFT_CANDIDATE", "INTAKE_DRAFT", "UNDER_TRIAGE", "TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "ACTION_PLAN_APPROVED", "IN_IMPLEMENTATION", "AWAITING_EFFECTIVENESS_CHECK", "EFFECTIVENESS_REVIEW_IN_PROGRESS", "CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED", "CANCELLED", "SUPERSEDED", "MERGED"] | `CAPA_OPEN` | `src/models/capaV2Models.js` |
| capa-v2 | `capa-v2` | `triageDecision` | ["NO_CAPA_NEEDED", "CORRECTION_ONLY", "FORMAL_CAPA_REQUIRED"] | `FORMAL_CAPA_REQUIRED` | `src/models/capaV2Models.js` |
| capa-v2-action-items | `capa-v2-action-items` | `status` | ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] | `NOT_STARTED` | `src/models/capaV2Models.js` |
| capa-v2-approvals | `capa-v2-approvals` | `decision` | ["APPROVED", "REJECTED", "NEEDS_REWORK"] | `null` | `src/models/capaV2Models.js` |
| capa-v2-candidates | `capa-v2-candidates` | `issueStatement` | `[]` | `` | `src/models/capaV2Models.js` |
| capa-v2-candidates | `capa-v2-candidates` | `status` | ["NEW", "IN_REVIEW", "TRIAGED", "DISMISSED", "MERGED", "CONVERTED"] | `NEW` | `src/models/capaV2Models.js` |
| capa-v2-candidates | `capa-v2-candidates` | `triageDecision` | ["NO_CAPA_NEEDED", "CORRECTION_ONLY", "FORMAL_CAPA_REQUIRED"] | `null` | `src/models/capaV2Models.js` |
| capa-v2-intakes | `capa-v2-intakes` | `autoFillStatus` | ["exact_match", "supported_inference", "partial_evidence", "no_evidence", "needs_human_review"] | `supported_inference` | `src/models/capaV2Models.js` |
| capa-v2-intakes | `capa-v2-intakes` | `issueStatementDraft` | `[]` | `` | `src/models/capaV2Models.js` |
| capa-v2-intakes | `capa-v2-intakes` | `state` | ["DRAFT", "SUBMITTED", "ARCHIVED"] | `DRAFT` | `src/models/capaV2Models.js` |
| capa-v2-metric-snapshots | `capa-v2-metric-snapshots` | `status` | ["DRAFT_CANDIDATE", "INTAKE_DRAFT", "UNDER_TRIAGE", "TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "ACTION_PLAN_APPROVED", "IN_IMPLEMENTATION", "AWAITING_EFFECTIVENESS_CHECK", "EFFECTIVENESS_REVIEW_IN_PROGRESS", "CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED", "CANCELLED", "SUPERSEDED", "MERGED"] | `CAPA_OPEN` | `src/models/capaV2Models.js` |
| capa-v2-source-links | `capa-v2-source-links` | `autoFillStatus` | ["exact_match", "supported_inference", "partial_evidence", "no_evidence", "needs_human_review"] | `supported_inference` | `src/models/capaV2Models.js` |
| capa-v2-status-history | `capa-v2-status-histories` | `fromStatus` | ["DRAFT_CANDIDATE", "INTAKE_DRAFT", "UNDER_TRIAGE", "TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "ACTION_PLAN_APPROVED", "IN_IMPLEMENTATION", "AWAITING_EFFECTIVENESS_CHECK", "EFFECTIVENESS_REVIEW_IN_PROGRESS", "CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED", "CANCELLED", "SUPERSEDED", "MERGED"] | `null` | `src/models/capaV2Models.js` |
| capa-v2-status-history | `capa-v2-status-histories` | `toStatus` | ["DRAFT_CANDIDATE", "INTAKE_DRAFT", "UNDER_TRIAGE", "TRIAGE_NO_CAPA", "CORRECTION_ONLY", "CAPA_OPEN", "INVESTIGATION_IN_PROGRESS", "RCA_PENDING_APPROVAL", "ACTION_PLAN_PENDING_APPROVAL", "ACTION_PLAN_APPROVED", "IN_IMPLEMENTATION", "AWAITING_EFFECTIVENESS_CHECK", "EFFECTIVENESS_REVIEW_IN_PROGRESS", "CLOSED_EFFECTIVE", "CLOSED_INEFFECTIVE", "REOPENED", "CANCELLED", "SUPERSEDED", "MERGED"] | `null` | `src/models/capaV2Models.js` |
| capa-v2-triage | `capa-v2-triages` | `decision` | ["NO_CAPA_NEEDED", "CORRECTION_ONLY", "FORMAL_CAPA_REQUIRED"] | `null` | `src/models/capaV2Models.js` |
| capa-v2-triage | `capa-v2-triages` | `triageState` | ["OPEN", "IN_REVIEW", "DECIDED"] | `OPEN` | `src/models/capaV2Models.js` |
| capas | `capas` | `status` | ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", "REWORK_REQUESTED", "APPROVED", "CLOSED", "OVERDUE"] | `DRAFT` | `src/models/capaModel.js` |
| catalog_products_v2 | `catalog_products_v2` | `refreshStatus` | ["pending", "ready", "stale", "blocked", "error"] | `pending` | `src/models/productCatalogV2Models.js` |
| catalog_products_v2 | `catalog_products_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `review_required` | `src/models/productCatalogV2Models.js` |
| compliance-event-canonical | `compliance-event-canonicals` | `status` | `[]` | `null` | `src/models/complianceEventCanonicalModel.js` |
| compliance_claim_records_v2 | `compliance_claim_records_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `claimed` | `src/models/productCatalogV2Models.js` |
| compliance_guideline_documents | `compliance_guideline_documents` | `status` | ["PROCESSING", "ACTIVE", "ARCHIVED", "FAILED"] | `PROCESSING` | `src/models/complianceGuidelineDocumentModel.js` |
| compliance_guideline_vectors | `compliance_guideline_vectors` | `status` | ["ACTIVE", "ARCHIVED"] | `ACTIVE` | `src/models/complianceGuidelineVectorModel.js` |
| compliance_question_results | `compliance_question_results` | `reviewStatus` | ["OPEN", "REVIEWED"] | `OPEN` | `src/models/complianceQuestionResultModel.js` |
| compliance_runs | `compliance_runs` | `status` | ["RUNNING", "COMPLETED", "FINALIZED", "FAILED"] | `RUNNING` | `src/models/complianceRunModel.js` |
| compliance_standard_registry | `compliance_standard_registries` | `status` | ["ACTIVE", "ARCHIVED"] | `ACTIVE` | `src/models/complianceStandardRegistryModel.js` |
| consent_records | `consent_records` | `status` | ["ACTIVE", "REVOKED", "EXPIRED"] | `ACTIVE` | `src/models/orgAccessModels.js` |
| customAudit-question | `customaudit-questions` | `processingStatus` | ["processing", "completed", "failed"] | `processing` | `src/models/customAuditQuestionModels.js` |
| digilocker_documents | `digilocker_documents` | `status` | ["Draft", "Submitted", "Approved", "Superseded", "Archived"] | `Draft` | `src/models/digilockerDocumentModel.js` |
| document_share_policies | `document_share_policies` | `status` | ["ACTIVE", "SCHEDULED", "EXPIRED"] | `SCHEDULED` | `src/models/sharePolicyModel.js` |
| documents | `documents` | `status` | ["DRAFT", "REDACTION_ACCEPTED", "SHARED"] | `DRAFT` | `src/models/documentModel.js` |
| engagement_participants | `engagement_participants` | `status` | ["INVITED", "ACTIVE", "REVOKED", "EXPIRED"] | `ACTIVE` | `src/models/engagementModels.js` |
| engagements | `engagements` | `status` | ["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED"] | `ACTIVE` | `src/models/engagementModels.js` |
| evidence | `evidences` | `status` | ["processing", "ready", "failed"] | `processing` | `src/models/evidenceModel.js` |
| evidence_uploads | `evidence_uploads` | `status` | ["processing", "ready", "failed"] | `processing` | `src/models/evidenceUploadModel.js` |
| external-audits | `external-audits` | `status` | `[]` | `null` | `src/models/ExternalAudit.js` |
| external-capas | `external-capas` | `status` | `[]` | `null` | `src/models/ExternalCAPA.js` |
| FdaInspection | `fdainspections` | `state` | `[]` | `null` | `src/models/fdaInspectionModel.js` |
| HawkUnanswered | `hawkunanswereds` | `status` | ["new", "reviewed", "converted"] | `new` | `src/models/hawkUnansweredModel.js` |
| integration-connections | `integration-connections` | `status` | ["Draft", "Testing", "Active", "Paused", "Error", "Revoked"] | `Draft` | `src/models/integrationConnectionModel.js` |
| integration-run-logs | `integration-run-logs` | `status` | ["Success", "Partial", "Failed"] | `Success` | `src/models/integrationRunLogModel.js` |
| internal-capa-references | `internal-capa-references` | `status` | `[]` | `null` | `src/models/InternalCAPAReference.js` |
| laboratory-records | `laboratory-records` | `processingStatus` | ["processing", "completed", "failed"] | `processing` | `src/models/labRecordModels.js` |
| marketplace_listings | `marketplace_listings` | `status` | ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] | `DRAFT` | `src/models/orgDiscoveryModels.js` |
| monitoring-signals | `monitoring-signals` | `status` | ["OPEN", "ACKED", "RESOLVED"] | `OPEN` | `src/models/monitoringSignalModel.js` |
| NotificationDeliveryLog | `notificationdeliverylogs` | `status` | ["sent", "failed"] | `sent` | `src/modules/notifications/models/notificationDeliveryLogModel.js` |
| NotificationOutbox | `notification_outbox` | `status` | ["PENDING", "SENT", "FAILED"] | `PENDING` | `src/models/notificationOutboxModel.js` |
| object_acl_grants | `object_acl_grants` | `status` | ["ACTIVE", "REVOKED", "EXPIRED"] | `ACTIVE` | `src/models/orgAccessModels.js` |
| onboarding_wizard_states | `onboarding_wizard_states` | `status` | ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DISMISSED"] | `NOT_STARTED` | `src/models/onboardingWizardStateModel.js` |
| org_catalog_items | `org_catalog_items` | `status` | ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] | `ACTIVE` | `src/models/orgDiscoveryModels.js` |
| org_claims | `org_claims` | `status` | ["PENDING", "ACTIVE", "REJECTED", "REVOKED"] | `PENDING` | `src/models/orgClaimModel.js` |
| org_sites | `org_sites` | `address.state` | `[]` | `` | `src/models/orgSiteModel.js` |
| org_sites | `org_sites` | `status` | ["ACTIVE", "INACTIVE", "PENDING_REVIEW", "CLOSED"] | `ACTIVE` | `src/models/orgSiteModel.js` |
| org_units | `org_units` | `status` | ["ACTIVE", "INACTIVE"] | `ACTIVE` | `src/models/orgUnitModel.js` |
| org_user_assignments | `org_user_assignments` | `status` | ["ACTIVE", "INACTIVE"] | `ACTIVE` | `src/models/orgUserAssignmentModel.js` |
| organization_migration_logs | `organization_migration_logs` | `status` | ["STARTED", "COMPLETED", "FAILED"] | `STARTED` | `src/models/organizationMigrationLogModel.js` |
| organizations | `organizations` | `headquarters.state` | `[]` | `` | `src/models/organizationModel.js` |
| organizations | `organizations` | `status` | ["ACTIVE", "INACTIVE", "PENDING_REVIEW", "MERGED"] | `ACTIVE` | `src/models/organizationModel.js` |
| phase-trackers | `phase-trackers` | `currentPhaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `null` | `src/models/phaseTrackerModel.js` |
| phase-trackers | `phase-trackers` | `phases` | `[]` | `{}` | `src/models/phaseTrackerModel.js` |
| phase-trackers | `phase-trackers` | `phases.$*` | `[]` | `null` | `src/models/phaseTrackerModel.js` |
| pre-audit-questionnaires | `pre-audit-questionnaires` | `status` | ["DRAFT", "SENT", "IN_PROGRESS", "SUBMITTED", "REVIEWED"] | `DRAFT` | `src/models/preAuditQuestionnaireModel.js` |
| product-site-mappings | `product-site-mappings` | `verificationStatus` | ["unverified", "claimed", "hawkeye_verified"] | `unverified` | `src/models/productSiteMappingModel.js` |
| product_evidence_links_v2 | `product_evidence_links_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `claimed` | `src/models/productCatalogV2Models.js` |
| product_merge_events_v2 | `product_merge_events_v2` | `status` | ["suggested", "approved", "rejected"] | `suggested` | `src/models/productCatalogV2Models.js` |
| product_provenance_events_v2 | `product_provenance_events_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `claimed` | `src/models/productCatalogV2Models.js` |
| product_refresh_runs_v2 | `product_refresh_runs_v2` | `status` | ["running", "completed", "failed", "blocked"] | `running` | `src/models/productCatalogV2Models.js` |
| product_review_queue_v2 | `product_review_queue_v2` | `status` | ["open", "in_progress", "resolved"] | `open` | `src/models/productCatalogV2Models.js` |
| public_actions | `public_actions` | `status` | `[]` | `null` | `src/models/publicIntelModels.js` |
| public_claim_requests | `public_claim_requests` | `status` | ["new", "in_review", "resolved"] | `new` | `src/models/publicIntelModels.js` |
| public_filings | `public_filings` | `status` | `[]` | `null` | `src/models/publicIntelModels.js` |
| public_sites | `public_sites` | `state` | `[]` | `null` | `src/models/publicIntelModels.js` |
| public_suppliers | `public_suppliers` | `claimed_status` | ["unclaimed", "claimed", "verified"] | `unclaimed` | `src/models/publicIntelModels.js` |
| qualification_cases | `qualification_cases` | `decision` | ["PENDING", "APPROVED", "CONDITIONAL", "REJECTED"] | `PENDING` | `src/models/qualificationModels.js` |
| qualification_cases | `qualification_cases` | `status` | ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "EXPIRED", "WITHDRAWN"] | `DRAFT` | `src/models/qualificationModels.js` |
| qualification_methods | `qualification_methods` | `status` | ["PLANNED", "IN_PROGRESS", "COMPLETED", "WAIVED"] | `PLANNED` | `src/models/qualificationModels.js` |
| questionnaire-artifacts | `questionnaire-artifacts` | `status` | ["DRAFT", "SENT", "IN_PROGRESS", "SUBMITTED", "REVIEWED", "CLOSED", "WAIVED"] | `DRAFT` | `src/models/questionnaireArtifactModel.js` |
| questionnaire-section-assignments | `questionnaire-section-assignments` | `status` | ["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "REOPENED", "REASSIGNED"] | `ASSIGNED` | `src/models/questionnaireSectionAssignmentModel.js` |
| questionnaireUploads | `questionnaireUploads` | `status` | ["uploaded", "processing", "ready", "failed"] | `uploaded` | `src/models/questionnaireUploadModel.js` |
| remote-sessions | `remote-sessions` | `status` | ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] | `SCHEDULED` | `src/models/remoteSessionModel.js` |
| report-instances | `report-instances` | `status` | ["draft", "final"] | `draft` | `src/models/reportInstanceModel.js` |
| ScheduleSlot | `scheduleslots` | `status` | ["candidate", "proposed", "held", "accepted", "confirmed", "expired", "rejected", "blocked"] | `candidate` | `src/models/scheduleSlotModel.js` |
| status-definitions | `status-definitions` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `null` | `src/models/statusDefinitionModel.js` |
| status-definitions | `status-definitions` | `statusCode` | `[]` | `null` | `src/models/statusDefinitionModel.js` |
| status-history | `status-histories` | `fromStatus` | ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"] | `NOT_STARTED` | `src/models/statusHistoryModel.js` |
| status-history | `status-histories` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `null` | `src/models/statusHistoryModel.js` |
| status-history | `status-histories` | `statusCode` | `[]` | `null` | `src/models/statusHistoryModel.js` |
| status-history | `status-histories` | `toStatus` | ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"] | `NOT_STARTED` | `src/models/statusHistoryModel.js` |
| status-trackers | `status-trackers` | `phaseKey` | ["INITIATED", "PREP", "PLANNING", "EXECUTION", "FINDINGS", "CAPA", "CLOSURE", "SURVEILLANCE"] | `null` | `src/models/statusTrackerModel.js` |
| status-trackers | `status-trackers` | `status` | ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED", "SKIPPED"] | `NOT_STARTED` | `src/models/statusTrackerModel.js` |
| status-trackers | `status-trackers` | `statusCode` | `[]` | `null` | `src/models/statusTrackerModel.js` |
| subscriptions | `subscriptions` | `status` | ["ACTIVE", "SUSPENDED", "CANCELLED"] | `ACTIVE` | `src/models/subscriptionModel.js` |
| supplier-profiles | `supplier-profiles` | `state` | `[]` | `null` | `src/models/supplierProfileModel.js` |
| supplier-profiles | `supplier-profiles` | `vendorRegistration.status` | ["DRAFT", "SUBMITTED"] | `DRAFT` | `src/models/supplierProfileModel.js` |
| supplier-sites | `supplier-sites` | `state` | `[]` | `null` | `src/models/supplierSiteDataModel.js` |
| supplier_product_claims_v2 | `supplier_product_claims_v2` | `claimStatus` | ["draft", "active", "inactive", "under_review", "rejected"] | `draft` | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `supplier_product_claims_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `claimed` | `src/models/productCatalogV2Models.js` |
| supplier_product_offers_v2 | `supplier_product_offers_v2` | `offerStatus` | ["draft", "active", "paused", "expired"] | `draft` | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `supplier_product_site_links_v2` | `verificationStatus` | ["claimed", "verified", "rejected", "review_required", "unverified"] | `claimed` | `src/models/productCatalogV2Models.js` |
| templates | `templates` | `phaseKey` | `[]` | `null` | `src/models/templateModel.js` |
| templates | `templates` | `status` | ["DRAFT", "PUBLISHED", "ARCHIVED"] | `DRAFT` | `src/models/templateModel.js` |
| Tenant | `tenants` | `status` | ["ACTIVE", "SUSPENDED"] | `ACTIVE` | `src/models/tenantModel.js` |
| trust_badges | `trust_badges` | `status` | ["ACTIVE", "EXPIRED", "REVOKED"] | `ACTIVE` | `src/models/orgDiscoveryModels.js` |
| users | `users` | `status` | ["ACTIVE", "DISABLED"] | `ACTIVE` | `src/models/userModel.js` |
| workflow_milestone_instances | `workflow_milestone_instances` | `status` | ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] | `NOT_STARTED` | `src/models/workflowMilestoneInstanceModel.js` |
