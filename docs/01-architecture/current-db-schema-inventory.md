---
doc: current-db-schema-inventory
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: architecture
status: current
---

# Current DB Schema Inventory

> Generated: 2026-03-23 | 128 Mongoose models | MongoDB Atlas

## Organization

Models are grouped by domain. Each entry shows: collection name, key fields, tenant linkage type, and status enum.

**Tenant linkage key:**
- `tenantId (ObjectId→Tenant)` — V2 proper reference
- `tenantId (String)` — Mid-era string key
- `tenantOrgId (String)` — V1 legacy string
- `tenant_id (ObjectId→Tenant)` — Profile-style reference
- `none` — Platform-level (no tenant isolation)

---

## 1. Platform / Auth

### `users` — User
| Field | Type | Notes |
|-------|------|-------|
| email | String | required, indexed |
| password | String | required, select:false |
| role | String enum | supplier / supplierUser / buyer / auditor / user / admin / superadmin / tenant_admin |
| adminScope | String enum | NONE / TENANT / PLATFORM |
| tenant_id | ObjectId→Tenant | required unless PLATFORM admin |
| status | String enum | ACTIVE / DISABLED |
| permissions | [String] | |
| lastLoginAt | Date | |
| isEmailVerified | Boolean | |
| invitedBy | ObjectId→users | |

**Indexes:** email (unique), tenant_id, adminScope, `{email, tenant_id}` unique

---

### `Tenant` — Tenant
| Field | Type | Notes |
|-------|------|-------|
| name | String | required, unique (slug/key) |
| displayName | String | required |
| type | String enum | SUPPLIER / BUYER / AUDITOR / INTERNAL |
| status | String enum | ACTIVE / SUSPENDED |
| ownerUserIds | [ObjectId→users] | |
| branding | Object | logoUrl, primaryColor |
| security | Object | allowedEmailDomains, requireMFA |
| trackingGranularity | String enum | BASIC / STANDARD / ADVANCED |

---

### `subscriptions` — Subscription
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| plan | String | |
| status | String enum | ACTIVE / SUSPENDED / CANCELLED |
| startDate / endDate | Date | |

---

### `system-settings` — SystemSetting
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| key | String | setting key |
| value | Mixed | setting value |

---

## 2. Supplier Domain

### `supplier-profiles` — SupplierProfile
| Field | Type | Notes |
|-------|------|-------|
| user_id | ObjectId→users | required |
| tenant_id | ObjectId→Tenant | |
| title/firstName/lastName | String | required |
| companyName | String | required |
| address (line1/2/3, city, state, country, zip) | String | |
| panNumber / gstNumber / caNumber | String | India-specific |
| vendorRegistration | Object | templateId, status (DRAFT/SUBMITTED), responses[] |
| isProfileCompleted | Boolean | |

---

### `supplier-sites` — SupplierSite
| Field | Type | Notes |
|-------|------|-------|
| user_id | ObjectId→users | required |
| tenant_id | ObjectId→Tenant | |
| siteName | String | required |
| siteType | String | |
| address | Object | full address |
| certifications | [Object] | type, expiryDate, certificateUrl |

---

### `supplier-master-products` — SupplierMasterProduct
| Field | Type | Notes |
|-------|------|-------|
| user_id | ObjectId→users | required |
| tenant_id | ObjectId→Tenant | |
| productName | String | |
| category | String | |
| siteIds | [ObjectId→supplier-sites] | |

---

### `supplier-user-profiles` — SupplierUserProfile
Individual user accounts under a supplier company.

---

### `product-site-mappings` — ProductSiteMapping
Maps products to manufacturing sites.

---

## 3. Buyer Domain

### `buyer-profiles` — BuyerProfile
| Field | Type | Notes |
|-------|------|-------|
| user_id | ObjectId→users | required |
| tenant_id | ObjectId→Tenant | |
| companyName | String | |
| address | Object | |
| isProfileCompleted | Boolean | |

---

## 4. Auditor Domain

### `auditor-profiles` — AuditorProfile
| Field | Type | Notes |
|-------|------|-------|
| user_id | ObjectId→users | required |
| tenant_id | ObjectId→Tenant | |
| firstName/lastName/title | String | required |
| workExperiences | [Object] | companyName, role, experience, skills |
| certifications | [Object] | certificationType, issuingAuthority, expiryDate, certificateUrl |
| identityDocuments | [Object] | documentType, documentUrl |
| linkedinUrl / resumeUrl | String | |
| isProfileCompleted | Boolean | |

