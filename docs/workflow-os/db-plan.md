# Workflow OS DB Migration Plan (Demo MongoDB)

## Scope
- Environment: Demo DB only
- Branch: `demo`
- Strategy: additive schema introduction, no destructive migration, legacy collections untouched

## 1) New collections

### `packs`
- Purpose: global pack/template registry
- Core indexes:
  - `{ key: 1, version: 1 }` unique
  - `{ status: 1, updatedAt: -1 }`

### `workflow_definitions`
- Purpose: tenant workflow template metadata
- Core indexes:
  - `{ tenantId: 1, key: 1 }` unique
  - `{ tenantId: 1, packKey: 1, status: 1 }`
  - `{ tenantId: 1, updatedAt: -1 }`

### `workflow_definition_versions`
- Purpose: immutable version rows
- Core indexes:
  - `{ definitionId: 1, version: 1 }` unique
  - `{ tenantId: 1, packKey: 1, status: 1 }`
  - `{ tenantId: 1, createdAt: -1 }`

### `workflow_instances`
- Purpose: runtime instance snapshot
- Core indexes:
  - `{ tenantId: 1, status: 1, updatedAt: -1 }`
  - `{ tenantId: 1, definitionId: 1, createdAt: -1 }`
  - `{ tenantId: 1, "legacyRefs.auditRequestId": 1 }`

### `workflow_events`
- Purpose: append-only event stream
- Core indexes:
  - `{ instanceId: 1, seq: 1 }` unique
  - `{ tenantId: 1, instanceId: 1, occurredAt: 1 }`
  - `{ tenantId: 1, eventType: 1, occurredAt: -1 }`

### `tasks`
- Purpose: inbox/actionable items
- Core indexes:
  - `{ tenantId: 1, assigneeUserId: 1, status: 1, dueAt: 1 }`
  - `{ tenantId: 1, assigneeRole: 1, status: 1, dueAt: 1 }`
  - `{ tenantId: 1, instanceId: 1, status: 1 }`

### `forms`
- Purpose: reusable form schemas
- Core indexes:
  - `{ tenantId: 1, key: 1, version: 1 }` unique
  - `{ tenantId: 1, status: 1 }`

### `workflow_documents`
- Purpose: workflow-scoped document metadata
- Core indexes:
  - `{ tenantId: 1, instanceId: 1, createdAt: -1 }`
  - `{ tenantId: 1, sourceType: 1 }`
  - `{ tenantId: 1, tags: 1 }`

### `field_mappings`
- Purpose: canonical -> tenant mapping
- Core indexes:
  - `{ tenantId: 1, packKey: 1, canonicalField: 1 }` unique
  - `{ tenantId: 1, packKey: 1, enabled: 1 }`

## 2) Migration sequencing

1. Deploy models + indexes (no route usage yet)
2. Seed pack registry (`pharma_audit`) into `packs`
3. Enable APIs behind `WORKFLOW_OS_ENABLED` / `PHARMA_PACK_ENABLED`
4. Import pack templates into tenant workflow definitions
5. Start dual-write adapter from legacy audit create path (optional by flag)

## 3) Retention strategy

### Workflow events
- Keep all events for auditability by default in demo
- Optional archival policy:
  - Mark instance complete + older than N months -> export and compact to cold storage
  - Keep summarized snapshot in `workflow_instances`

### Tasks/documents
- Keep as long as linked instance is retained
- If legal retention required, derive policy from tenant settings later

## 4) Event growth strategy

Expected growth driver: `workflow_events`.

Mitigations:
- Strict per-instance `seq`
- Lean payload storage (store refs, not full file blobs)
- Snapshot is stored on `workflow_instances` to avoid replay for every query
- Paginated event timeline API
- Optional future partitioning by `tenantId + month`

## 5) Mapping existing pharma objects to Workflow OS

### Mapping table

| Legacy object | Workflow OS mapping |
|---|---|
| `audit-requests-master` | `workflow_instances.legacyRefs.auditRequestId` |
| `phaseState.currentPhase` | `workflow_instances.currentNodeId` + phase node metadata |
| `auditQuestions` | task/form payloads and/or form submission events |
| `audit-artifacts` | `workflow_documents` refs + node metadata |
| `workflow_milestone_instances` | task SLA/due date projections |
| `audit-reports` | terminal/report node output in instance context |

### Backfill strategy

1. Identify candidate audits (demo tenant) by `audit-requests-master`
2. Create workflow instance for each mapped audit using selected pharma template version
3. Write bootstrap events from current status:
  - `INSTANCE_STARTED`
  - `NODE_ENTERED` for current mapped node
  - optional synthetic historical events based on `trackStatus/questionnaireStatus`
4. Persist legacy ID pointers only; do not duplicate full legacy documents/questions

### History preservation
- No mutation to legacy collections
- Instance `legacyRefs` keeps direct link to source objects
- Timeline UI can show both:
  - Workflow OS events
  - Legacy audit events (via adapter resolver) if needed

## 6) Rollback plan

- Feature flags OFF => no runtime impact on legacy flow
- New collections are additive and can remain unused
- Remove tenant-imported definitions if needed; legacy tables unaffected

