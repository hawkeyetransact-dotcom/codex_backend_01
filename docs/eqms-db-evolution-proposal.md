# eQMS Database Evolution Proposal

> Generated: 2026-03-23 | Future architecture for full Electronic Quality Management System

## Vision

Evolve Hawkeye from a **GMP Audit SaaS** into a full **eQMS (Electronic Quality Management System)** covering the complete quality lifecycle: audits, change control, document management, deviations, OOS/OOT investigations, product release, and training management — all under a unified, GMP-21 CFR Part 11-compliant data model.

---

## Design Principles

1. **Single Tenancy Model** — All entities use `tenantId: ObjectId → Tenant`. No string keys.
2. **Unified Entity Registry** — All quality entities (Audit, CAPA, Deviation, Change) share a common `QualityRecord` base pattern.
3. **Centralized Status Engine** — One `StatusTransitionEngine` service governs all state machines.
4. **Immutable Audit Trail** — Every state change, field edit, and access event is recorded and cryptographically tamper-evident (21 CFR Part 11).
5. **Soft Delete + Retention** — No hard deletes. `deletedAt` + archival after configurable retention period.
6. **Event-Driven Architecture** — Status transitions emit domain events consumed by notification, analytics, and audit trail services.
7. **Document Control** — Controlled documents (SOPs, protocols) versioned with approval workflows before use.

---

## Proposed New Collections

### Core eQMS Foundation