---

### `auditor-affiliations` — AuditorAffiliation
| Field | Type | Notes |
|-------|------|-------|
| auditorId | ObjectId→users | |
| tenantId | ObjectId→Tenant | |
| status | String enum | ACTIVE / REVOKED / EXPIRED |
| affiliationType | String | |

---

### `availability-blocks` — AvailabilityBlock
| Field | Type | Notes |
|-------|------|-------|
| tenantOrgId | String | V1 legacy |
| auditorId | ObjectId→users | |
| start/end | Date | |

---

## 5. V1 Audit Core (Legacy)

### `audit-requests-master` — AuditRequestMaster
**Primary V1 audit entity.**
| Field | Type | Notes |
|-------|------|-------|
| tenantOrgId | String | V1 tenancy |
| internalRequestId | String | |
| hawkeyeRequestId | String | new format ID |
| supplier_id | ObjectId→users | |
| auditor_id | ObjectId→users | |
| create_by_buyer_id | ObjectId→users | |
| site_id | ObjectId→supplier-sites | |
| supplier_product_id | ObjectId→supplier-master-products | |
| assessmentTypeId | ObjectId→assessment-types | |
| complianceDate | Date | |
| questionnaireStatus | String enum | request_received / in_progress / sent_to_supplier / supplier_submitted / followup_requested / followup_submitted / review_completed / auditor_submitted |
| high_status | String | legacy numeric-style status |
| complianceStatus | String enum | complient / non-complient (sic) |
| phaseState | Object (PhaseStateSchema) | embedded phase data per phase key |
| auditorDecision | String enum | PENDING / ACCEPTED / REJECTED |
| supplierDecision | String enum | PENDING / ACCEPTED / REJECTED / PROPOSED |
| trackStatus | String | human-readable status |

**Indexes:** tenantOrgId+high_status, tenantOrgId+trackStatus, tenantOrgId+updatedAt, create_by_buyer_id, auditor_id, supplier_id, supplier_product_id, site_id, assessmentTypeId

---

### `audit-reports` — AuditReport
| Field | Type | Notes |
|-------|------|-------|
| auditRequestId | ObjectId | V1 audit ID |
| tenantId | String | mid-era string |
| summary | String | |
| observations | [Object] | questionId, severity, classification (NAI/VAI/OAI) |
| reportFormat | String enum | TRADITIONAL / custom |
| html / renderedBlocks | String / Array | |
| signatures | [Object] | role, userId, signedAt |
| status | String enum | DRAFT / PENDING_SIGNATURES / COMPLETED |

---

### `audit-questions` (via auditQuestionsModels.js)
| Field | Type | Notes |
|-------|------|-------|
| auditRequestId | ObjectId | |
| question | String | |
| responseSchema | Object | |
| answerType | String | |
| YesNoAnswers / textResponse | Mixed | |
| auditorAttachments | [Object] | type (audio/photo/file), url, fileName |
| flagStatus | String | auditor_flagged / supplier_responded / auditor_accepted |
| status | String enum | supplier_draft / supplier_submitted / auditor_draft / auditor_submitted |

---

### `audit-plans` — AuditPlan
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| tenantId | String | |
| scope | String | |
| objectives | String | |
| riskSummary | String | |
| participants | [Object] | userId, role, name, email |
| approvals | [Object] | role, userId, status (PENDING/APPROVED/REJECTED) |
| status | String enum | DRAFT / SUBMITTED / APPROVED |

---

### `audit-agendas` — AuditAgenda
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| tenantId | String | |
| blocks | [Object] | startAt, endAt, topic, ownerRole, location |
| attendees | [Object] | userId, role, name, email |
| status | String enum | DRAFT / PROPOSED / CONFIRMED |

---

### `audit-artifacts` — AuditArtifact
Tracks documents/deliverables per phase.
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| tenantId | String | |
| phaseKey | String | PREP / PLANNING / EXECUTION / etc. |
| artifactType | String | PRE_AUDIT_QUESTIONNAIRE / DRL / SCOPE / FINAL_REPORT / CAPA_PLAN / etc. |
| templateId | ObjectId | |
| ownerRole | String | buyer / supplier / auditor |
| status | String enum | draft / sent / in_progress / complete |
| data | Mixed | artifact-specific data |
| version | Number | |

