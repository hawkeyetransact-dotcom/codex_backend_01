# Workflow OS Specification (Demo Branch)

## 1) Domain model

### Core entities

| Entity | Purpose | Key fields |
|---|---|---|
| `packs` | Versioned industry/use-case package registry | `key`, `version`, `name`, `industry`, `status`, `templates[]`, `nodeTypes[]`, `skills[]` |
| `workflow_definitions` | Tenant-visible workflow template metadata | `tenantId`, `packKey`, `key`, `name`, `status`, `latestVersion`, `latestVersionId` |
| `workflow_definition_versions` | Immutable workflow template versions | `definitionId`, `tenantId`, `version`, `status`, `schemaVersion`, `definition` |
| `workflow_instances` | Runtime execution instance | `tenantId`, `definitionId`, `definitionVersionId`, `status`, `currentNodeId`, `context`, `legacyRefs` |
| `workflow_events` | Append-only event log | `tenantId`, `instanceId`, `seq`, `eventType`, `nodeId`, `payload`, `actorId`, `occurredAt` |
| `tasks` | Human task inbox items | `tenantId`, `instanceId`, `nodeId`, `title`, `assigneeUserId`, `assigneeRole`, `status`, `dueAt` |
| `forms` | Reusable schema-based form definitions | `tenantId`, `key`, `name`, `version`, `status`, `schema`, `uiSchema` |
| `workflow_documents` | Workflow-scoped evidence/document metadata | `tenantId`, `instanceId`, `sourceType`, `title`, `fileRef`, `tags`, `linkedNodeId` |
| `field_mappings` | Tenant-specific canonical field mapping | `tenantId`, `packKey`, `canonicalField`, `tenantField`, `transform`, `enabled` |

## 2) WorkflowDefinition JSON schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "hawkeye.workflow.definition.schema.v1",
  "type": "object",
  "required": ["key", "name", "packKey", "version", "startNodeId", "nodes", "edges"],
  "properties": {
    "key": { "type": "string", "minLength": 3 },
    "name": { "type": "string", "minLength": 3 },
    "description": { "type": "string" },
    "packKey": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "roles": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "startNodeId": { "type": "string" },
    "nodes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "type", "name"],
        "properties": {
          "id": { "type": "string" },
          "type": {
            "type": "string",
            "enum": ["start", "end", "human_task", "approval", "form", "document_request", "ai_skill", "webhook"]
          },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "role": { "type": "string" },
          "formRef": { "type": "string" },
          "task": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "description": { "type": "string" },
              "dueInHours": { "type": "integer", "minimum": 1 }
            }
          },
          "requiredDocuments": {
            "type": "array",
            "items": { "type": "object", "required": ["type"], "properties": { "type": { "type": "string" }, "required": { "type": "boolean" } } }
          },
          "config": { "type": "object" }
        }
      }
    },
    "edges": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["from", "to"],
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "on": { "type": "string", "default": "node.completed" },
          "guard": { "type": "string" },
          "priority": { "type": "integer", "default": 100 }
        }
      }
    },
    "metadata": { "type": "object" }
  }
}
```

## 3) Event model (source of truth)

Workflow runtime writes immutable events:

- `INSTANCE_STARTED`
- `NODE_ENTERED`
- `NODE_COMPLETED`
- `TASK_CREATED`
- `TASK_COMPLETED`
- `DOCUMENT_ATTACHED`
- `INSTANCE_COMPLETED`
- `INSTANCE_BLOCKED`
- `INSTANCE_CANCELLED`

Event envelope:

```json
{
  "tenantId": "ObjectId",
  "instanceId": "ObjectId",
  "seq": 17,
  "eventType": "TASK_COMPLETED",
  "nodeId": "supplier_response",
  "payload": { "taskId": "..." },
  "actorId": "ObjectId",
  "actorRole": "supplier",
  "occurredAt": "2026-02-21T10:00:00.000Z"
}
```

Rules:
- `seq` is strictly monotonic per instance.
- Events are append-only.
- Instance state is derived from event application + current snapshot (`workflow_instances`).

## 4) Runtime/state machine behavior

1. Start instance
- Load published definition version.
- Create `workflow_instances` + `INSTANCE_STARTED`.
- Enter `startNodeId`.

2. Enter node
- Write `NODE_ENTERED`.
- Node type handling:
  - `start`: auto-complete and continue.
  - `end`: mark instance complete.
  - `human_task` / `approval`: create task and wait.
  - `form`: create task with `formRef`.
  - `document_request`: wait for `DOCUMENT_ATTACHED`/completion event.
  - `ai_skill`: execute configured skill adapter, write result event, continue.

3. Advance
- Evaluate outgoing edges ordered by `priority`.
- Match `on` (event type) and optional `guard`.
- First valid edge becomes next node.

4. Complete task
- Task status -> `COMPLETED`.
- Emit `TASK_COMPLETED`.
- Evaluate transitions from current node.

## 5) Versioning strategy

- `workflow_definitions` is mutable metadata.
- `workflow_definition_versions` is immutable content.
- Publish flow:
  - Draft edits create new version row.
  - Publish marks version `PUBLISHED`.
  - `workflow_definitions.latestVersionId` points to published latest.
- Instance pinning:
  - Every instance stores `definitionVersionId` and never auto-migrates.
- Pack versioning:
  - Pack templates are versioned; import creates tenant-local definition versions.

## 6) Multi-tenant isolation rules

1. Every query for runtime entities must include `tenantId`.
2. Tenant context is mandatory unless platform admin endpoint explicitly allows global read.
3. Pack templates are global/static data; tenant install creates tenant-scoped definitions.
4. No tenant data is copied into global pack registry.
5. All task/document/event reads and writes validate actor role + tenant ownership.
6. Legacy cross-refs (`legacyRefs.auditRequestId`) are read-only links; no cross-tenant join allowed.

## 7) Pack/plugin architecture contract

Pack contract:

```json
{
  "key": "pharma_audit",
  "version": "1.0.0",
  "templates": [
    {
      "key": "standard_gmp_audit",
      "name": "Standard GMP Audit",
      "definition": { "...": "WorkflowDefinition JSON" }
    }
  ],
  "nodeTypes": [
    { "type": "pharma.questionnaire_request", "extends": "human_task" },
    { "type": "pharma.compliance_check", "extends": "ai_skill" }
  ],
  "skills": [
    { "key": "ich_q7_mapping", "provider": "compliance_rules_v1" },
    { "key": "audit_report_generate", "provider": "report_preview_v1" }
  ],
  "validators": ["pharma.required_docs.validator.v1"],
  "uiWidgets": ["workflow-node-pharma-doc-map.v1"]
}
```

Runtime plugin boundaries:
- Node type resolver maps pack-specific node type -> built-in executor.
- Skill executor maps skill key -> local service adapter (modular monolith now, separate service later).
- Validator registry enforces pack-specific constraints during publish/start/transition.

