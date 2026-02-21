# Workflow OS Microservices and Plugin Design

## 1) Target boundaries (modular monolith first)

```text
+------------------------------ Hawkeye Backend ------------------------------+
| workflow-service  | task-service | document-service | pack-service          |
| form-service      | notification-service             | ai-skill-service      |
+----------------------------------------------------------------------------+
```

Current implementation keeps these as modules in one codebase and one deployable.

## 2) Service responsibilities

### workflow-service
- Workflow definitions/versions
- Runtime state machine execution
- Instance lifecycle + event log
- Legacy adapter hooks

### task-service
- Task creation/assignment
- Inbox listing
- Task completion and handoff to runtime

### document-service
- Workflow-scoped document metadata
- Tagging + node linkage
- Integration points to DigiLocker/evidence models

### pack-service
- Pack registry
- Pack install/import lifecycle
- Template distribution into tenant workflow definitions

### form-service
- Form schema/version storage
- Form reference resolution for nodes

### notification-service
- Emit notifications from runtime events (`TASK_CREATED`, SLA escalation)

### ai-skill-service
- Skill adapter interface
- Current providers:
  - `ich_q7_mapping` (rules/compliance)
  - `audit_report_generate` (report generation)

## 3) Plugin model

Pack plugin units:
- Templates (workflow definitions)
- Optional node type aliases/extensions
- Validators
- UI widget hints
- AI skill configs

Contract points:
1. Node type registry:
- `packNodeType.extends` maps to built-in executor (`human_task`, `ai_skill`, etc.)

2. Skill adapter registry:
- `skill.key -> provider` mapping
- Skill execution receives `instance.context`, node config, and event payload

3. Validation hooks:
- Publish-time validation
- Runtime guard/constraint validation

## 4) Event/message strategy

Phase 1 (current):
- Direct synchronous service calls inside monolith
- `workflow_events` is the canonical event store

Phase 2:
- Emit domain events to queue/webhook:
  - `workflow.instance.completed`
  - `workflow.task.created`
  - `workflow.task.overdue`
- Notification and analytics become async consumers

## 5) Deployment plan

### Now (demo)
- Single backend container/process
- Feature flags:
  - `WORKFLOW_OS_ENABLED`
  - `PHARMA_PACK_ENABLED`

### Next
1. Extract `workflow-service` + `task-service` behind API gateway
2. Extract `ai-skill-service` for separate scaling/latency controls
3. Move long-running skill execution to queue workers

## 6) Versioning and backwards compatibility

- Workflow instances are pinned to definition version at start time.
- Pack versions are immutable (`key + version`).
- Legacy APIs remain intact; Workflow OS is additive.
- Adapter remains optional and flag-controlled.

## 7) Pharma logic isolation plan

Current pharma-specific logic to isolate at pack boundary:
- Questionnaire flow structure
- ICH Q7 mapping skill usage
- CAPA/report branch behavior
- Required document types

Isolation strategy:
- Move pharma flow from controller branching into pack template definitions.
- Keep generic runtime agnostic to pharma terminology.
- Keep skill invocation by configurable `skill` keys rather than hardcoded pharma calls.