#### `QualityRecord` (Abstract Pattern)
A shared base schema applied to all quality entities:
```javascript
{
  tenantId: ObjectId → Tenant,     // required, indexed
  recordType: String,              // "AUDIT" | "CAPA" | "DEVIATION" | "CHANGE" | "OOS"
  recordCode: String,              // human-readable ID, e.g., "AUD-2026-001"
  status: String,                  // machine-managed via StatusTransitionEngine
  currentOwnerId: ObjectId → User, // who currently has action
  currentOwnerRole: String,
  createdBy: ObjectId → User,
  deletedAt: Date,                 // soft delete
  archivedAt: Date,
  retentionUntil: Date,            // GMP: product expiry + 10 years
  linkedRecordIds: [ObjectId],     // cross-links (CAPA linked to Deviation, etc.)
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### `AuditTrailEntry` (Immutable, replaces current AuditTrail + AuditEvent)
```javascript
{
  tenantId: ObjectId → Tenant,
  entityId: ObjectId,
  entityType: String,
  action: String enum,             // STATUS_CHANGED | FIELD_EDITED | RECORD_CREATED | ...
  actorId: ObjectId → User,
  actorRole: String,
  fromValue: Mixed,                // before state
  toValue: Mixed,                  // after state
  fieldName: String,               // for field edits
  reason: String,
  ipAddress: String,               // 21 CFR Part 11
  userAgent: String,
  hash: String,                    // SHA-256 of entry for tamper detection
  timestamp: Date
}
```

#### `ElectronicSignature` (21 CFR Part 11)
```javascript
{
  tenantId: ObjectId → Tenant,
  entityId: ObjectId,
  entityType: String,
  signerUserId: ObjectId → User,
  signerRole: String,
  meaning: String,                 // "APPROVED" | "REVIEWED" | "AUTHORED"
  signedAt: Date,
  ipAddress: String,
  credential: String,              // hashed re-authentication proof
  certificateRef: String           // if using PKI
}
```

---

### Deviation / Non-Conformance Management

#### `Deviation`
```javascript
{
  ...QualityRecord base,
  recordType: "DEVIATION",
  title: String,
  description: String,
  category: String enum,           // PROCESS | MATERIAL | EQUIPMENT | FACILITY | ANALYTICAL
  severity: String enum,           // CRITICAL | MAJOR | MINOR
  detectedBy: ObjectId → User,
  detectedAt: Date,
  site: ObjectId → SupplierSite,
  product: ObjectId → SupplierMasterProduct,
  batch: String,
  rootCauseAnalysis: String,
  immediateActions: [Object],
  linkedCapaIds: [ObjectId → AssessmentCapa],
  linkedAuditIds: [ObjectId → Assessment],
  impactAssessment: Object,
  status: String enum,             // OPEN | UNDER_INVESTIGATION | CAPA_ASSIGNED | CLOSED | CANCELLED
}
```

#### `DeviationInvestigation`
```javascript
{
  tenantId: ObjectId → Tenant,
  deviationId: ObjectId → Deviation,
  investigatorId: ObjectId → User,
  fishboneDiagram: Object,         // structured root cause analysis
  labTestResults: [Object],
  conclusion: String,
  rootCause: String,
  closedAt: Date
}
```

---

### Change Control

#### `ChangeRequest`
```javascript
{
  ...QualityRecord base,
  recordType: "CHANGE",
  changeType: String enum,         // MINOR | MAJOR | EMERGENCY
  category: String enum,           // PROCESS | EQUIPMENT | FACILITY | MATERIAL | ANALYTICAL | DOCUMENT
  title: String,
  currentState: String,
  proposedState: String,
  rationale: String,
  riskAssessment: Object,
  impactedSites: [ObjectId → SupplierSite],
  impactedProducts: [ObjectId → SupplierMasterProduct],
  impactedDocuments: [ObjectId → ControlledDocument],
  implementationPlan: String,
  implementationDate: Date,
  status: String enum              // DRAFT | UNDER_REVIEW | APPROVED | IMPLEMENTING | COMPLETED | REJECTED
}
```

#### `ChangeApproval` (linked to ElectronicSignature)
```javascript
{
  tenantId: ObjectId → Tenant,
  changeRequestId: ObjectId → ChangeRequest,
  reviewerRole: String,            // QA | REGULATORY | MANUFACTURING | MANAGEMENT
  reviewerId: ObjectId → User,
  decision: String enum,           // APPROVED | REJECTED | CONDITIONAL
  conditions: [String],
  signatureId: ObjectId → ElectronicSignature
}
```

---

### Document Management (SOP/Protocol Control)

#### `ControlledDocument`
```javascript
{
  ...QualityRecord base,
  recordType: "DOCUMENT",
  documentType: String enum,       // SOP | PROTOCOL | SPECIFICATION | FORM | POLICY
  documentNumber: String,          // unique within tenant, e.g., SOP-001
  title: String,
  currentVersion: String,          // e.g., "2.1"
  effectiveDate: Date,
  reviewDate: Date,                // periodic review schedule
  owner: ObjectId → User,
  department: String,
  relatedStandards: [String],      // e.g., ["ICH Q7", "21 CFR 211"]
  linkedProcesses: [String],
  status: String enum              // DRAFT | UNDER_REVIEW | APPROVED | EFFECTIVE | SUPERSEDED | OBSOLETE
}
```

#### `DocumentVersion`
```javascript
{
  tenantId: ObjectId → Tenant,
  documentId: ObjectId → ControlledDocument,
  version: String,
  s3Key: String,
  contentHash: String,             // SHA-256 for integrity
  changes: String,
  authorId: ObjectId → User,
  status: String enum,             // DRAFT | REVIEW | APPROVED | SUPERSEDED
  approvalSignatureId: ObjectId → ElectronicSignature
}
```

---

### OOS / OOT Investigations (Out-of-Spec / Out-of-Trend)

#### `OOSInvestigation`
```javascript
{
  ...QualityRecord base,
  recordType: "OOS",
  product: ObjectId → SupplierMasterProduct,
  batch: String,
  testType: String,                // IDENTITY | ASSAY | DISSOLUTION | MICROBIAL | etc.
  specification: Object,           // { parameter, unit, min, max }
  result: Object,                  // { value, unit, testedBy, testedAt }
  laboratoryId: ObjectId,
  phase1Investigation: Object,     // lab error check
  phase2Investigation: Object,     // full investigation
  conclusion: String enum,         // LAB_ERROR | PRODUCTION_ERROR | ASSIGNABLE_CAUSE | UNRESOLVED
  disposition: String enum,        // RELEASE | REJECT | RETEST | REWORK | DESTROY
  linkedCapaIds: [ObjectId → AssessmentCapa]
}
```

---

### Product Release

#### `BatchRecord`
```javascript
{
  tenantId: ObjectId → Tenant,
  product: ObjectId → SupplierMasterProduct,
  site: ObjectId → SupplierSite,
  batch: String,
  manufacturingDate: Date,
  expiryDate: Date,                // retention = expiryDate + 10 years
  yield: Number,
  status: String enum,             // IN_PROCESS | PENDING_RELEASE | RELEASED | REJECTED | QUARANTINE
  linkedAuditIds: [ObjectId → Assessment],
  linkedDeviationIds: [ObjectId → Deviation],
  linkedOOSIds: [ObjectId → OOSInvestigation],
  releaseSignatureId: ObjectId → ElectronicSignature
}
```

---

### Training Management

#### `TrainingRecord`
```javascript
{
  tenantId: ObjectId → Tenant,
  employeeId: ObjectId → User,
  documentId: ObjectId → ControlledDocument,   // SOP/training doc
  trainingType: String enum,                    // INITIAL | PERIODIC | CHANGE_DRIVEN
  dueDate: Date,
  completedAt: Date,
  assessmentScore: Number,
  status: String enum,                          // PENDING | COMPLETED | OVERDUE | WAIVED
  trainer: ObjectId → User,
  signatureId: ObjectId → ElectronicSignature
}
```

---

### Enhanced Risk Management

#### `RiskAssessment`
```javascript
{
  tenantId: ObjectId → Tenant,
  entityId: ObjectId,              // Product / Process / Supplier / Site
  entityType: String,
  methodology: String enum,        // FMEA | HACCP | ICH_Q9 | CUSTOM
  hazards: [Object],               // { description, severity, probability, detectability, rpn }
  overallRisk: String enum,        // LOW | MEDIUM | HIGH | CRITICAL
  mitigations: [Object],
  residualRisk: String enum,
  reviewDate: Date,
  approvedBy: ObjectId → User,
  linkedChangeIds: [ObjectId → ChangeRequest]
}
```

---

## Unified Status Registry

Replace 21+ scattered enum definitions with a centralized registry:

```javascript
// src/constants/statusEnums.js
export const STATUS = {
  // Universal
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",

  // Draft/Publish lifecycle
  DRAFT: "DRAFT",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  PUBLISHED: "PUBLISHED",
  SUPERSEDED: "SUPERSEDED",
  OBSOLETE: "OBSOLETE",

  // Workflow/phase
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  BLOCKED: "BLOCKED",
  CANCELLED: "CANCELLED",

  // CAPA/deviation
  OPEN: "OPEN",
  NEEDS_ACTION: "NEEDS_ACTION",
  IN_REVIEW: "IN_REVIEW",
  REWORK_REQUESTED: "REWORK_REQUESTED",
  CLOSED: "CLOSED",
  OVERDUE: "OVERDUE",

  // Evidence/files
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED"
}
```

---

## Index Strategy for eQMS Scale

| Pattern | Index |
|---------|-------|
| All quality records by tenant | `{ tenantId: 1, createdAt: -1 }` |
| All quality records by type+status | `{ tenantId: 1, recordType: 1, status: 1 }` |
| Audit trail by entity | `{ entityId: 1, timestamp: -1 }` |
| Status history by entity | `{ entityId: 1, entityType: 1, timestamp: -1 }` |
| CAPA by status+lastActivity | `{ tenantId: 1, status: 1, lastActivityAt: -1 }` |
| Training by employee+due date | `{ tenantId: 1, employeeId: 1, dueDate: 1 }` |
| Documents by review date | `{ tenantId: 1, reviewDate: 1, status: 1 }` |

---

## Migration Phases

### Phase A: Foundation (0–3 months)
- Unify tenantId field across all models (ObjectId → Tenant)
- Add `deletedAt` soft delete to all transaction models
- Create `AuditTrailEntry` V2 with hash field
- Create `ElectronicSignature` model
- Add `retentionUntil` to audit + CAPA models

### Phase B: V1→V2 Migration (3–6 months)
- Migrate all `AuditRequestMaster` records to `Assessment`
- Migrate all `Capa` records to `AssessmentCapa`
- Deprecate V1 routes (read-only)
- Deprecate V1 models (no new writes)

### Phase C: eQMS Expansion (6–12 months)
- Add `Deviation` / `DeviationInvestigation`
- Add `ChangeRequest` / `ChangeApproval`
- Add `ControlledDocument` / `DocumentVersion`
- Integrate training management

### Phase D: Advanced Compliance (12–18 months)
- Add `OOSInvestigation`
- Add `BatchRecord` and product release
- Add `RiskAssessment` (ICH Q9 methodology)
- 21 CFR Part 11 e-signature audit trail