---

### `audit-artifact-versions` — AuditArtifactVersion
Version history for audit artifacts.

---

### `audit-trails` — AuditTrail
Immutable action log.
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| tenantId | String | |
| entityType | String | |
| entityId | ObjectId | |
| action | String | |
| actorId | ObjectId→users | |
| actorRole | String | |
| meta | Object | |

---

### `audit-events` — AuditEvent
Detailed change log with before/after values.
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| tenantId | String | |
| entityType / entityId | String / ObjectId | |
| action | String | |
| before / after | Mixed | state snapshot |
| actorId | ObjectId→users | |
| meta | Object | |

---

### `audit-notes` — AuditNote
| Field | Type | Notes |
|-------|------|-------|
| auditRequestId | ObjectId | |
| tenantId | ObjectId→Tenant | |
| authorId | ObjectId→users | |
| authorRole | String | |
| type | String enum | text / audio / photo |
| text | String | |
| transcript | String | for audio notes |
| attachmentPath / mimeType / size | String / Number | |

---

### `capa` (V1) — Capa
| Field | Type | Notes |
|-------|------|-------|
| tenantOrgId | String | V1 tenancy |
| auditId | ObjectId | |
| findingId | ObjectId | |
| title / description | String | |
| severity | String enum | critical / major / minor / info |
| status | String enum | DRAFT / NEEDS_SUPPLIER / IN_REVIEW / REWORK_REQUESTED / APPROVED / CLOSED / OVERDUE |
| supplierId / buyerId / auditorId / ownerId | ObjectId→users | |
| targetDate / closedAt / lastActivityAt | Date | |
| linkedQuestionIds / linkedObservationIds / linkedEvidenceIds | [ObjectId] | |
| actions | [Object] | actor, message, attachments, visibility (internal/external) |

---

### `evidence` (V1) — Evidence
| Field | Type | Notes |
|-------|------|-------|
| auditRequestId | ObjectId | |
| uploaderId | ObjectId→users | |
| uploaderRole | String | |
| fileName / mimeType / size | String / Number | |
| s3Key | String | |
| status | String enum | processing / ready / failed |
| piiFindings | [Object] | |
| redactedPath | String | |
| linkedControlIds / linkedQuestionIds | [ObjectId] | |
| viewPolicy | Object | ttlMinutes (30), maxViews (3) |

---

## 6. V2 Assessment Core (Current)

### `assessments` — Assessment
**Primary V2 audit entity.**
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | required |
| assessmentCode | String | unique identifier |
| modules | [Object] | module key + configuration |
| type | String enum | External / Internal |
| currentPhaseKey | String enum | PREP / SCOPE_AGENDA / SCHEDULING / EXECUTION / REPORTING / FOLLOWUP_CAPA |
| phases | [phaseInstanceSchema] | per-phase status, milestones, blockers |
| status | String enum | DRAFT / ACTIVE / COMPLETED / ARCHIVED |
| assignedAuditors | [Object] | userId, role (LEAD/CO/REVIEWER), assignedAt |
| participants | [Object] | userId, role, addedAt |
| createdBy | ObjectId→users | |
| legacyRefs | Mixed | bridge to V1 audit request IDs |

**Milestones per phase:** `{ code, status: NOT_STARTED/IN_PROGRESS/BLOCKED/DONE, dueDate, completedAt, ownerRole }`

---

### `assessment-findings` — AssessmentFinding (V2)
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| assessmentId | ObjectId→Assessment | |
| severity | String enum | LOW / MEDIUM / HIGH / CRITICAL |
| domain | String enum | QUALITY / EHS / GMP / SAFETY |
| category / description | String | |
| linkedStandards | [String] | |
| linkedControls / linkedEvidenceIds | [ObjectId] | |
| status | String enum | OPEN / IN_REVIEW / CLOSED |
| createdBy / updatedBy | ObjectId→users | |

---

