# Current DB Relationships

## Scope and Method
- Source base: declared Mongoose refs plus manual audit-flow reconstruction from controllers and services
- Purpose: map the current operational data model, not propose the target state

## Relationship Summary
The current system combines direct ObjectId references, embedded subdocuments, denormalized status projections, duplicated legacy and V2 workflow layers, and weak links that rely on conventions rather than strict integrity.

## Core Relationship Chains
- `audit-requests-master` -> `auditQuestions` -> responses -> `digilocker_question_evidence_maps` / `evidence` -> `compliance_runs` / `compliance_question_results` -> `audit-reports` -> `capas`
- `audit-requests-master` -> `audit-artifacts` -> `audit-artifact-versions`
- `audit-requests-master` -> `phase-trackers` / `status-trackers` / `workflow_milestone_instances` / `status-history`
- `Tenant` -> `users` -> role-specific profile records -> supplier sites/products -> audit participants

## Key Relationships
| Left | Linking field / bridge | Right | Cardinality | Notes |
|---|---|---|---|---|
| Tenant | `users.tenant_id` | users | 1:N | Tenant-scoped user population |
| users | `buyer-profiles.user_id` | buyer-profiles | 1:1-ish | Buyer profile extension |
| users | `supplier-profiles.user_id` | supplier-profiles | 1:1-ish | Supplier admin profile extension |
| users | `supplier-user-profiles.user_id` | supplier-user-profiles | 1:1-ish | Supplier subordinate profile extension |
| users | `auditor-profiles.user_id` | auditor-profiles | 1:1-ish | Auditor profile extension |
| users | `supplier-sites.user_id` | supplier-sites | 1:N | Supplier owns site master records |
| users | `supplier-master-products.user_id` | supplier-master-products | 1:N | Supplier owns legacy product records |
| supplier-master-products | `product-site-mappings.product_id` | product-site-mappings | 1:N | Links products to sites |
| supplier-sites | `product-site-mappings.site_id` | product-site-mappings | 1:N | Links sites to products |
| audit-requests-master | `auditQuestions.auditRequestId` | auditQuestions | 1:N | Generated execution questionnaire rows |
| templates | `templateQuestions.templateId` | templateQuestions | 1:N | Template header to template questions |
| templateQuestions | `auditQuestions.question_id` | auditQuestions | 1:N | Generated audit question lineage |
| audit-requests-master | `audit-artifacts.auditId` | audit-artifacts | 1:N | Audit artifact register |
| audit-artifacts | `audit-artifact-versions.artifactId` | audit-artifact-versions | 1:N | Artifact version history |
| audit-requests-master | `pre-audit-questionnaires.auditId` | pre-audit-questionnaires | 1:1 or 1:N | Pre-audit supplier questionnaire flow |
| audit-requests-master | `evidence.auditRequestId` | evidence | 1:N | Legacy evidence uploads |
| audit-requests-master | `digilocker_audit_evidence_checklists.auditId` | digilocker_audit_evidence_checklists | 1:1-ish | Derived evidence checklist |
| digilocker_documents | `digilocker_question_evidence_maps.documentId` | digilocker_question_evidence_maps | 1:N | DocVault evidence mapping |
| audit-requests-master | `digilocker_question_evidence_maps.auditId` | digilocker_question_evidence_maps | 1:N | Question-to-document attachment bridge |
| audit-requests-master | `audit-reports.auditRequestId` | audit-reports | 1:1-ish | Generated report |
| audit-requests-master | `capas.auditId` | capas | 1:N | CAPAs opened against audit/report observations |
| audit-requests-master | `compliance_runs.auditId` | compliance_runs | 1:N | Compliance run execution history |
| compliance_runs | `compliance_question_results.runId` | compliance_question_results | 1:N | Per-question verdicts |
| audit-requests-master | `compliance_response_snapshots.auditId` | compliance_response_snapshots | 1:N | Snapshot of response data used by compliance runs |
| audit-requests-master | `questionnaire-section-assignments.auditRequestId` | questionnaire-section-assignments | 1:N | Section-level supplier delegation |
| audit-requests-master | `phase-trackers.workflowEntityId` | phase-trackers | 1:1-ish | Phase tracker projection |
| audit-requests-master | `status-trackers.workflowEntityId` | status-trackers | 1:N | Status tracker projection |
| audit-requests-master | `workflow_milestone_instances.workflowEntityId` | workflow_milestone_instances | 1:N | Milestone runtime projection |
| audit-requests-master | `audit-events.auditId` | audit-events | 1:N | Event log |
| audit-requests-master | `audit-trails.auditId` | audit-trails | 1:N | Audit trail log |

## Many-to-Many Patterns
| Left <-> Right | Bridge | Notes |
|---|---|---|
| supplier-master-products <-> supplier-sites | `product-site-mappings` | Product manufactured at many sites; site produces many products |
| auditQuestions <-> digilocker_documents | `digilocker_question_evidence_maps` | Question supported by many docs; document can support many questions |
| audit-reports.observations <-> capas | `embedded array linkage + `capas.linkedObservationIds`` | Observation-to-CAPA cross-link |
| organizations <-> tenants | `org_claims` | A legal org can be claimed by one or more tenant contexts |
| organizations/users <-> org units/sites | `org_user_assignments` | User can hold multiple org assignments |

## Weak or Missing Links
| Source model | Field | Ref target | Problem |
|---|---|---|---|
| auditQuestions | `auditRequestId` | `AuditRequestMaster` | ref target does not match a registered model name |
| auditQuestions | `templateId` | `template` | ref target does not match a registered model name |
| AuditSchedule | `auditRequestId` | `AuditRequestMaster` | ref target does not match a registered model name |
| capas | `issueId` | `issues` | ref target does not match a registered model name |
| documents | `tenantId` | `tenants` | ref target does not match a registered model name |
| ScheduleEventLog | `auditRequestId` | `AuditRequestMaster` | ref target does not match a registered model name |
| ScheduleSlot | `auditRequestId` | `AuditRequestMaster` | ref target does not match a registered model name |
| SystemSetting | `updatedBy` | `User` | ref target does not match a registered model name |
| templateQuestions | `templateId` | `template` | ref target does not match a registered model name |
| users | `invitedBy` | `User` | ref target does not match a registered model name |
| workflow_milestone_definitions | `tenantId` | `tenant` | ref target does not match a registered model name |
| workflow_milestone_instances | `tenantId` | `tenant` | ref target does not match a registered model name |
| workflow_sla_configs | `tenantId` | `tenant` | ref target does not match a registered model name |

## Relationship Notes by Domain
### Audit request core
- `audit-requests-master` is the live source of truth for legacy GMP workflow orchestration.
- It holds direct party IDs, product/site scope, questionnaire state, request identifiers, and newer org/engagement/qualification links.
- It also carries denormalized timing/status fields that duplicate information that could otherwise live in task/milestone records.

