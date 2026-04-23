---
doc: status-engine-analysis
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: processes
status: current
---

# Status Engine Analysis

> Generated: 2026-03-23 | All status enums, state machines, and transition logic

## Summary

The platform has **no centralized state machine engine**. Status transitions are scattered across 20+ controllers with approximately 131 direct `.status =` assignments. Three distinct state machine patterns coexist:

1. **V1 Audit Phase Machine** — Embedded `phaseState` in AuditRequestMaster (legacy)
2. **V2 Assessment Phase Machine** — `auditEngine/` module with milestone-driven phases
3. **Workflow OS State Machine** — `WorkflowInstance` → `WorkflowTask` execution engine
4. **CAPA State Machine** — 7-state machine in both V1 Capa and V2 AssessmentCapa

---

## All Status Enums (32 Models)

### Audit & Assessment Status

| Model | Field | Values |
|-------|-------|--------|
| `AuditRequestMaster` | questionnaireStatus | request_received → in_progress → sent_to_supplier → supplier_submitted → followup_requested → followup_submitted → review_completed → auditor_submitted |
| `AuditRequestMaster` | complianceStatus | complient \| non-complient |
| `AuditRequestMaster` | auditorDecision | PENDING \| ACCEPTED \| REJECTED |
| `AuditRequestMaster` | supplierDecision | PENDING \| ACCEPTED \| REJECTED \| PROPOSED |
| `AuditRequestMaster` | phaseState.*.status | NOT_STARTED \| IN_PROGRESS \| COMPLETED \| BLOCKED |
| `Assessment` | status | DRAFT \| ACTIVE \| COMPLETED \| ARCHIVED |
| `Assessment` | phases[].status | NOT_STARTED \| IN_PROGRESS \| BLOCKED \| DONE |
| `Assessment` | milestones[].status | NOT_STARTED \| IN_PROGRESS \| BLOCKED \| DONE |
| `AssessmentFinding` | status | OPEN \| IN_REVIEW \| CLOSED |
| `AuditReport` | status | DRAFT \| PENDING_SIGNATURES \| COMPLETED |
| `AuditPlan` | status | DRAFT \| SUBMITTED \| APPROVED |
| `AuditAgenda` | status | DRAFT \| PROPOSED \| CONFIRMED |
| `AuditArtifact` | status | draft \| sent \| in_progress \| complete |
| `PreAuditQuestionnaire` | status | DRAFT \| SENT \| IN_PROGRESS \| SUBMITTED \| REVIEWED \| CLOSED \| WAIVED |

### CAPA Status (Both V1 and V2)

| Model | Values |
|-------|--------|
| `Capa` (V1) | DRAFT \| NEEDS_SUPPLIER \| IN_REVIEW \| REWORK_REQUESTED \| APPROVED \| CLOSED \| OVERDUE |
| `AssessmentCapa` (V2) | DRAFT \| NEEDS_SUPPLIER \| IN_REVIEW \| REWORK_REQUESTED \| APPROVED \| CLOSED \| OVERDUE |

### Workflow Status

| Model | Field | Values |
|-------|-------|--------|
| `WorkflowDefinition` | status | DRAFT \| PUBLISHED \| ARCHIVED |
| `WorkflowDefinitionVersion` | status | DRAFT \| PUBLISHED \| ARCHIVED |
| `WorkflowInstance` | status | RUNNING \| COMPLETED \| BLOCKED \| CANCELLED |
| `WorkflowTask` | status | OPEN \| IN_PROGRESS \| COMPLETED \| CANCELLED |
| `WorkflowMilestoneInstance` | status | NOT_STARTED \| IN_PROGRESS \| COMPLETED \| SKIPPED |
| `WorkflowForm` | status | DRAFT \| PUBLISHED \| ARCHIVED |
| `StatusHistory` | status | NOT_STARTED \| IN_PROGRESS \| COMPLETED \| BLOCKED \| SKIPPED |

### Evidence Status

| Model | Values |
|-------|--------|
| `Evidence` (V1) | processing \| ready \| failed |
| `AssessmentEvidence` (V2) | processing \| ready \| failed |
| `EvidenceUpload` | processing \| ready \| failed |

### Platform Status

| Model | Field | Values |
|-------|-------|--------|
| `User` | status | ACTIVE \| DISABLED |
| `Tenant` | status | ACTIVE \| SUSPENDED |
| `Subscription` | status | ACTIVE \| SUSPENDED \| CANCELLED |
| `AccessGrant` | status | ACTIVE \| REVOKED \| EXPIRED |
| `AuditorAffiliation` | status | ACTIVE \| REVOKED \| EXPIRED |
| `ApprovalRequest` | status | PENDING \| APPROVED \| REJECTED |
| `SharePolicy` | status | ACTIVE \| SCHEDULED \| EXPIRED |
| `Pack` | status | ACTIVE \| ARCHIVED |
| `Template` | status | DRAFT \| PUBLISHED \| ARCHIVED |
| `SupplierProfile` (vendorReg) | vendorRegistration.status | DRAFT \| SUBMITTED |