### `assessment-capas` — AssessmentCapa (V2)
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| assessmentId | ObjectId→Assessment | |
| findingId | ObjectId→AssessmentFinding | |
| title / description | String | |
| severity | String enum | critical / major / minor / info |
| status | String enum | DRAFT / NEEDS_SUPPLIER / IN_REVIEW / REWORK_REQUESTED / APPROVED / CLOSED / OVERDUE |
| supplierId / buyerId / auditorId / ownerId | ObjectId→users | |
| targetDate / closedAt / lastActivityAt | Date | |
| actions | [Object] | actor, message, attachments |

**Indexes:** tenantId, status, lastActivityAt

---

### `assessment-evidence` — AssessmentEvidence (V2)
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| assessmentId | ObjectId→Assessment | |
| uploaderId | ObjectId→users | |
| fileName / mimeType / size | String / Number | |
| s3Key | String | |
| status | String enum | processing / ready / failed |
| piiFindings | [Object] | |

---

### `pre-audit-questionnaires` — PreAuditQuestionnaire (V2)
| Field | Type | Notes |
|-------|------|-------|
| auditId | ObjectId | |
| templateId | ObjectId | |
| tenantId | ObjectId→Tenant | |
| responses | [Object] | |
| status | String enum | DRAFT / SENT / IN_PROGRESS / SUBMITTED / REVIEWED / CLOSED / WAIVED |
| sentAt / submittedAt / submittedBy | Date / ObjectId | |

---

### `phase-trackers` — PhaseTracker
Tracks phase progression per assessment type.
| Field | Type | Notes |
|-------|------|-------|
| workflowEntityId | ObjectId | |
| assessmentTypeId | ObjectId | |
| currentPhaseKey | String | |
| phases | [Object] | per-phase status definitions |

---

### `status-history` — StatusHistory
| Field | Type | Notes |
|-------|------|-------|
| tenantId | String | |
| entityId / entityType | ObjectId / String | |
| fromStatus / toStatus | String | |
| phase | String | |
| changedByUserId / changedByRole | ObjectId / String | |
| reason | String | |
| status | String enum | NOT_STARTED / IN_PROGRESS / COMPLETED / BLOCKED / SKIPPED |

---

### `status-trackers` — StatusTracker
Per-entity status tracking.

---

### `status-definitions` — StatusDefinition
Admin-configurable status definitions per assessment type.

---

## 7. Workflow OS

### `workflow-definitions` — WorkflowDefinition
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| name / slug | String | |
| status | String enum | DRAFT / PUBLISHED / ARCHIVED |
| phases | [Object] | |
| triggers | [Object] | |

---

### `workflow-definition-versions` — WorkflowDefinitionVersion
Version history for workflow definitions.
| Field | Type | Notes |
|-------|------|-------|
| definitionId | ObjectId→WorkflowDefinition | |
| version | Number | |
| status | String enum | DRAFT / PUBLISHED / ARCHIVED |

---

### `workflow-instances` — WorkflowInstance
Active workflow executions.
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| definitionId | ObjectId→WorkflowDefinition | |
| entityId / entityType | ObjectId / String | linked entity (auditId, etc.) |
| status | String enum | RUNNING / COMPLETED / BLOCKED / CANCELLED |
| currentStepId | String | |
| legacyRefs | Mixed | |
| startedAt / completedAt | Date | |

---

### `workflow-tasks` — WorkflowTask
Individual tasks within workflow instances.
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| instanceId | ObjectId→WorkflowInstance | |
| taskCode / taskName | String | |
| assignedTo | ObjectId→users | |
| status | String enum | OPEN / IN_PROGRESS / COMPLETED / CANCELLED |
| dueDate | Date | |
| completedAt | Date | |

---

### `workflow-milestone-definitions` — WorkflowMilestoneDefinition
Template milestones attached to workflow definitions.

---

### `workflow-milestone-instances` — WorkflowMilestoneInstance
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| workflowEntityId | ObjectId | |
| milestoneCode | String | |
| status | String enum | NOT_STARTED / IN_PROGRESS / COMPLETED / SKIPPED |
| expectedAt / completedAt | Date | |

---

### `workflow-sla-configs` — WorkflowSlaConfig
SLA configuration per workflow milestone.

---

### `workflow-documents` — WorkflowDocument
Documents attached to workflow instances.

---

