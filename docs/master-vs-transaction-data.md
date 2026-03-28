# Master vs Transaction Data Classification

> Generated: 2026-03-23

## Classification Key

| Class | Definition |
|-------|-----------|
| **Master** | Reference/configuration data. Rarely changes. Describes *who* and *what* exists in the system. |
| **Transaction** | Event/process data. Created as actions happen. Describes *what happened*. |
| **Configuration** | Admin-managed settings and definitions. Drives behaviour. |
| **Derived/Analytics** | Computed aggregates or snapshots. Read-heavy, written by background jobs. |
| **Operational** | System plumbing (counters, logs, sessions). |

---

## Master Data

These records define the entities that participate in audits. They change infrequently and are referenced by many transaction records.

### Identity & Access

| Collection | Master Element | Notes |
|------------|---------------|-------|
| `Tenant` | Tenant org | Root of all multi-tenancy |
| `User` | User account | Shared across tenant contexts |
| `SupplierProfile` | Supplier identity | One per supplier user |
| `SupplierSite` | Manufacturing site | Physical location |
| `SupplierMasterProduct` | Product catalog | What a supplier makes |
| `BuyerProfile` | Buyer identity | One per buyer user |
| `AuditorProfile` | Auditor identity | Qualifications, certs |
| `AuditorAffiliation` | Auditor–tenant link | Many auditors per tenant |

### Audit Configuration

| Collection | Master Element | Notes |
|------------|---------------|-------|
| `AssessmentType` | Audit type template | cGMP, WHO-GMP, etc. |
| `ComplianceStandard` | Regulatory standard | ICH Q7, WHO-GMP text |
| `ComplianceStandardRegistry` | Platform standards catalog | Cross-tenant |
| `Control` | Individual control clause | Maps to standard |
| `Template` (question templates) | Question library | |
| `TemplateQuestion` | Individual questions | |
| `FormLayout` | Form field layout | |
| `WorkflowDefinition` | Workflow template | Process blueprint |
| `WorkflowDefinitionVersion` | Versioned templates | |
| `WorkflowMilestoneDefinition` | Milestone catalog | |
| `WorkflowSlaConfig` | SLA thresholds | |
| `Pack` | Audit module pack | cGMP pack, WHO-GMP pack |
| `TenantModuleConfig` | Tenant module setup | |
| `StatusDefinition` | Custom status labels | Admin-configurable |
| `IntegrationProvider` | Available integrations | CSV, webhook |

### Public Intelligence (Reference)

| Collection | Notes |
|------------|-------|
| `FdaInspection` | FDA inspection records |
| `FdaCitation` | FDA Form 483 citations |
| `Fda483` | Form 483 details |
| `FdaDashboardSnapshot` | Regulatory snapshots |
| `ApiPublicManufacturer` | Public manufacturer data |
| `KbArticle` / `KbChunk` | AskHawk knowledge base |

---

## Transaction Data

These records are created as audit processes execute. High volume, time-ordered, append-heavy.

### Audit Execution (V1)

| Collection | Transaction Type | Volume Estimate |
|------------|-----------------|-----------------|
| `AuditRequestMaster` | Audit lifecycle record | Medium (1 per audit) |
| `AuditArtifact` | Phase deliverables | Medium (3–10 per audit) |
| `AuditArtifactVersion` | Artifact revisions | Medium |
| `AuditPlan` | Audit plan document | Low (1 per audit) |
| `AuditAgenda` | Schedule document | Low (1 per audit) |
| `AuditReport` | Final report | Low (1 per audit) |
| `AuditQuestions` | Questionnaire responses | High (50–200 per audit) |
| `Evidence` | Uploaded files | High (10–100 per audit) |
| `Capa` | Corrective actions | Medium (1–20 per audit) |
| `EvidenceFinding` | Evidence–finding links | Medium |
| `AuditRfq` / `AuditRfqQuote` / `AuditRfqThread` | Auditor bidding | Low |

### Audit Execution (V2)

| Collection | Transaction Type |
|------------|-----------------|
| `Assessment` | Audit lifecycle record (V2) |
| `AssessmentFinding` | Identified issues |
| `AssessmentCapa` | Corrective actions (V2) |
| `AssessmentEvidence` | Uploaded evidence (V2) |
| `PreAuditQuestionnaire` | Supplier questionnaire |
| `QuestionnaireArtifact` | Processed questionnaire |
| `QuestionnaireSectionAssignment` | Questionnaire distribution |
| `QuestionnaireUpload` | Raw uploaded files |

### Process Tracking

