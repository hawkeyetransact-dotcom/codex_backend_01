---
doc: TARGET_ADDITIVE_SCHEMA
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: org-directory
status: current
---

# Target Additive Schema

## New Collections
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

## Key Design Rules
- `Tenant` remains the hard isolation boundary
- `Organization` is a global directory record
- `org_claims` links tenant to organization without replacing tenant
- `engagements` create an explicit buyer-supplier collaboration perimeter
- `qualification_cases` sit above audits and can optionally link down into them
- Existing audit/doc/CAPA/report flows remain valid with null org fields

## Additive Existing-Model Fields
- `audit-requests-master`
  - `buyerOrgId`
  - `supplierOrgId`
  - `engagementId`
  - `qualificationCaseId`
- `assessments`
  - `buyerOrgId`
  - `supplierOrgId`
  - `engagementId`
  - `qualificationCaseId`
- `audit-reports`
  - `buyerOrgId`
  - `supplierOrgId`
  - `engagementId`
  - `qualificationCaseId`
- `audit-artifacts`
  - `engagementId`
  - `qualificationCaseId`
- `capas`
  - `engagementId`
  - `qualificationCaseId`
- `assessment-capas`
  - `engagementId`
  - `qualificationCaseId`
- `documents`
  - `ownerOrgId`
  - `engagementId`
  - `qualificationCaseId`
  - `classification`
- `digilocker_documents`
  - `ownerOrgId`
  - `engagementId`
  - `qualificationCaseId`
  - `classification`
- `integration-connections`
  - `ownerOrgId`
  - `sharedOrgIds`

## Access Control Model
- RBAC remains unchanged
- ABAC is engagement/object scoped
- Cross-company access requires one of:
  - active engagement participant membership
  - object ACL grant
  - public marketplace visibility

## Backfill Scope
- Organizations from tenants and company profiles
- Org sites from supplier sites
- Engagements from existing audit buyer/supplier relationships
- Optional audit linkage when confidently derivable
