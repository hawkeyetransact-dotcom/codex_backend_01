# eQMS Action Plan

## 1. Current System Summary
- Express + Mongoose backend with a Next.js frontend proxy layer
- Live GMP workflow still centered on `audit-requests-master`
- Controllers remain the primary orchestration engine for audit creation, questionnaire lifecycle, evidence attachment, compliance evaluation, reporting, and CAPA
- Additive domains already exist for workflow milestones, status tracking, compliance standards, org directory, qualification cases, engagements, marketplace catalog, and a partial assessment V2 runtime

## 2. Key Problems
- overloaded legacy audit header and questionnaire models
- inconsistent refs and duplicated evidence paradigms
- no single workflow runtime
- scattered status logic
- limited participant/intermediary abstraction
- no first-class signatures, retention, or legal hold kernel

## 3. Target Architecture
- kernel + modules
- workflow runtime with `workflow_types`, `cases`, and `tasks`
- append-only event and outbox layers
- reusable signatures, retention, legal hold, party bindings, and standards packs
- existing audit, evidence, compliance, reporting, notifications, AI, and platform modules sit on top of the kernel

## 4. DB Evolution Strategy
- keep current collections
- extend core legacy collections with optional kernel linkage fields
- add new kernel collections in parallel
- use adapters/projections instead of breaking rewrites

## 5. Phased Implementation Roadmap
### Phase 1: kernel scaffold
Introduce kernel collections and services with no behavioral change.

### Phase 2: module registry
Register modules and workflow types, starting with `GMP_AUDIT`.

### Phase 3: audit -> workflow mapping
Backfill/create a kernel case for each audit request and generate normalized tasks.

### Phase 4: evidence generalization
Bridge legacy evidence and DocVault behind a generic evidence-link abstraction.

### Phase 5: participants/intermediaries
Introduce `parties` and `role_bindings` to decouple workflows from only buyer/supplier/auditor roles.

### Phase 6: standards packs
Bind workflows to reusable standards/evidence/signature/retention packs.

### Phase 7: new workflows
Add `ORGANIC_SUPPLY_CHAIN`, `FOREST_CHAIN_OF_CUSTODY`, `REAL_ESTATE_P2P`, and `HIGH_TICKET_ITEM_TRANSFER` directly on the kernel.

## 6. Backward Compatibility Plan
- keep current API routes unchanged
- keep current UI routes unchanged
- do not rename or drop legacy collections
- dual-write or project into kernel records behind adapters

## 7. Risk Analysis
- dual-write inconsistencies between legacy and kernel records
- controller complexity if kernel logic is embedded too early
- performance overhead from extra joins/lookups
- workflow regression if status projections diverge

## 8. Testing Strategy
- contract tests for existing endpoints
- integration tests for full audit lifecycle through kernel-backed projections
- workflow runtime tests for tasks, role bindings, signatures, and retention
- data reconciliation tests between legacy and kernel state

## 9. Recommended Execution Principle
Do not attempt a big-bang migration. Introduce the kernel first, map GMP audits into it second, generalize evidence/participants/standards third, and only then add new workflow families.
