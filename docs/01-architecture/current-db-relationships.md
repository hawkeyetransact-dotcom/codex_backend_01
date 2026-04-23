---
doc: current-db-relationships
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: architecture
status: current
---

# Current DB Relationships

> Generated: 2026-03-23 | Mongoose ObjectId references and logical links

## Relationship Types in Use

1. **Hard ObjectId ref** — `{ type: ObjectId, ref: "ModelName" }` — Mongoose populate-able
2. **Soft string key** — `tenantOrgId: String` — no Mongoose ref, manual lookup
3. **Embedded document** — sub-schemas stored inline
4. **Array of refs** — `[{ type: ObjectId, ref: "Model" }]`

---

## Core Entity Hierarchy

```
Tenant (1)
  ├── User (N)               tenant_id → Tenant
  ├── SupplierProfile (N)    tenant_id → Tenant
  ├── AuditorProfile (N)     tenant_id → Tenant
  ├── BuyerProfile (N)       tenant_id → Tenant
  └── Assessment (N)         tenantId  → Tenant [V2]
```

---

## V1 Audit Request Relationships

```
AuditRequestMaster
  ├── supplier_id         → users (supplier)
  ├── auditor_id          → users (auditor)
  ├── create_by_buyer_id  → users (buyer)
  ├── site_id             → supplier-sites
  ├── supplier_product_id → supplier-master-products
  └── assessmentTypeId    → assessment-types

AuditRequestMaster (1)
  ├── AuditArtifact (N)          auditId → AuditRequestMaster
  ├── AuditArtifactVersion (N)   auditId → AuditRequestMaster
  ├── AuditTrail (N)             auditId → AuditRequestMaster
  ├── AuditEvent (N)             auditId → AuditRequestMaster
  ├── AuditNote (N)              auditRequestId → AuditRequestMaster
  ├── AuditPlan (1)              auditId → AuditRequestMaster
  ├── AuditAgenda (1)            auditId → AuditRequestMaster
  ├── AuditReport (1)            auditRequestId → AuditRequestMaster
  ├── AuditQuestions (N)         auditRequestId → AuditRequestMaster
  ├── Evidence (N)               auditRequestId → AuditRequestMaster
  ├── Capa (N)                   auditId → AuditRequestMaster
  ├── PhaseTracker (1)           workflowEntityId → AuditRequestMaster
  ├── WorkflowMilestoneInstance (N)  workflowEntityId → AuditRequestMaster
  ├── QuestionnaireSectionAssignment (N)  auditRequestId → AuditRequestMaster
  ├── AuditSchedule (N)          auditId → AuditRequestMaster (tenantOrgId String)
  ├── ComplianceRun (N)          auditId → AuditRequestMaster
  └── RemoteSession (N)          auditId → AuditRequestMaster
```

---

## V2 Assessment Relationships

```
Assessment (V2)
  ├── tenantId → Tenant
  ├── createdBy → users
  ├── assignedAuditors[].userId → users
  ├── participants[].userId → users
  │
  ├── AssessmentFinding (N)   assessmentId → Assessment
  │     ├── tenantId → Tenant
  │     ├── createdBy / updatedBy → users
  │     └── linkedEvidenceIds → AssessmentEvidence
  │
  ├── AssessmentCapa (N)      assessmentId → Assessment
  │     ├── tenantId → Tenant
  │     ├── findingId → AssessmentFinding
  │     ├── supplierId / buyerId / auditorId / ownerId → users
  │     └── actions[].actor → users
  │
  ├── AssessmentEvidence (N)  assessmentId → Assessment
  │     ├── tenantId → Tenant
  │     └── uploaderId → users
  │
  └── PreAuditQuestionnaire (N) auditId (soft link to Assessment/AuditRequest)
        ├── tenantId → Tenant
        ├── templateId → templates
        └── submittedBy → users
```

---

## CAPA Relationships

```
Capa (V1)
  ├── tenantOrgId (String — no ref)
  ├── auditId → AuditRequestMaster
  ├── findingId → (soft — no strict ref model)
  ├── supplierId → users
  ├── buyerId → users
  ├── auditorId → users
  ├── ownerId → users
  ├── linkedQuestionIds → AuditQuestions
  ├── linkedObservationIds → AuditReport.observations
  └── linkedEvidenceIds → Evidence

AssessmentCapa (V2)
  ├── tenantId → Tenant
  ├── assessmentId → Assessment
  ├── findingId → AssessmentFinding
  ├── supplierId / buyerId / auditorId / ownerId → users
  └── actions[].actor → users
```

---

## Evidence Relationships

```
Evidence (V1)
  ├── auditRequestId → AuditRequestMaster
  ├── uploaderId → users
  ├── linkedControlIds → controls
  └── linkedQuestionIds → AuditQuestions

AssessmentEvidence (V2)
  ├── tenantId → Tenant
  ├── assessmentId → Assessment
  └── uploaderId → users

EvidenceFinding (bridge)
  ├── evidenceId → Evidence / AssessmentEvidence
  └── findingId → AssessmentFinding / AuditReport.observations
```