### `workflow-events` — WorkflowEvent
Audit log of workflow state changes.

---

### `workflow-forms` — WorkflowForm
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| status | String enum | DRAFT / PUBLISHED / ARCHIVED |

---

## 8. Compliance

### `compliance-standards` — ComplianceStandard
| Field | Type | Notes |
|-------|------|-------|
| tenantId | String | |
| name / code | String | e.g., ICH Q7, WHO-GMP |
| version | String | |
| controls | [Object] | controlId, title, description |

---

### `compliance-standard-registry` — ComplianceStandardRegistry
Platform-level standards catalog.

---

### `compliance-runs` — ComplianceRun
| Field | Type | Notes |
|-------|------|-------|
| tenantId | String | |
| auditId | ObjectId | |
| standardId | ObjectId | |
| score | Number | |
| controlResults | [Object] | |

---

### `compliance-question-results` / `compliance-response-snapshots` / `compliance-event-raw` / `compliance-event-canonical`
Fine-grained compliance tracking models.

---

### `controls` — Control
| Field | Type | Notes |
|-------|------|-------|
| tenantId | String | |
| standardId | ObjectId | |
| controlCode | String | |
| title / description | String | |

---

## 9. Questionnaire & Templates

### `templates` — Template (Question Templates)
| Field | Type | Notes |
|-------|------|-------|
| tenantId | String | |
| name / slug | String | |
| status | String enum | DRAFT / PUBLISHED / ARCHIVED |
| sections | [Object] | |
| questions | [Object] | |

---

### `template-questions` — TemplateQuestion
Individual questions within templates.

---

### `form-layouts` — FormLayout
Form field layout definitions for dynamic forms.

---

### `questionnaire-uploads` — QuestionnaireUpload
Uploaded questionnaire files (Word/PDF) for AI extraction.

---

### `questionnaire-artifacts` — QuestionnaireArtifact
Processed questionnaire artifacts.

---

### `questionnaire-section-assignments` — QuestionnaireSectionAssignment
| Field | Type | Notes |
|-------|------|-------|
| tenantOrgId | String | V1 legacy |
| auditRequestId | ObjectId | |
| sectionId | String | |
| assignedTo | ObjectId→users | |

---

## 10. Risk Management

### `SupplierRiskMetrics` — SupplierRiskMetrics
| Field | Type | Notes |
|-------|------|-------|
| supplierId | ObjectId→users | |
| buyerId | ObjectId→users | |
| overallScore | Number | |
| dimensions | Object | quality, compliance, delivery, ehs |
| calculatedAt | Date | |

---

### `SupplierRiskSnapshot` — Historical risk snapshots
### `SupplierRiskEvent` — Risk-impacting events
### `BuyerRiskProfile` — Buyer-specific risk configuration
### `SupplierNetworkLink` — Supplier network relationships
### `SupplierPublicSignal` — Public signals affecting risk

---

## 11. Intelligence & AI

### `fda-483s` / `fda-citations` / `fda-inspections` / `fda-dashboard-snapshots`
FDA regulatory data models.

### `public-intel` models (publicIntelModels.js)
| Field | Type | Notes |
|-------|------|-------|
| status | String enum | unclaimed / claimed / verified (for matching) |
| reviewStatus | String enum | new / in_review / resolved |

---

### `kb-articles` / `kb-chunks` — Knowledge Base
AskHawk RAG knowledge base storage.

### `hawk-conversations` — HawkConversation
AskHawk chat history.

### `hawk-policy` / `hawk-playbook` / `hawk-unanswered`
| Field | Notes |
|-------|-------|
| hawkUnanswered.status | new / reviewed / converted |

---

## 12. Notifications

### `notifications` — Notification
| Field | Type | Notes |
|-------|------|-------|
| tenantId | ObjectId→Tenant | |
| recipientId | ObjectId→users | |
| type | String | event type code |
| channels | [String] | email / socket / push |
| payload | Object | |
| readAt | Date | |

---

### `notification-delivery-logs` — NotificationDeliveryLog
### `notification-outbox` — NotificationOutbox
| Field | Notes |
|-------|-------|
| status | PENDING / SENT / FAILED |

### `notification-folders` / `notification-labels`
Inbox organization.

### `notification-preferences` — NotificationPreference
Per-user notification channel preferences.

