---
doc: ROLLOUT_PLAN
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: org-directory
status: current
---

# Org Directory Rollout Plan

## Phase 0
- Deploy additive schemas and feature flags with all org features OFF by default.
- Validate server boot and existing audit flows.
- Dry-run backfill scripts in lower environments.

## Phase 1
- Enable `ORG_DIRECTORY_ENABLED` for one pilot tenant.
- Claim tenant-to-organization mapping.
- Validate organization resolution on audit creation.
- No UI dependency required for current flows.

## Phase 2
- Enable `ENGAGEMENTS_ENABLED` and `ORG_MARKETPLACE_ENABLED` for pilot tenant.
- Create first engagement records and catalog listings.
- Validate cross-company access through engagement participants only.

## Phase 3
- Enable `QUALIFICATION_CASES_ENABLED`.
- Link qualification cases to selected audit programs.
- Backfill historical engagements and optionally link audits.

## Monitoring
- Monitor 4xx/5xx rates on:
  - `/api/org-directory/*`
  - `/api/engagements/*`
  - `/api/org-catalog/*`
  - `/api/qualification-cases/*`
- Track migration log failures in `organization_migration_logs`.
- Sample-check audit creation records for null vs populated org fields by tenant.

## Rollback
- Disable tenant/module flags first.
- Disable global env flags if needed.
- Leave data in new collections untouched unless explicit cleanup is required.

## Manual Verification
1. Existing buyer creates audit without org fields.
2. Pilot tenant creates audit with org feature on.
3. Claim organization and create engagement.
4. Verify engagement access is scoped and time-bounded.
5. Dry-run and commit backfill scripts in sequence.