| Collection | Transaction Type |
|------------|-----------------|
| `PhaseTracker` | Phase progression per audit |
| `StatusHistory` | All status changes with actor |
| `StatusTracker` | Current status per entity |
| `WorkflowInstance` | Active workflow execution |
| `WorkflowTask` | Individual task records |
| `WorkflowMilestoneInstance` | Milestone completions |
| `WorkflowDocument` | Documents in workflows |
| `WorkflowEvent` | Workflow state changes |
| `WorkflowForm` | Filled forms in workflows |

### Audit Logging

| Collection | Transaction Type |
|------------|-----------------|
| `AuditTrail` | Immutable action log |
| `AuditEvent` | Detailed before/after change log |
| `AuditNote` | Field notes during execution |
| `GovernanceAuditLog` | Governance events |
| `AdminAuditLog` | Platform admin actions |
| `IntegrationAuditLog` | Integration activity |
| `DigilockerAuditTrailEvent` | DigiLocker access log |
| `AccessEvent` | Access grant events |

### Scheduling & Planning

| Collection | Transaction Type |
|------------|-----------------|
| `AuditSchedule` | Audit scheduling record |
| `ScheduleSlot` | Available time slots |
| `ScheduleEventLog` | Schedule change events |
| `AvailabilityBlock` | Auditor blocked time |
| `RemoteSession` | Remote audit sessions |

### Compliance & Risk Execution

| Collection | Transaction Type |
|------------|-----------------|
| `ComplianceRun` | Per-audit compliance check |
| `ComplianceQuestionResult` | Per-question results |
| `ComplianceResponseSnapshot` | Snapshot of responses |
| `ComplianceEventRaw` / `Canonical` | Compliance event processing |
| `SupplierRiskMetrics` | Computed risk scores |
| `SupplierRiskSnapshot` | Historical risk points |
| `SupplierRiskEvent` | Risk-impacting events |
| `SupplierPublicSignal` | External signals |

### Notifications

| Collection | Transaction Type |
|------------|-----------------|
| `Notification` | Delivered notifications |
| `NotificationDeliveryLog` | Delivery attempts |
| `NotificationOutbox` | Pending notifications |
| `NotificationEvent` | Raw notification triggers |

---

## Configuration Data

Admin-managed data that drives system behaviour. Changed intentionally, not as part of process execution.

| Collection | What it configures |
|------------|--------------------|
| `SystemSetting` | Platform/tenant-level settings |
| `TableVariant` | User's saved data grid layouts |
| `FormLayout` | Dynamic form field configurations |
| `IntegrationConnection` | Third-party integration setup |
| `IntegrationMappingConfig` | Field mapping for integrations |
| `NotificationPreference` | User notification preferences |
| `HawkPolicy` | AskHawk behaviour policies |
| `HawkPlaybook` | AskHawk domain playbooks |
| `BuyerRiskProfile` | Buyer-specific risk weights |
| `AccessGrant` | Data access permissions |
| `ApprovalRequest` | Approval workflow entries |
| `DigilockerAccessPolicy` | DigiLocker data policies |
| `DigilockerQuestionEvidenceMap` | Evidence mapping config |
| `SupplierNetworkLink` | Supply chain relationships |

---

## Derived / Analytics Data

Written by background jobs; should not be directly mutated by API routes.

| Collection | Derived From |
|------------|-------------|
| `SupplierRiskMetrics` | Compliance runs, audit results, supplier signals |
| `SupplierRiskSnapshot` | Daily/weekly snapshot of SupplierRiskMetrics |
| `FdaDashboardSnapshot` | FDA inspections and citations |
| `ApiMasterSync` | API master ingestion runs |
| `MonitoringSignal` | System health checks and alerts |

---

## Operational / System Data

Infrastructure records that support the system but are not business data.

| Collection | Purpose |
|------------|---------|
| `SequenceCounter` | Auto-increment counters for readable IDs |
| `RequestIdCounter` | Request ID sequencing |
| `ApiMaster` | Raw API ingestion data |
| `ApiPublicManufacturer` | Manufacturer lookup table |
| `IntegrationRunLog` | Integration job history |

---

## Retention and Sensitivity Summary

| Class | Typical Retention | GMP Sensitivity |
|-------|------------------|-----------------|
| Master (Identity) | Indefinite | High (PII) |
| Master (Config/Templates) | Indefinite | Low |
| Transaction (Audit) | 10+ years (GMP requirement) | High (audit records) |
| Transaction (Logs/Trail) | 10+ years | High (evidence of control) |
| Derived/Analytics | Rolling window (1–2 years) | Medium |
| Operational | Short-term (30–90 days) | Low |

> **GMP Note:** Under ICH Q7 / 21 CFR Part 11, audit records including findings, CAPAs, and supporting evidence must be retained for a period that extends beyond the product's expiry date, typically minimum 10 years. No soft-delete or data purge policy currently exists in the system — this is a gap (see `docs/current-system-gaps.md`).