### Other Domain Status

| Model | Field | Values |
|-------|-------|--------|
| `MonitoringSignal` | status | OPEN \| ACKED \| RESOLVED |
| `NotificationOutbox` | status | PENDING \| SENT \| FAILED |
| `IntegrationRunLog` | status | Success \| Partial \| Failed |
| `ReportInstance` | status | draft \| final |
| `PublicIntelModel` | status | unclaimed \| claimed \| verified |
| `PublicIntelModel` | reviewStatus | new \| in_review \| resolved |
| `HawkUnanswered` | status | new \| reviewed \| converted |

---

## State Machine 1: V1 Audit Phase (Legacy)

**File:** `src/models/auditRequestsMasterModel.js`

This is an embedded state machine inside `AuditRequestMaster.phaseState`. Phase keys come from `src/modules/auditEngine/constants.js`.

### Phase Keys
```
INITIATED → PREP → SCOPE_AGENDA → SCHEDULING → EXECUTION → REPORTING → FOLLOWUP_CAPA → CLOSURE
```

### Phase Status Values
Each phase has: `{ status: NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED, startedAt, completedAt, ownerRole, blockers[] }`

### Legacy Questionnaire Status Flow
```
request_received
  └─→ in_progress
        └─→ sent_to_supplier
              └─→ supplier_submitted
                    ├─→ followup_requested
                    │     └─→ followup_submitted
                    └─→ review_completed
                          └─→ auditor_submitted
```

### Transition Logic Location
`src/controllers/auditPhaseController.js` lines 197–219:
```javascript
// Direct mutation, no centralized validation
phaseState.phases.INITIATED.status = phaseState.phases.INITIATED.status || "IN_PROGRESS";
```

---

## State Machine 2: V2 Assessment Phase Engine

**Files:**
- `src/modules/auditEngine/constants.js` — Phase and milestone key definitions
- `src/modules/auditEngine/phaseRules.js` — Advancement prerequisites
- `src/modules/auditEngine/assessmentBuilder.js` — Phase/milestone construction
- `src/services/auditPhaseService.js` — Phase service methods

### Phase Keys (V2)
```
PREP → SCOPE_AGENDA → SCHEDULING → EXECUTION → REPORTING → FOLLOWUP_CAPA
```

### Milestone Status Values
`NOT_STARTED | IN_PROGRESS | BLOCKED | DONE`

### Phase Advancement Rules (`phaseRules.js`)
```
To reach SCOPE_AGENDA:
  prereq: questionnaireStatus IN ["SENT", "WAIVED", "SUBMITTED", "REVIEWED", "CLOSED"]

To reach SCHEDULING:
  prereq: milestone "SCOPE_AGENDA:AGENDA_FINALIZED" = DONE

To reach EXECUTION:
  prereq: milestone "SCHEDULING:DATES_CONFIRMED" = DONE

To reach REPORTING:
  prereq: milestone "EXECUTION:CLOSING_MEETING" = DONE

To reach FOLLOWUP_CAPA:
  prereq: milestone "REPORTING:FINAL_REPORT" = DONE
```

**Force flag:** Any rule can be bypassed with `force: true` (admin only)

### Phase Status Derivation (`assessmentBuilder.js`)
```javascript
// Phase status is computed from milestone statuses:
if (ALL milestones DONE)   → phase.status = "DONE"
if (ANY milestone STARTED) → phase.status = "IN_PROGRESS"
if (ANY milestone BLOCKED) → phase.status = "BLOCKED"
else                        → phase.status = "NOT_STARTED"
```

### Key Service Methods (`auditPhaseService.js`)
| Method | Purpose |
|--------|---------|
| `normalizePhaseState(audit)` | Ensures consistent phase structure for legacy audits |
| `derivePhaseStateFromLegacy(audit)` | Converts V1 questionnaireStatus to V2 phase model |
| `applyPhaseTransition(auditId, targetPhase)` | Moves audit to next phase, writes history |
| `canTransition(audit, targetPhase)` | Validates prerequisites from phaseRules.js |

---

## State Machine 3: CAPA (7 States)

**Files:**
- `src/models/capaModel.js` (V1)
- `src/models/assessmentCapaModel.js` (V2)
- `src/controllers/capaController.js`

