---
doc: DELTA_MANIFEST
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: org-directory
status: current
---

# Org Directory Delta Manifest

## Safe Additive Changes
- Added new collections:
  - `organizations`
  - `org_sites`
  - `org_units`
  - `org_claims`
  - `engagements`
  - `engagement_participants`
  - `marketplace_listings`
  - `org_catalog_items`
  - `trust_badges`
  - `qualification_cases`
  - `qualification_methods`
  - `object_acl_grants`
  - `consent_records`
  - `document_links`
  - `organization_migration_logs`
- Added feature flags:
  - `ORG_DIRECTORY_ENABLED`
  - `ENGAGEMENTS_ENABLED`
  - `ORG_MARKETPLACE_ENABLED`
  - `QUALIFICATION_CASES_ENABLED`
  - `ORG_BACKFILL_WRITE_ENABLED`
- Added optional fields on existing models only:
  - audits
  - assessments
  - reports
  - artifacts
  - CAPAs
  - documents
  - DigiLocker documents
  - integration connections
- Added feature-flagged routes:
  - `/api/org-directory`
  - `/api/engagements`
  - `/api/org-catalog`
  - `/api/qualification-cases`
- Added idempotent backfill scripts with dry-run default.

## Compatibility Strategy
- Existing user/tenant/profile/site/product flows remain the source of truth when new org fields are absent.
- Existing APIs continue to accept legacy payloads unchanged.
- New audit org fields are only resolved/stored when org-directory is enabled for the tenant.
- Legacy fields with misleading names were not repurposed:
  - `auditRfq.supplierOrgId`
  - `auditRfqQuote.auditorOrgId`
  - `digilocker_documents.supplierOrgId`
  - `auditRequestsMaster.tenantOrgId`

## Approval Required Items Deferred
- Renaming any legacy field to mean a true organization ID
- Making org fields mandatory on any existing API
- Replacing tenant-based authorization with org-first authorization
- Replacing user-owned site/product links with org-owned links

## Backfill Strategy
- Dry-run by default
- Idempotent upsert behavior
- Per-run logging in `organization_migration_logs`
- Scoped execution with `--tenantId=<id>`

## Rollback
- Turn feature flags off
- Stop using new routes/scripts
- Ignore or archive new collections
- Optional cleanup can be done using migration log run IDs