---

## 13. Integrations

### `integration-providers` — IntegrationProvider
Available integration types (CSV, webhook, etc.)

### `integration-connections` — IntegrationConnection
Per-tenant integration configurations.

### `integration-run-logs` — IntegrationRunLog
| Field | Notes |
|-------|-------|
| status | Success / Partial / Failed |

### `integration-mapping-configs` — IntegrationMappingConfig
### `integration-audit-logs` — IntegrationAuditLog

---

## 14. DigiLocker (India)

### `digilocker-documents` / `digilocker-document-versions`
Document storage and version history.

### `digilocker-access-policies` — DigilockerAccessPolicy
### `digilocker-audit-evidence-checklists`
### `digilocker-audit-trail-events`
### `digilocker-document-extractions`
### `digilocker-question-evidence-maps`

---

## 15. Scheduling

### `audit-schedules` — AuditSchedule
| Field | Notes |
|-------|-------|
| tenantOrgId | String (V1) |
| auditId | ObjectId |
| scheduledDate | Date |

---

### `schedule-slots` — ScheduleSlot
| Field | Notes |
|-------|-------|
| tenantOrgId | String (V1) |

### `schedule-event-logs`

---

## 16. RFQ

### `audit-rfq` / `audit-rfq-quotes` / `audit-rfq-threads`
Request for Quote models for auditor assignment.

---

## 17. Access & Governance

### `access-grants` — AccessGrant
| Field | Notes |
|-------|-------|
| status | ACTIVE / REVOKED / EXPIRED |

### `access-events` — AccessEvent
### `approval-requests` — ApprovalRequest
| Field | Notes |
|-------|-------|
| status | PENDING / APPROVED / REJECTED |

### `governance-audit-logs` — GovernanceAuditLog
### `admin-audit-logs` — AdminAuditLog

---

## 18. Monitoring & Analytics

### `monitoring-signals` — MonitoringSignal
| Field | Notes |
|-------|-------|
| status | OPEN / ACKED / RESOLVED |

### `report-templates` / `report-instances`
| Field | Notes |
|-------|-------|
| reportInstance.status | draft / final |

---

## 19. Module System

### `packs` — Pack
| Field | Notes |
|-------|-------|
| status | ACTIVE / ARCHIVED |

### `tenant-module-configs` — TenantModuleConfig
Per-tenant module configuration.

### `assessment-types` — AssessmentType
| Field | Notes |
|-------|-------|
| tenantId | String |
| code | String (e.g., cGMP, WHO-GMP) |
| phases / milestones | [Object] |

---

## 20. Miscellaneous

### `sequence-counters` / `request-id-counters`
Auto-increment sequences for IDs.

### `api-master` / `api-master-sync` / `api-public-manufacturers`
Master data ingestion from external APIs.

### `categories` — Categories
Product/audit category taxonomy.

### `documents` / `document-views`
General document storage.

### `field-mappings` — FieldMapping
Data field mapping for integrations.

### `remote-sessions` — RemoteSession
Remote audit session tracking.

### `share-policies` — SharePolicy
| Field | Notes |
|-------|-------|
| status | ACTIVE / SCHEDULED / EXPIRED |

### `table-variants` — TableVariant
Saved data grid configurations per user.

### `lab-records`
Laboratory test records.

### `audit-cycle-templates`
| Field | Notes |
|-------|-------|
| tenantId | ObjectId→Tenant |
| Cycle template config | |

### `audit-request-aliases`
Legacy alias mapping for audit request IDs.

---

## Collection Count Summary

| Domain | Collections |
|--------|------------|
| Platform/Auth | 4 |
| Supplier | 5 |
| Buyer | 1 |
| Auditor | 3 |
| V1 Audit Core | 12 |
| V2 Assessment Core | 8 |
| Workflow OS | 10 |
| Compliance | 7 |
| Questionnaire & Templates | 6 |
| Risk Management | 6 |
| Intelligence & AI | 8 |
| Notifications | 6 |
| Integrations | 5 |
| DigiLocker | 7 |
| Scheduling | 3 |
| RFQ | 3 |
| Access & Governance | 5 |
| Monitoring & Analytics | 3 |
| Module System | 3 |
| Miscellaneous | 13 |
| **Total** | **128** |