---

## Workflow OS Relationships

```
WorkflowDefinition (1)
  └── WorkflowDefinitionVersion (N)  definitionId → WorkflowDefinition

WorkflowInstance
  ├── tenantId → Tenant
  ├── definitionId → WorkflowDefinition
  ├── entityId (polymorphic) → Assessment / AuditRequestMaster
  └── entityType (String discriminator)

WorkflowInstance (1)
  ├── WorkflowTask (N)              instanceId → WorkflowInstance
  │     ├── tenantId → Tenant
  │     └── assignedTo → users
  ├── WorkflowMilestoneInstance (N) workflowEntityId → WorkflowInstance.entityId
  ├── WorkflowDocument (N)          instanceId → WorkflowInstance
  └── WorkflowEvent (N)             instanceId → WorkflowInstance

WorkflowMilestoneDefinition
  └── definitionId → WorkflowDefinition
```

---

## Supplier Domain Relationships

```
User (supplier role)
  ├── SupplierProfile (1)     user_id → users
  ├── SupplierSite (N)        user_id → users
  └── SupplierMasterProduct (N) user_id → users

SupplierSite (1)
  └── SupplierMasterProduct (N)  via siteIds[] in Product

ProductSiteMapping
  ├── productId → SupplierMasterProduct
  └── siteId → SupplierSite

SupplierRiskMetrics
  ├── supplierId → users
  └── buyerId → users

SupplierNetworkLink
  ├── supplierId → users
  └── linkedSupplierId → users
```

---

## Compliance Relationships

```
ComplianceStandard
  └── controls: [controlId, title, ...] (embedded)

Control
  └── standardId → ComplianceStandard

ComplianceRun
  ├── tenantId (String)
  ├── auditId → AuditRequestMaster
  ├── standardId → ComplianceStandard
  └── controlResults[].controlId → Control

ComplianceQuestionResult
  └── complianceRunId → ComplianceRun

AssessmentFinding
  └── linkedStandards: [String] (standard codes, not ObjectId)
```

---

## Notification Relationships

```
Notification
  ├── tenantId → Tenant
  └── recipientId → users

NotificationDeliveryLog
  └── notificationId → Notification

NotificationPreference
  └── userId → users
```

---

## Integration Relationships

```
IntegrationConnection
  ├── tenantId → Tenant
  └── providerId → IntegrationProvider

IntegrationRunLog
  └── connectionId → IntegrationConnection

IntegrationMappingConfig
  └── connectionId → IntegrationConnection

IntegrationAuditLog
  └── connectionId → IntegrationConnection
```

---

## Access & Governance Relationships

```
AccessGrant
  ├── granteeId → users
  ├── resourceId (polymorphic)
  └── grantedBy → users

AccessEvent
  └── grantId → AccessGrant

ApprovalRequest
  ├── requesterId → users
  ├── approverId → users
  └── entityId (polymorphic)

GovernanceAuditLog
  └── actorId → users
```

---

## Cross-Version Bridge Pattern

```
Assessment.legacyRefs = {
  auditRequestId: ObjectId,   // links V2 Assessment to V1 AuditRequestMaster
  hawkeyeRequestId: String,   // human-readable audit ID
  ...
}

WorkflowInstance.legacyRefs = {
  auditRequestId: ObjectId,   // links workflow to V1 audit
  ...
}
```

---

## Polymorphic Relationships (entityType discriminator)

| Model | entityId field | entityType values |
|-------|---------------|-------------------|
| WorkflowInstance | entityId | Assessment / AuditRequest / Capa |
| WorkflowMilestoneInstance | workflowEntityId | Assessment / AuditRequest |
| AuditTrail | entityId | AuditQuestion / Evidence / Capa / etc. |
| AuditEvent | entityId | Any audit sub-entity |
| StatusHistory | entityId | Assessment / Capa / WorkflowTask |
| ApprovalRequest | entityId | AuditPlan / AuditReport / Capa |

---

## Relationship Gaps / Anomalies

| Anomaly | Models | Risk |
|---------|--------|------|
| No FK ref from Capa.auditId to AuditRequestMaster | Capa | No Mongoose populate, orphan risk |
| tenantOrgId (String) — no ref to Tenant | AuditRequestMaster, Capa, AuditSchedule, AvailabilityBlock, QuestionnaireSectionAssignment | Cross-tenant query requires manual matching |
| AssessmentFinding.linkedStandards uses String codes, not ObjectId | AssessmentFinding | Cannot join to ComplianceStandard |
| Evidence.linkedControlIds — controls may be soft-deleted with no check | Evidence | Stale links |
| PreAuditQuestionnaire.auditId — soft link, no strict ref definition | PreAuditQuestionnaire | Unclear V1 vs V2 target |