### Questionnaire and responses
- `auditQuestions` stores both the prompt definition and the supplier/auditor response payloads.
- This tightly couples template structure, response data, follow-up state, and evidence linkage.

### Evidence and documents
- `evidence` is audit-native and directly bound to `auditRequestId`.
- DocVault is closer to a reusable evidence library but still has audit-oriented derivative collections and mappings.

### Compliance
- Compliance runs are derived from questionnaire snapshots, not directly from normalized workflow tasks.
- `compliance_response_snapshots` are effectively immutable snapshots.

### Reporting and CAPA
- `audit-reports` is effectively one report per audit request.
- Legacy observations are embedded inside the report document rather than normalized as first-class entities.

### Status and workflow tracking
- Workflow state exists in at least four places: `audit-requests-master`, `phase-trackers`, `status-trackers/status-history`, and `workflow_milestone_instances`.
- The assessment V2 layer introduces yet another runtime projection in `assessments`.

## Appendix A: Direct Ref Edge Inventory
| Source model | Field | Target ref | Resolved to model name? | Source file |
|---|---|---|---|---|
| access_grants | `granteeUserId` | `users` | yes | `src/models/accessGrantModel.js` |
| access_grants | `tenant_id` | `Tenant` | yes | `src/models/accessGrantModel.js` |
| admin_audit_logs | `actorUserId` | `users` | yes | `src/models/adminAuditLogModel.js` |
| admin_audit_logs | `tenant_id` | `Tenant` | yes | `src/models/adminAuditLogModel.js` |
| ai_action_metrics | `auditId` | `audit-requests-master` | yes | `src/models/aiActionMetricModel.js` |
| ai_action_metrics | `userId` | `users` | yes | `src/models/aiActionMetricModel.js` |
| api-master | `mergedIntoApiMasterId` | `api-master` | yes | `src/models/apiMasterModel.js` |
| api_public_manufacturers | `apiMasterId` | `api-master` | yes | `src/models/apiPublicManufacturerModel.js` |
| approval_requests | `approverUserId` | `users` | yes | `src/models/approvalRequestModel.js` |
| approval_requests | `requesterUserId` | `users` | yes | `src/models/approvalRequestModel.js` |
| approval_requests | `tenant_id` | `Tenant` | yes | `src/models/approvalRequestModel.js` |
| assessment-capas | `assessmentId` | `assessments` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `auditorId` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `buyerId` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `createdBy` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `engagementId` | `engagements` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `findingId` | `assessment-findings` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `ownerId` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `qualificationCaseId` | `qualification_cases` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `supplierId` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `tenantId` | `Tenant` | yes | `src/models/assessmentCapaModel.js` |
| assessment-capas | `updatedBy` | `users` | yes | `src/models/assessmentCapaModel.js` |
| assessment-evidence | `assessmentId` | `assessments` | yes | `src/models/assessmentEvidenceModel.js` |
| assessment-evidence | `tenantId` | `Tenant` | yes | `src/models/assessmentEvidenceModel.js` |
| assessment-evidence | `uploaderId` | `users` | yes | `src/models/assessmentEvidenceModel.js` |
| assessment-findings | `assessmentId` | `assessments` | yes | `src/models/assessmentFindingModel.js` |
| assessment-findings | `createdBy` | `users` | yes | `src/models/assessmentFindingModel.js` |
| assessment-findings | `tenantId` | `Tenant` | yes | `src/models/assessmentFindingModel.js` |
| assessment-findings | `updatedBy` | `users` | yes | `src/models/assessmentFindingModel.js` |
| assessments | `buyerOrgId` | `organizations` | yes | `src/models/assessmentModel.js` |
| assessments | `createdBy` | `users` | yes | `src/models/assessmentModel.js` |
| assessments | `engagementId` | `engagements` | yes | `src/models/assessmentModel.js` |
| assessments | `qualificationCaseId` | `qualification_cases` | yes | `src/models/assessmentModel.js` |
| assessments | `scope.buyerId` | `users` | yes | `src/models/assessmentModel.js` |
| assessments | `scope.supplierId` | `users` | yes | `src/models/assessmentModel.js` |
| assessments | `supplierOrgId` | `organizations` | yes | `src/models/assessmentModel.js` |
| assessments | `tenantId` | `Tenant` | yes | `src/models/assessmentModel.js` |
| audit-agendas | `auditId` | `audit-requests-master` | yes | `src/models/auditAgendaModel.js` |
| audit-agendas | `createdBy` | `users` | yes | `src/models/auditAgendaModel.js` |
| audit-agendas | `updatedBy` | `users` | yes | `src/models/auditAgendaModel.js` |
| audit-artifact-versions | `artifactId` | `audit-artifacts` | yes | `src/models/auditArtifactVersionModel.js` |
| audit-artifact-versions | `auditId` | `audit-requests-master` | yes | `src/models/auditArtifactVersionModel.js` |
| audit-artifact-versions | `createdBy` | `users` | yes | `src/models/auditArtifactVersionModel.js` |
| audit-artifacts | `auditId` | `audit-requests-master` | yes | `src/models/auditArtifactModel.js` |
| audit-artifacts | `createdBy` | `users` | yes | `src/models/auditArtifactModel.js` |
| audit-artifacts | `engagementId` | `engagements` | yes | `src/models/auditArtifactModel.js` |
| audit-artifacts | `qualificationCaseId` | `qualification_cases` | yes | `src/models/auditArtifactModel.js` |
| audit-artifacts | `updatedBy` | `users` | yes | `src/models/auditArtifactModel.js` |
| audit-cycle-templates | `tenantId` | `Tenant` | yes | `src/models/auditCycleTemplateModel.js` |
| audit-events | `actorId` | `users` | yes | `src/models/auditEventModel.js` |
| audit-events | `auditId` | `audit-requests-master` | yes | `src/models/auditEventModel.js` |
| audit-notes | `auditRequestId` | `audit-requests-master` | yes | `src/models/auditNoteModel.js` |
| audit-notes | `authorId` | `users` | yes | `src/models/auditNoteModel.js` |
| audit-notes | `tenantId` | `Tenant` | yes | `src/models/auditNoteModel.js` |
| audit-plans | `auditId` | `audit-requests-master` | yes | `src/models/auditPlanModel.js` |
| audit-plans | `createdBy` | `users` | yes | `src/models/auditPlanModel.js` |
| audit-plans | `updatedBy` | `users` | yes | `src/models/auditPlanModel.js` |
| audit-reports | `auditRequestId` | `audit-requests-master` | yes | `src/models/auditReportModel.js` |
| audit-reports | `buyerOrgId` | `organizations` | yes | `src/models/auditReportModel.js` |
| audit-reports | `createdBy` | `users` | yes | `src/models/auditReportModel.js` |
| audit-reports | `engagementId` | `engagements` | yes | `src/models/auditReportModel.js` |
| audit-reports | `qualificationCaseId` | `qualification_cases` | yes | `src/models/auditReportModel.js` |
| audit-reports | `reportTemplateId` | `report-templates` | yes | `src/models/auditReportModel.js` |
| audit-reports | `supplierOrgId` | `organizations` | yes | `src/models/auditReportModel.js` |
| audit-reports | `updatedBy` | `users` | yes | `src/models/auditReportModel.js` |
| audit-requests-master | `archivedBy` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `assessmentTypeId` | `assessment-types` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `auditor_id` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `auditorDecisionBy` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `awardedQuoteId` | `audit-rfq-quotes` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `buyerOrgId` | `organizations` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `create_by_buyer_id` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `engagementId` | `engagements` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `qualificationCaseId` | `qualification_cases` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `rfqId` | `audit-rfqs` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `site_id` | `supplier-sites` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplier_id` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplier_product_id` | `supplier-master-products` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplier_product_ids` | `supplier-master-products` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplierDecisionBy` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplierOrgId` | `organizations` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-requests-master | `supplierVisibleBy` | `users` | yes | `src/models/auditRequestsMasterModel.js` |
| audit-rfq-quotes | `auditorUserId` | `users` | yes | `src/models/auditRfqQuoteModel.js` |
| audit-rfq-quotes | `rfqId` | `audit-rfqs` | yes | `src/models/auditRfqQuoteModel.js` |
| audit-rfq-threads | `rfqId` | `audit-rfqs` | yes | `src/models/auditRfqThreadModel.js` |
| audit-rfqs | `auditRequestId` | `audit-requests-master` | yes | `src/models/auditRfqModel.js` |
| audit-rfqs | `createdBy` | `users` | yes | `src/models/auditRfqModel.js` |
| audit-rfqs | `productIds` | `supplier-master-products` | yes | `src/models/auditRfqModel.js` |
| audit-rfqs | `siteId` | `supplier-sites` | yes | `src/models/auditRfqModel.js` |
| audit-rfqs | `supplierOrgId` | `users` | yes | `src/models/auditRfqModel.js` |
| audit-rfqs | `updatedBy` | `users` | yes | `src/models/auditRfqModel.js` |
| audit-trails | `actorId` | `users` | yes | `src/models/auditTrailModel.js` |
| audit-trails | `auditId` | `audit-requests-master` | yes | `src/models/auditTrailModel.js` |
| audit_request_aliases | `requestObjectId` | `audit-requests-master` | yes | `src/models/auditRequestAliasModel.js` |
| auditor-profiles | `tenant_id` | `Tenant` | yes | `src/models/auditorProfileModel.js` |
| auditor-profiles | `user_id` | `users` | yes | `src/models/auditorProfileModel.js` |
| auditor_affiliations | `approvedBy` | `users` | yes | `src/models/auditorAffiliationModel.js` |
| auditor_affiliations | `auditorProfileId` | `auditor-profiles` | yes | `src/models/auditorAffiliationModel.js` |
| auditor_affiliations | `invitedBy` | `users` | yes | `src/models/auditorAffiliationModel.js` |
| auditor_affiliations | `orgTenantId` | `Tenant` | yes | `src/models/auditorAffiliationModel.js` |
| auditQuestions | `auditRequestId` | `AuditRequestMaster` | no | `src/models/auditQuestionsModels.js` |
| auditQuestions | `categoryId` | `categories` | yes | `src/models/auditQuestionsModels.js` |
| auditQuestions | `lastUpdatedByUserId` | `users` | yes | `src/models/auditQuestionsModels.js` |
| auditQuestions | `question_id` | `templateQuestions` | yes | `src/models/auditQuestionsModels.js` |
| auditQuestions | `submittedByUserId` | `users` | yes | `src/models/auditQuestionsModels.js` |
| auditQuestions | `templateId` | `template` | no | `src/models/auditQuestionsModels.js` |
| AuditSchedule | `auditRequestId` | `AuditRequestMaster` | no | `src/models/auditScheduleModel.js` |
| AuditSchedule | `confirmedSlotId` | `ScheduleSlot` | yes | `src/models/auditScheduleModel.js` |
| AuditSchedule | `createdBy` | `users` | yes | `src/models/auditScheduleModel.js` |
| AvailabilityBlock | `createdBy` | `users` | yes | `src/models/availabilityBlockModel.js` |
| buyer-profiles | `tenant_id` | `Tenant` | yes | `src/models/buyerProfileModel.js` |
| buyer-profiles | `user_id` | `users` | yes | `src/models/buyerProfileModel.js` |
| buyer-risk-profiles | `buyerTenantId` | `Tenant` | yes | `src/models/BuyerRiskProfile.js` |
| buyer-risk-profiles | `updatedBy` | `users` | yes | `src/models/BuyerRiskProfile.js` |
| capa-risk-indicators | `supplierId` | `users` | yes | `src/models/CAPARiskIndicator.js` |
| capa-risk-indicators | `tenantId` | `Tenant` | yes | `src/models/CAPARiskIndicator.js` |
| capa-v2 | `auditId` | `audit-requests-master` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `auditorId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `buyerId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `latestMetricSnapshotId` | `capa-v2-metric-snapshots` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `ownerUserId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `productId` | `supplier-master-products` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `siteId` | `supplier-sites` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `sourceCandidateId` | `capa-v2-candidates` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `sourceIntakeId` | `capa-v2-intakes` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `sourceTriageId` | `capa-v2-triage` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `supplierId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2 | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `actionPlanId` | `capa-v2-action-plans` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `completedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `ownerUserId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-items | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-plans | `approvedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-plans | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-plans | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-action-plans | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-approvals | `approverUserId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-approvals | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-approvals | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `auditId` | `audit-requests-master` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `auditorId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `buyerId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `linkedCapaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `productId` | `supplier-master-products` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `reviewedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `siteId` | `supplier-sites` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `supplierId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-candidates | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-comments | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-comments | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-effectiveness-checks | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-effectiveness-checks | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-effectiveness-checks | `reviewedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-effectiveness-checks | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-implementation-evidence | `actionItemId` | `capa-v2-action-items` | yes | `src/models/capaV2Models.js` |
| capa-v2-implementation-evidence | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-implementation-evidence | `uploadedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `auditId` | `audit-requests-master` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `auditorId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `buyerId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `candidateId` | `capa-v2-candidates` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `productId` | `supplier-master-products` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `siteId` | `supplier-sites` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `submittedForTriageBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `supplierId` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-intakes | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-investigations | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-investigations | `completedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-investigations | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-investigations | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-metric-snapshots | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-risk-assessments | `assessedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-risk-assessments | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-root-causes | `approvedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-root-causes | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-root-causes | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-root-causes | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-similarity-links | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-similarity-links | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-similarity-links | `relatedCapaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-source-links | `auditId` | `audit-requests-master` | yes | `src/models/capaV2Models.js` |
| capa-v2-source-links | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-source-links | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-source-links | `questionId` | `auditQuestions` | yes | `src/models/capaV2Models.js` |
| capa-v2-status-history | `capaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `auditId` | `audit-requests-master` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `candidateId` | `capa-v2-candidates` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `createdBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `decidedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `intakeId` | `capa-v2-intakes` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `linkedCapaId` | `capa-v2` | yes | `src/models/capaV2Models.js` |
| capa-v2-triage | `updatedBy` | `users` | yes | `src/models/capaV2Models.js` |
| capas | `auditId` | `audit-requests-master` | yes | `src/models/capaModel.js` |
| capas | `auditorId` | `users` | yes | `src/models/capaModel.js` |
| capas | `buyerId` | `users` | yes | `src/models/capaModel.js` |
| capas | `createdBy` | `users` | yes | `src/models/capaModel.js` |
| capas | `engagementId` | `engagements` | yes | `src/models/capaModel.js` |
| capas | `findingId` | `assessment-findings` | yes | `src/models/capaModel.js` |
| capas | `issueId` | `issues` | no | `src/models/capaModel.js` |
| capas | `ownerId` | `users` | yes | `src/models/capaModel.js` |
| capas | `qualificationCaseId` | `qualification_cases` | yes | `src/models/capaModel.js` |
| capas | `supplierId` | `users` | yes | `src/models/capaModel.js` |
| capas | `updatedBy` | `users` | yes | `src/models/capaModel.js` |
| catalog_product_variants_v2 | `catalogProductId` | `catalog_products_v2` | yes | `src/models/productCatalogV2Models.js` |
| compliance-event-canonical | `connectionId` | `integration-connections` | yes | `src/models/complianceEventCanonicalModel.js` |
| compliance-event-canonical | `supplierId` | `users` | yes | `src/models/complianceEventCanonicalModel.js` |
| compliance-event-canonical | `tenantId` | `Tenant` | yes | `src/models/complianceEventCanonicalModel.js` |
| compliance-event-raw | `connectionId` | `integration-connections` | yes | `src/models/complianceEventRawModel.js` |
| compliance-event-raw | `tenantId` | `Tenant` | yes | `src/models/complianceEventRawModel.js` |
| compliance-standards | `tenantId` | `Tenant` | yes | `src/models/complianceStandardModel.js` |
| compliance_claim_records_v2 | `claimId` | `supplier_product_claims_v2` | yes | `src/models/productCatalogV2Models.js` |
| compliance_claim_records_v2 | `offerId` | `supplier_product_offers_v2` | yes | `src/models/productCatalogV2Models.js` |
| compliance_guideline_documents | `createdBy` | `users` | yes | `src/models/complianceGuidelineDocumentModel.js` |
| compliance_guideline_documents | `tenantId` | `Tenant` | yes | `src/models/complianceGuidelineDocumentModel.js` |
| compliance_guideline_documents | `updatedBy` | `users` | yes | `src/models/complianceGuidelineDocumentModel.js` |
| compliance_guideline_vectors | `createdBy` | `users` | yes | `src/models/complianceGuidelineVectorModel.js` |
| compliance_guideline_vectors | `documentId` | `compliance_guideline_documents` | yes | `src/models/complianceGuidelineVectorModel.js` |
| compliance_guideline_vectors | `tenantId` | `Tenant` | yes | `src/models/complianceGuidelineVectorModel.js` |
| compliance_guideline_vectors | `updatedBy` | `users` | yes | `src/models/complianceGuidelineVectorModel.js` |
| compliance_question_results | `auditId` | `audit-requests-master` | yes | `src/models/complianceQuestionResultModel.js` |
| compliance_question_results | `runId` | `compliance_runs` | yes | `src/models/complianceQuestionResultModel.js` |
| compliance_question_results | `tenantId` | `Tenant` | yes | `src/models/complianceQuestionResultModel.js` |
| compliance_question_results | `updatedBy` | `users` | yes | `src/models/complianceQuestionResultModel.js` |
| compliance_response_snapshots | `auditId` | `audit-requests-master` | yes | `src/models/complianceResponseSnapshotModel.js` |
| compliance_response_snapshots | `createdBy` | `users` | yes | `src/models/complianceResponseSnapshotModel.js` |
| compliance_response_snapshots | `tenantId` | `Tenant` | yes | `src/models/complianceResponseSnapshotModel.js` |
| compliance_runs | `auditId` | `audit-requests-master` | yes | `src/models/complianceRunModel.js` |
| compliance_runs | `createdBy` | `users` | yes | `src/models/complianceRunModel.js` |
| compliance_runs | `finalizedBy` | `users` | yes | `src/models/complianceRunModel.js` |
| compliance_runs | `responseSnapshotId` | `compliance_response_snapshots` | yes | `src/models/complianceRunModel.js` |
| compliance_runs | `tenantId` | `Tenant` | yes | `src/models/complianceRunModel.js` |
| compliance_standard_registry | `createdBy` | `users` | yes | `src/models/complianceStandardRegistryModel.js` |
| compliance_standard_registry | `tenantId` | `Tenant` | yes | `src/models/complianceStandardRegistryModel.js` |
| compliance_standard_registry | `updatedBy` | `users` | yes | `src/models/complianceStandardRegistryModel.js` |
| consent_records | `engagementId` | `engagements` | yes | `src/models/orgAccessModels.js` |
| consent_records | `grantedByUserId` | `users` | yes | `src/models/orgAccessModels.js` |
| consent_records | `orgId` | `organizations` | yes | `src/models/orgAccessModels.js` |
| consent_records | `revokedByUserId` | `users` | yes | `src/models/orgAccessModels.js` |
| consent_records | `tenantId` | `Tenant` | yes | `src/models/orgAccessModels.js` |
| controls | `tenantId` | `Tenant` | yes | `src/models/controlModel.js` |
| customAudit-question | `supplier_id` | `users` | yes | `src/models/customAuditQuestionModels.js` |
| digilocker_access_policies | `auditId` | `audit-requests-master` | yes | `src/models/digilockerAccessPolicyModel.js` |
| digilocker_access_policies | `documentId` | `digilocker_documents` | yes | `src/models/digilockerAccessPolicyModel.js` |
| digilocker_access_policies | `tenantId` | `Tenant` | yes | `src/models/digilockerAccessPolicyModel.js` |
| digilocker_audit_events | `actorUserId` | `users` | yes | `src/models/digilockerAuditTrailEventModel.js` |
| digilocker_audit_events | `tenantId` | `Tenant` | yes | `src/models/digilockerAuditTrailEventModel.js` |
| digilocker_audit_evidence_checklists | `auditId` | `audit-requests-master` | yes | `src/models/digilockerAuditEvidenceChecklistModel.js` |
| digilocker_audit_evidence_checklists | `productId` | `supplier-master-products` | yes | `src/models/digilockerAuditEvidenceChecklistModel.js` |
| digilocker_audit_evidence_checklists | `siteId` | `supplier-sites` | yes | `src/models/digilockerAuditEvidenceChecklistModel.js` |
| digilocker_audit_evidence_checklists | `tenantId` | `Tenant` | yes | `src/models/digilockerAuditEvidenceChecklistModel.js` |
| digilocker_document_extractions | `documentId` | `digilocker_documents` | yes | `src/models/digilockerDocumentExtractionModel.js` |
| digilocker_document_extractions | `tenantId` | `Tenant` | yes | `src/models/digilockerDocumentExtractionModel.js` |
| digilocker_document_extractions | `versionId` | `digilocker_document_versions` | yes | `src/models/digilockerDocumentExtractionModel.js` |
| digilocker_document_versions | `documentId` | `digilocker_documents` | yes | `src/models/digilockerDocumentVersionModel.js` |
| digilocker_document_versions | `tenantId` | `Tenant` | yes | `src/models/digilockerDocumentVersionModel.js` |
| digilocker_document_versions | `uploadedBy` | `users` | yes | `src/models/digilockerDocumentVersionModel.js` |
| digilocker_documents | `currentVersionId` | `digilocker_document_versions` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `engagementId` | `engagements` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `ownerOrgId` | `organizations` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `ownerUserId` | `users` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `productId` | `supplier-master-products` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `qualificationCaseId` | `qualification_cases` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `siteId` | `supplier-sites` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `supplierOrgId` | `users` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_documents | `tenantId` | `Tenant` | yes | `src/models/digilockerDocumentModel.js` |
| digilocker_question_evidence_maps | `auditId` | `audit-requests-master` | yes | `src/models/digilockerQuestionEvidenceMapModel.js` |
| digilocker_question_evidence_maps | `createdBy` | `users` | yes | `src/models/digilockerQuestionEvidenceMapModel.js` |
| digilocker_question_evidence_maps | `documentId` | `digilocker_documents` | yes | `src/models/digilockerQuestionEvidenceMapModel.js` |
| digilocker_question_evidence_maps | `tenantId` | `Tenant` | yes | `src/models/digilockerQuestionEvidenceMapModel.js` |
| digilocker_question_evidence_maps | `versionId` | `digilocker_document_versions` | yes | `src/models/digilockerQuestionEvidenceMapModel.js` |
| document_access_events | `actorUserId` | `users` | yes | `src/models/accessEventModel.js` |
| document_access_events | `documentViewId` | `document_views` | yes | `src/models/accessEventModel.js` |
| document_links | `auditId` | `audit-requests-master` | yes | `src/models/orgAccessModels.js` |
| document_links | `createdBy` | `users` | yes | `src/models/orgAccessModels.js` |
| document_links | `engagementId` | `engagements` | yes | `src/models/orgAccessModels.js` |
| document_links | `qualificationCaseId` | `qualification_cases` | yes | `src/models/orgAccessModels.js` |
| document_share_policies | `documentViewId` | `document_views` | yes | `src/models/sharePolicyModel.js` |
| document_views | `createdBy` | `users` | yes | `src/models/documentViewModel.js` |
| document_views | `documentId` | `documents` | yes | `src/models/documentViewModel.js` |
| documents | `engagementId` | `engagements` | yes | `src/models/documentModel.js` |
| documents | `ownerOrgId` | `organizations` | yes | `src/models/documentModel.js` |
| documents | `qualificationCaseId` | `qualification_cases` | yes | `src/models/documentModel.js` |
| documents | `tenantId` | `tenants` | no | `src/models/documentModel.js` |
| documents | `uploaderUserId` | `users` | yes | `src/models/documentModel.js` |
| engagement_participants | `createdBy` | `users` | yes | `src/models/engagementModels.js` |
| engagement_participants | `engagementId` | `engagements` | yes | `src/models/engagementModels.js` |
| engagement_participants | `orgId` | `organizations` | yes | `src/models/engagementModels.js` |
| engagement_participants | `tenantId` | `Tenant` | yes | `src/models/engagementModels.js` |
| engagement_participants | `updatedBy` | `users` | yes | `src/models/engagementModels.js` |
| engagement_participants | `userId` | `users` | yes | `src/models/engagementModels.js` |
| engagements | `buyerOrgId` | `organizations` | yes | `src/models/engagementModels.js` |
| engagements | `createdBy` | `users` | yes | `src/models/engagementModels.js` |
| engagements | `ownerTenantId` | `Tenant` | yes | `src/models/engagementModels.js` |
| engagements | `scope.catalogItemIds` | `org_catalog_items` | yes | `src/models/engagementModels.js` |
| engagements | `scope.productIds` | `supplier-master-products` | yes | `src/models/engagementModels.js` |
| engagements | `scope.siteIds` | `org_sites` | yes | `src/models/engagementModels.js` |
| engagements | `supplierOrgId` | `organizations` | yes | `src/models/engagementModels.js` |
| engagements | `updatedBy` | `users` | yes | `src/models/engagementModels.js` |
| evidence | `auditRequestId` | `audit-requests-master` | yes | `src/models/evidenceModel.js` |
| evidence | `tenantId` | `Tenant` | yes | `src/models/evidenceModel.js` |
| evidence | `uploaderId` | `users` | yes | `src/models/evidenceModel.js` |
| evidence-findings | `createdBy` | `users` | yes | `src/models/EvidenceFinding.js` |
| evidence-findings | `supplierId` | `users` | yes | `src/models/EvidenceFinding.js` |
| evidence_pages | `auditRequestId` | `audit-requests-master` | yes | `src/models/evidencePageModel.js` |
| evidence_pages | `tenantId` | `Tenant` | yes | `src/models/evidencePageModel.js` |
| evidence_pages | `uploadId` | `evidence_uploads` | yes | `src/models/evidencePageModel.js` |
| evidence_uploads | `auditRequestId` | `audit-requests-master` | yes | `src/models/evidenceUploadModel.js` |
| evidence_uploads | `tenantId` | `Tenant` | yes | `src/models/evidenceUploadModel.js` |
| evidence_uploads | `uploaderId` | `users` | yes | `src/models/evidenceUploadModel.js` |
| external-audits | `auditorId` | `users` | yes | `src/models/ExternalAudit.js` |
| external-audits | `supplierId` | `users` | yes | `src/models/ExternalAudit.js` |
| external-audits | `tenantId` | `Tenant` | yes | `src/models/ExternalAudit.js` |
| external-capas | `auditId` | `audit-requests-master` | yes | `src/models/ExternalCAPA.js` |
| external-capas | `supplierId` | `users` | yes | `src/models/ExternalCAPA.js` |
| external-capas | `tenantId` | `Tenant` | yes | `src/models/ExternalCAPA.js` |
| GovernanceAuditLog | `actorUserId` | `users` | yes | `src/models/governanceAuditLogModel.js` |
| GovernanceAuditLog | `tenantId` | `Tenant` | yes | `src/models/governanceAuditLogModel.js` |
| integration-audit-logs | `actorUserId` | `users` | yes | `src/models/integrationAuditLogModel.js` |
| integration-audit-logs | `tenantId` | `Tenant` | yes | `src/models/integrationAuditLogModel.js` |
| integration-connections | `createdBy` | `users` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `mappingConfigId` | `integration-mapping-configs` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `ownerOrgId` | `organizations` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `ownerUserId` | `users` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `sharedOrgIds` | `organizations` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `supplierId` | `users` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `tenantId` | `Tenant` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `updatedBy` | `users` | yes | `src/models/integrationConnectionModel.js` |
| integration-connections | `visibilityPolicy.shareWithBuyerIds` | `users` | yes | `src/models/integrationConnectionModel.js` |
| integration-mapping-configs | `connectionId` | `integration-connections` | yes | `src/models/integrationMappingConfigModel.js` |
| integration-mapping-configs | `tenantId` | `Tenant` | yes | `src/models/integrationMappingConfigModel.js` |
| integration-run-logs | `connectionId` | `integration-connections` | yes | `src/models/integrationRunLogModel.js` |
| integration-run-logs | `tenantId` | `Tenant` | yes | `src/models/integrationRunLogModel.js` |
| internal-capa-references | `connectionId` | `integration-connections` | yes | `src/models/InternalCAPAReference.js` |
| internal-capa-references | `sourceAuditId` | `audit-requests-master` | yes | `src/models/InternalCAPAReference.js` |
| internal-capa-references | `supplierId` | `users` | yes | `src/models/InternalCAPAReference.js` |
| internal-capa-references | `tenantId` | `Tenant` | yes | `src/models/InternalCAPAReference.js` |
| KbChunk | `articleId` | `KbArticle` | yes | `src/models/kbChunkModel.js` |
| laboratory-records | `supplier_id` | `users` | yes | `src/models/labRecordModels.js` |
| marketplace_listings | `createdBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| marketplace_listings | `orgId` | `organizations` | yes | `src/models/orgDiscoveryModels.js` |
| marketplace_listings | `ownerTenantId` | `Tenant` | yes | `src/models/orgDiscoveryModels.js` |
| marketplace_listings | `updatedBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| monitoring-signals | `auditId` | `audit-requests-master` | yes | `src/models/monitoringSignalModel.js` |
| monitoring-signals | `createdBy` | `users` | yes | `src/models/monitoringSignalModel.js` |
| monitoring-signals | `productId` | `supplier-master-products` | yes | `src/models/monitoringSignalModel.js` |
| monitoring-signals | `siteId` | `supplier-sites` | yes | `src/models/monitoringSignalModel.js` |
| monitoring-signals | `updatedBy` | `users` | yes | `src/models/monitoringSignalModel.js` |
| Notification | `folderId` | `NotificationFolder` | yes | `src/modules/notifications/models/notificationModel.js` |
| Notification | `labelIds` | `NotificationLabel` | yes | `src/modules/notifications/models/notificationModel.js` |
| Notification | `recipientUserId` | `users` | yes | `src/modules/notifications/models/notificationModel.js` |
| Notification | `tenantId` | `Tenant` | yes | `src/modules/notifications/models/notificationModel.js` |
| NotificationDeliveryLog | `notificationId` | `Notification` | yes | `src/modules/notifications/models/notificationDeliveryLogModel.js` |
| NotificationDeliveryLog | `tenantId` | `Tenant` | yes | `src/modules/notifications/models/notificationDeliveryLogModel.js` |
| NotificationFolder | `tenantId` | `Tenant` | yes | `src/modules/notifications/models/notificationFolderModel.js` |
| NotificationFolder | `userId` | `users` | yes | `src/modules/notifications/models/notificationFolderModel.js` |
| NotificationLabel | `tenantId` | `Tenant` | yes | `src/modules/notifications/models/notificationLabelModel.js` |
| NotificationLabel | `userId` | `users` | yes | `src/modules/notifications/models/notificationLabelModel.js` |
| NotificationOutbox | `tenantId` | `Tenant` | yes | `src/models/notificationOutboxModel.js` |
| NotificationOutbox | `userId` | `users` | yes | `src/models/notificationOutboxModel.js` |
| NotificationPolicy | `createdBy` | `users` | yes | `src/models/notificationPolicyModel.js` |
| NotificationPolicy | `tenantId` | `Tenant` | yes | `src/models/notificationPolicyModel.js` |
| NotificationPreference | `tenantId` | `Tenant` | yes | `src/modules/notifications/models/notificationPreferenceModel.js` |
| NotificationPreference | `userId` | `users` | yes | `src/modules/notifications/models/notificationPreferenceModel.js` |
| object_acl_grants | `createdBy` | `users` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `engagementId` | `engagements` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `granteeOrgId` | `organizations` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `granteeTenantId` | `Tenant` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `granteeUserId` | `users` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `tenantId` | `Tenant` | yes | `src/models/orgAccessModels.js` |
| object_acl_grants | `updatedBy` | `users` | yes | `src/models/orgAccessModels.js` |
| onboarding_wizard_states | `userId` | `users` | yes | `src/models/onboardingWizardStateModel.js` |
| org_catalog_items | `apiMasterId` | `api-master` | yes | `src/models/orgDiscoveryModels.js` |
| org_catalog_items | `createdBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| org_catalog_items | `orgId` | `organizations` | yes | `src/models/orgDiscoveryModels.js` |
| org_catalog_items | `siteIds` | `org_sites` | yes | `src/models/orgDiscoveryModels.js` |
| org_catalog_items | `updatedBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| org_claims | `approvedByUserId` | `users` | yes | `src/models/orgClaimModel.js` |
| org_claims | `claimedByUserId` | `users` | yes | `src/models/orgClaimModel.js` |
| org_claims | `orgId` | `organizations` | yes | `src/models/orgClaimModel.js` |
| org_claims | `tenantId` | `Tenant` | yes | `src/models/orgClaimModel.js` |
| org_sites | `createdBy` | `users` | yes | `src/models/orgSiteModel.js` |
| org_sites | `orgId` | `organizations` | yes | `src/models/orgSiteModel.js` |
| org_sites | `updatedBy` | `users` | yes | `src/models/orgSiteModel.js` |
| org_units | `createdBy` | `users` | yes | `src/models/orgUnitModel.js` |
| org_units | `orgId` | `organizations` | yes | `src/models/orgUnitModel.js` |
| org_units | `parentUnitId` | `org_units` | yes | `src/models/orgUnitModel.js` |
| org_units | `siteId` | `org_sites` | yes | `src/models/orgUnitModel.js` |
| org_units | `updatedBy` | `users` | yes | `src/models/orgUnitModel.js` |
| org_user_assignments | `createdBy` | `users` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `managerUserId` | `users` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `orgId` | `organizations` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `orgUnitId` | `org_units` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `siteId` | `org_sites` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `tenantId` | `Tenant` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `updatedBy` | `users` | yes | `src/models/orgUserAssignmentModel.js` |
| org_user_assignments | `userId` | `users` | yes | `src/models/orgUserAssignmentModel.js` |
| organization_migration_logs | `tenantId` | `Tenant` | yes | `src/models/organizationMigrationLogModel.js` |
| organizations | `createdBy` | `users` | yes | `src/models/organizationModel.js` |
| organizations | `updatedBy` | `users` | yes | `src/models/organizationModel.js` |
| phase-trackers | `assessmentTypeId` | `assessment-types` | yes | `src/models/phaseTrackerModel.js` |
| phase-trackers | `workflowEntityId` | `audit-requests-master` | yes | `src/models/phaseTrackerModel.js` |
| pre-audit-questionnaires | `auditId` | `audit-requests-master` | yes | `src/models/preAuditQuestionnaireModel.js` |
| pre-audit-questionnaires | `createdBy` | `users` | yes | `src/models/preAuditQuestionnaireModel.js` |
| pre-audit-questionnaires | `submittedBy` | `users` | yes | `src/models/preAuditQuestionnaireModel.js` |
| pre-audit-questionnaires | `updatedBy` | `users` | yes | `src/models/preAuditQuestionnaireModel.js` |
| product-site-mappings | `apiMasterId` | `api-master` | yes | `src/models/productSiteMappingModel.js` |
| product-site-mappings | `product_id` | `supplier-master-products` | yes | `src/models/productSiteMappingModel.js` |
| product-site-mappings | `site_id` | `supplier-sites` | yes | `src/models/productSiteMappingModel.js` |
| product-site-mappings | `user_id` | `users` | yes | `src/models/productSiteMappingModel.js` |
| product_evidence_links_v2 | `claimId` | `supplier_product_claims_v2` | yes | `src/models/productCatalogV2Models.js` |
| product_evidence_links_v2 | `complianceRecordId` | `compliance_claim_records_v2` | yes | `src/models/productCatalogV2Models.js` |
| product_evidence_links_v2 | `digilockerDocumentId` | `digilocker_documents` | yes | `src/models/productCatalogV2Models.js` |
| product_evidence_links_v2 | `genericDocumentId` | `documents` | yes | `src/models/productCatalogV2Models.js` |
| product_evidence_links_v2 | `offerId` | `supplier_product_offers_v2` | yes | `src/models/productCatalogV2Models.js` |
| product_evidence_links_v2 | `tenantId` | `Tenant` | yes | `src/models/productCatalogV2Models.js` |
| product_merge_events_v2 | `mergedProductId` | `catalog_products_v2` | yes | `src/models/productCatalogV2Models.js` |
| product_merge_events_v2 | `primaryProductId` | `catalog_products_v2` | yes | `src/models/productCatalogV2Models.js` |
| product_merge_events_v2 | `reviewedBy` | `users` | yes | `src/models/productCatalogV2Models.js` |
| product_review_queue_v2 | `assignedTo` | `users` | yes | `src/models/productCatalogV2Models.js` |
| public_actions | `site_id` | `public_sites` | yes | `src/models/publicIntelModels.js` |
| public_actions | `supplier_id` | `public_suppliers` | yes | `src/models/publicIntelModels.js` |
| public_claim_requests | `supplier_id` | `public_suppliers` | yes | `src/models/publicIntelModels.js` |
| public_filings | `site_id` | `public_sites` | yes | `src/models/publicIntelModels.js` |
| public_filings | `supplier_id` | `public_suppliers` | yes | `src/models/publicIntelModels.js` |
| public_inspections | `site_id` | `public_sites` | yes | `src/models/publicIntelModels.js` |
| public_inspections | `supplier_id` | `public_suppliers` | yes | `src/models/publicIntelModels.js` |
| public_sites | `supplier_id` | `public_suppliers` | yes | `src/models/publicIntelModels.js` |
| qualification_cases | `buyerOrgId` | `organizations` | yes | `src/models/qualificationModels.js` |
| qualification_cases | `createdBy` | `users` | yes | `src/models/qualificationModels.js` |
| qualification_cases | `engagementId` | `engagements` | yes | `src/models/qualificationModels.js` |
| qualification_cases | `ownerTenantId` | `Tenant` | yes | `src/models/qualificationModels.js` |
| qualification_cases | `supplierOrgId` | `organizations` | yes | `src/models/qualificationModels.js` |
| qualification_cases | `updatedBy` | `users` | yes | `src/models/qualificationModels.js` |
| qualification_methods | `approvedByUserId` | `users` | yes | `src/models/qualificationModels.js` |
| qualification_methods | `performedByUserId` | `users` | yes | `src/models/qualificationModels.js` |
| qualification_methods | `qualificationCaseId` | `qualification_cases` | yes | `src/models/qualificationModels.js` |
| questionnaire-artifacts | `assessmentId` | `assessments` | yes | `src/models/questionnaireArtifactModel.js` |
| questionnaire-artifacts | `participants.auditorId` | `users` | yes | `src/models/questionnaireArtifactModel.js` |
| questionnaire-artifacts | `participants.buyerId` | `users` | yes | `src/models/questionnaireArtifactModel.js` |
| questionnaire-artifacts | `participants.supplierId` | `users` | yes | `src/models/questionnaireArtifactModel.js` |
| questionnaire-artifacts | `tenantId` | `Tenant` | yes | `src/models/questionnaireArtifactModel.js` |
| questionnaire-section-assignments | `assignedByUserId` | `users` | yes | `src/models/questionnaireSectionAssignmentModel.js` |
| questionnaire-section-assignments | `assignedToUserId` | `users` | yes | `src/models/questionnaireSectionAssignmentModel.js` |
| questionnaire-section-assignments | `auditRequestId` | `audit-requests-master` | yes | `src/models/questionnaireSectionAssignmentModel.js` |
| questionnaireUploads | `assessmentTypeId` | `assessment-types` | yes | `src/models/questionnaireUploadModel.js` |
| questionnaireUploads | `uploadedBy` | `users` | yes | `src/models/questionnaireUploadModel.js` |
| remote-sessions | `auditId` | `audit-requests-master` | yes | `src/models/remoteSessionModel.js` |
| remote-sessions | `createdBy` | `users` | yes | `src/models/remoteSessionModel.js` |
| remote-sessions | `updatedBy` | `users` | yes | `src/models/remoteSessionModel.js` |
| report-instances | `auditRequestId` | `audit-requests-master` | yes | `src/models/reportInstanceModel.js` |
| report-instances | `createdBy` | `users` | yes | `src/models/reportInstanceModel.js` |
| report-instances | `templateId` | `report-templates` | yes | `src/models/reportInstanceModel.js` |
| report-instances | `updatedBy` | `users` | yes | `src/models/reportInstanceModel.js` |
| report-templates | `createdBy` | `users` | yes | `src/models/reportTemplateModel.js` |
| report-templates | `updatedBy` | `users` | yes | `src/models/reportTemplateModel.js` |
| ScheduleEventLog | `actorUserId` | `users` | yes | `src/models/scheduleEventLogModel.js` |
| ScheduleEventLog | `auditRequestId` | `AuditRequestMaster` | no | `src/models/scheduleEventLogModel.js` |
| ScheduleSlot | `acceptedByUserId` | `users` | yes | `src/models/scheduleSlotModel.js` |
| ScheduleSlot | `auditRequestId` | `AuditRequestMaster` | no | `src/models/scheduleSlotModel.js` |
| ScheduleSlot | `blockedByUserId` | `users` | yes | `src/models/scheduleSlotModel.js` |
| ScheduleSlot | `createdByUserId` | `users` | yes | `src/models/scheduleSlotModel.js` |
| ScheduleSlot | `heldByUserId` | `users` | yes | `src/models/scheduleSlotModel.js` |
| ScheduleSlot | `proposedByUserId` | `users` | yes | `src/models/scheduleSlotModel.js` |
| status-definitions | `assessmentTypeId` | `assessment-types` | yes | `src/models/statusDefinitionModel.js` |
| status-definitions | `createdByUserId` | `users` | yes | `src/models/statusDefinitionModel.js` |
| status-history | `changedByUserId` | `users` | yes | `src/models/statusHistoryModel.js` |
| status-history | `workflowEntityId` | `audit-requests-master` | yes | `src/models/statusHistoryModel.js` |
| status-trackers | `assessmentTypeId` | `assessment-types` | yes | `src/models/statusTrackerModel.js` |
| status-trackers | `responsibleUserId` | `users` | yes | `src/models/statusTrackerModel.js` |
| status-trackers | `workflowEntityId` | `audit-requests-master` | yes | `src/models/statusTrackerModel.js` |
| subscriptions | `tenant_id` | `Tenant` | yes | `src/models/subscriptionModel.js` |
| supplier-master-products | `apiMasterId` | `api-master` | yes | `src/models/supplierMasterProductModel.js` |
| supplier-network-links | `fromSupplierId` | `users` | yes | `src/models/SupplierNetworkLink.js` |
| supplier-network-links | `toSupplierId` | `users` | yes | `src/models/SupplierNetworkLink.js` |
| supplier-profiles | `tenant_id` | `Tenant` | yes | `src/models/supplierProfileModel.js` |
| supplier-profiles | `user_id` | `users` | yes | `src/models/supplierProfileModel.js` |
| supplier-public-signals | `supplierId` | `users` | yes | `src/models/SupplierPublicSignal.js` |
| supplier-public-signals | `updatedBy` | `users` | yes | `src/models/SupplierPublicSignal.js` |
| supplier-risk-events | `createdBy` | `users` | yes | `src/models/SupplierRiskEvent.js` |
| supplier-risk-events | `supplierId` | `users` | yes | `src/models/SupplierRiskEvent.js` |
| supplier-risk-metrics | `supplierId` | `users` | yes | `src/models/SupplierRiskMetrics.js` |
| supplier-risk-metrics | `updatedBy` | `users` | yes | `src/models/SupplierRiskMetrics.js` |
| supplier-risk-snapshots | `supplierId` | `users` | yes | `src/models/SupplierRiskSnapshot.js` |
| supplier-sites | `tenant_id` | `Tenant` | yes | `src/models/supplierSiteDataModel.js` |
| supplier-sites | `user_id` | `users` | yes | `src/models/supplierSiteDataModel.js` |
| supplier-user-profiles | `user_id` | `users` | yes | `src/models/supplierUserProfileModel.js` |
| supplier_product_claims_v2 | `catalogProductId` | `catalog_products_v2` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `legacyProductId` | `supplier-master-products` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `ownerOrgId` | `organizations` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `supplierProfileId` | `supplier-profiles` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `supplierUserId` | `users` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `tenantId` | `Tenant` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_claims_v2 | `variantId` | `catalog_product_variants_v2` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_offers_v2 | `claimId` | `supplier_product_claims_v2` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_offers_v2 | `tenantId` | `Tenant` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `claimId` | `supplier_product_claims_v2` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `legacyMappingId` | `product-site-mappings` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `orgSiteId` | `org_sites` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `siteId` | `supplier-sites` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `supplierUserId` | `users` | yes | `src/models/productCatalogV2Models.js` |
| supplier_product_site_links_v2 | `tenantId` | `Tenant` | yes | `src/models/productCatalogV2Models.js` |
| SystemSetting | `updatedBy` | `User` | no | `src/models/systemSettingModel.js` |
| table_variants | `ownerUserId` | `users` | yes | `src/models/tableVariantModel.js` |
| table_variants | `tenantId` | `Tenant` | yes | `src/models/tableVariantModel.js` |
| templateQuestions | `categoryId` | `categories` | yes | `src/models/templateQuestionsModel.js` |
| templateQuestions | `templateId` | `template` | no | `src/models/templateQuestionsModel.js` |
| templates | `assessmentTypeId` | `assessment-types` | yes | `src/models/templateModel.js` |
| templates | `createdBy` | `users` | yes | `src/models/templateModel.js` |
| Tenant | `ownerUserIds` | `users` | yes | `src/models/tenantModel.js` |
| tenant-module-configs | `tenantId` | `Tenant` | yes | `src/models/tenantModuleConfigModel.js` |
| trust_badges | `createdBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| trust_badges | `orgId` | `organizations` | yes | `src/models/orgDiscoveryModels.js` |
| trust_badges | `updatedBy` | `users` | yes | `src/models/orgDiscoveryModels.js` |
| UserNotificationPreference | `tenantId` | `Tenant` | yes | `src/models/userNotificationPreferenceModel.js` |
| UserNotificationPreference | `userId` | `users` | yes | `src/models/userNotificationPreferenceModel.js` |
| users | `invitedBy` | `User` | no | `src/models/userModel.js` |
| users | `tenant_id` | `Tenant` | yes | `src/models/userModel.js` |
| workflow_milestone_definitions | `tenantId` | `tenant` | no | `src/models/workflowMilestoneDefinitionModel.js` |
| workflow_milestone_instances | `responsibleUserId` | `users` | yes | `src/models/workflowMilestoneInstanceModel.js` |
| workflow_milestone_instances | `tenantId` | `tenant` | no | `src/models/workflowMilestoneInstanceModel.js` |
| workflow_sla_configs | `tenantId` | `tenant` | no | `src/models/workflowSlaConfigModel.js` |