### CAPA State Diagram
```
          DRAFT
            │
            ▼
       NEEDS_SUPPLIER ◄──────── REWORK_REQUESTED
            │                          ▲
            ▼                          │
        IN_REVIEW ──────────────────────┤
            │                          │
            ├─────────── APPROVED      │
            │               │          │
            │               ▼          │
            │            CLOSED ◄──────┘
            │
            ▼
          OVERDUE (auto-flagged by scheduler if targetDate passed)
```

### Transition Rules (enforced in controller)
| From | To | Who | Condition |
|------|----|-----|-----------|
| DRAFT | NEEDS_SUPPLIER | auditor | finding linked |
| NEEDS_SUPPLIER | IN_REVIEW | supplier | action added |
| IN_REVIEW | REWORK_REQUESTED | auditor | changes required |
| IN_REVIEW | APPROVED | auditor | satisfactory |
| REWORK_REQUESTED | IN_REVIEW | supplier | re-submitted |
| APPROVED | CLOSED | auditor/buyer | verification done |
| any open | OVERDUE | system scheduler | targetDate < now |

**Note:** These rules are partially enforced in `capaController.js` but not in a centralized transition service. The V2 `assessmentCapaController.js` has no pagination and no status transition validation.

---

## State Machine 4: Workflow OS

**Files:**
- `src/models/workflowInstanceModel.js`
- `src/models/workflowTaskModel.js`
- `src/services/workflowRuntimeService.js`

### WorkflowInstance States
```
RUNNING → COMPLETED
  ├─→ BLOCKED (waiting on external dependency)
  └─→ CANCELLED (manually stopped)
```

### WorkflowTask States
```
OPEN → IN_PROGRESS → COMPLETED
  └─→ CANCELLED
```

### WorkflowMilestoneInstance States
```
NOT_STARTED → IN_PROGRESS → COMPLETED
                              └─→ SKIPPED (admin bypass)
```

### SLA Tracking
`WorkflowSlaConfig` defines expected completion durations per milestone. `workflowMilestoneService.js` checks SLA breaches and can trigger notifications.

---

## Status Transition Inconsistencies

### Case Sensitivity Mismatch
```javascript
// Some models use lowercase:
AuditArtifact.status: ["draft", "sent", "in_progress", "complete"]
Evidence.status: ["processing", "ready", "failed"]

// Some use UPPERCASE:
Assessment.status: ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"]
Capa.status: ["DRAFT", "NEEDS_SUPPLIER", "IN_REVIEW", ...]

// No shared enum registry — typos cause silent failures
```

### Partial State Machine Coverage
| Entity | Has state machine logic? | Has audit trail? | Has notifications? |
|--------|------------------------|-------------------|-------------------|
| AuditRequestMaster | Partial (phaseRules.js) | YES (AuditTrail) | Partial |
| Assessment | YES (assessmentBuilder) | YES (AuditEvent) | Partial |
| Capa/AssessmentCapa | Partial (controller) | Partial (AuditTrail) | YES (NEEDS_SUPPLIER) |
| WorkflowInstance | YES (workflowRuntime) | YES (WorkflowEvent) | Partial |
| WorkflowTask | Partial | NO | NO |
| AssessmentFinding | NO | Partial | NO |
| AuditReport | NO | NO | Partial |
| AuditPlan | NO | NO | NO |
| AuditAgenda | NO | NO | NO |

---

## Scattered Status Transition Locations

Status is directly mutated in these controller files (131 total `.status =` occurrences):

| Controller | Status Changes | Issue |
|------------|---------------|-------|
| `auditPhaseController.js` | 12+ | Direct phase.status mutation without validation |
| `capaController.js` | 8+ | Filter by status but no transition validation |
| `askHawkController.js:586` | 1 | Direct status assignment |
| `auditRequestController.js` | 6+ | Multiple status setters |
| `v2/assessmentCapaController.js` | 3+ | No centralized logic |
| And 15+ more... | | |

**No centralized `StatusTransitionEngine` service exists.** Each controller implements its own rules — or none.

---

## Feature Flags Affecting Status Flow

| Flag | Effect on Status |
|------|-----------------|
| `ENABLE_PREP_PHASE` | If false, PREP phase skipped entirely; phase states jump from INITIATED to SCOPE_AGENDA |
| `ENFORCE_AUDIT_PARTICIPANTS` | If true, requires specific roles before phase transition |
| `ALLOW_EARLY_ARTIFACT_SEND` | Bypasses phase prerequisite check for artifact sending |
| `ENABLE_AUDIT_EVENT_LOG` | If true, AuditEvent records created for every status change |
