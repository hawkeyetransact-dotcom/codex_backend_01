# eQMS DB Evolution Proposal

## Design Constraints
- Additive only
- No collection renames
- No field removals
- Existing APIs and UI routes remain intact
- Legacy GMP audit flow must keep working while new kernel structures are introduced in parallel

## A. Proposed New Kernel Collections
- `workflow_types`: workflow family + version registry
- `cases`: generic workflow runtime root
- `tasks`: normalized work items inside a case
- `audit_events`: append-only kernel event ledger
- `outbox_events`: durable integration/outbox queue
- `signatures`: reusable e-signature / attestation store
- `retention_policies`: retention and archival rules
- `legal_holds`: deletion/archival holds
- `tenant_capabilities`: normalized entitlement matrix
- `workflow_type_capabilities`: workflow-type required capabilities
- `parties`: generalized people/org/site/external participant abstraction
- `role_bindings`: bind parties to cases/tasks/subjects
- `standards_packs`: reusable pack of controls, evidence, signatures, retention, and defaults

## B. Proposed Additive Extensions to Existing Collections
### `audit-requests-master`
Add optional: `caseId`, `workflowTypeKey`, `workflowVersion`, `subjectType`, `subjectRef`, `standardsPackKeys[]`, `primaryTaskIds[]`

### `auditQuestions`
Add optional: `caseId`, `taskId`, `questionVersion`, `responseVersion`, `subjectRef`

### `audit-artifacts`, `evidence`, `digilocker_documents`, `audit-reports`, `capas`
Add optional: `caseId`, `taskId`, `workflowTypeKey`, `subjectType`, `subjectRef`, `standardsPackKeys[]`, `retentionPolicyId`, `legalHoldIds[]`

### `engagements`, `qualification_cases`, `assessments`
Add optional: `caseId`, `workflowTypeKey`, `workflowVersion`, `subjectRef`

## C. Generic Linking Model
- Use `entityType/entityId` across kernel collections where the linked object is heterogeneous.
- Add reusable `subjectRef` with `subjectType`, `entityType`, `entityId`, `naturalKey`, and `label`.
- Move toward a generic evidence-link abstraction instead of audit-specific linking only.
- Link signatures via `caseId`, `taskId`, `entityType`, and `entityId`.

## D. Workflow Abstraction
- GMP audit becomes one workflow type: `GMP_AUDIT`
- Current `audit-requests-master` becomes a legacy-compatible case projection
- Other workflows reuse the same runtime: `ORGANIC_SUPPLY_CHAIN`, `FOREST_CHAIN_OF_CUSTODY`, `REAL_ESTATE_P2P`, `HIGH_TICKET_ITEM_TRANSFER`

## E. Future Master vs Transaction Model
- Master/reference: tenants, users, orgs, sites, products/catalogs, templates, standards, capabilities, retention policies, workflow types
- Transaction runtime: cases, tasks, signatures, legal holds, outbox events, kernel audit events
- Append-only: kernel audit events, outbox events, signatures, snapshots, status histories

## F. Migration Strategy
1. Introduce kernel collections with no behavioral change.
2. Add optional kernel linkage fields to legacy audit documents.
3. Backfill `cases` for existing audits.
4. Project legacy audit state into kernel tasks and milestones.
5. Keep existing APIs reading legacy collections while enriching responses from kernel relations.
6. Put new workflow families directly on kernel `cases` and `tasks`.

## Compatibility Principle
Legacy GMP audit endpoints continue to work against `audit-requests-master`, but every new audit should also have a kernel `case` record and normalized `task` records.
