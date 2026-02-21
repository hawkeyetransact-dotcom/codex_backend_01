# Workflow OS Backlog and Implementation Plan

## Phase plan

### Phase 0: Docs + inventory
- Completed:
  - `docs/workflow-os/current-state.md`
  - `docs/workflow-os/spec.md`
  - `docs/workflow-os/db-plan.md`
  - `docs/workflow-os/api.md`
  - `docs/workflow-os/frontend.md`
  - `docs/workflow-os/microservices.md`
  - `docs/workflow-os/backlog.md`

### Phase 1: DB collections + models
- Completed (additive models):
  - packs, workflow_definitions, workflow_definition_versions
  - workflow_instances, workflow_events
  - tasks, forms, workflow_documents, field_mappings

### Phase 2: Workflow core APIs
- Completed baseline:
  - definitions/version publish
  - instances start/get/event submit
  - task list/complete
  - pack list/install/import
  - workflow document create/tag

### Phase 3: Basic task/timeline UI
- Completed baseline pages:
  - `/tasks`
  - `/instances/:id`
  - `/workflows/library`
  - `/workflows/:id/editor`

### Phase 4: Pharma pack templates + adapter
- Completed baseline:
  - `packs/pharma_audit/*` templates and README
  - pack seed script
  - legacy audit-request adapter (feature flag controlled)

### Phase 5: Onboarding UI + template library
- Completed baseline:
  - `/onboarding/use-cases`
  - `/onboarding/templates`
  - `/onboarding/roles`
  - `/onboarding/field-mapping`

### Phase 6: Hardening (next)
- RBAC tightening per node/instance access
- SLA/escalation event engine integration
- richer audit trail linking across legacy + Workflow OS

### Phase 7: AI node expansion (next)
- async skill execution queue
- confidence/explainability metadata
- configurable policy for dynamic guideline mapping updates

## Enhancement backlog

1. Visual drag-and-drop workflow editor (replace JSON-first editor).
2. Form builder UI with validation rules and reusable fragments.
3. Instance replay and deterministic state reconstruction from events.
4. Cross-instance analytics (cycle time, bottleneck, SLA misses).
5. Pack marketplace governance workflow (approve/publish/deprecate packs).
6. Template diff view between versions.
7. Field mapping CRUD API and transform DSL.
8. Bi-directional legacy event bridge for complete historical timeline.

## Risks

1. Dual-run drift: legacy flow and Workflow OS state may diverge without stronger reconciliation.
2. Guard expression safety: string guards need sandboxing/whitelisting.
3. Tenant context errors: existing app has mixed role/session patterns; strict tenant checks needed.
4. Document API overlap: legacy `/api/documents` and workflow-documents need clear UX/API boundaries.
5. Pack quality: malformed pack templates can break publish/start without stricter validation.

## Testing strategy

### Unit tests
- Runtime transitions and guard branches
- Definition validation failures
- Task completion authorization

### Integration tests
- definition create/publish
- instance start -> task complete -> end state
- pack import -> definition creation

### Regression tests
- legacy audit request creation unaffected when flags off
- legacy report/questionnaire flows unaffected

## Performance considerations

1. `workflow_events` growth: maintain snapshot in `workflow_instances`.
2. Task inbox query performance: covered indexes on assignee/status/due date.
3. Timeline pagination for large instances.
4. Avoid embedding large docs in event payloads; store refs only.

## Security and tenant isolation

1. Mandatory `tenantId` filter on all Workflow OS entity queries.
2. Role checks on admin-only operations (publish, install/import).
3. Append-only workflow events (no update endpoint).
4. Future: guard-expression sandboxing and signed pack manifests.
5. Auditability: actor id/role captured for workflow events and task completion.

