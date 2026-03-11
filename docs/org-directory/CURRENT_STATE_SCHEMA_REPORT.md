# Current State Schema Report

## Persistence Model
- MongoDB + Mongoose only
- Tenant is the current hard isolation boundary
- Users and persona profiles currently stand in for organizations

## Existing Core Identity Model
- `Tenant` is the account boundary
- `users` is the actor boundary
- `buyer-profiles`, `supplier-profiles`, `auditor-profiles` store company-like data redundantly

## Existing Audit Relationship Model
- `audit-requests-master.create_by_buyer_id` -> buyer user
- `audit-requests-master.supplier_id` -> supplier user
- `audit-requests-master.auditor_id` -> auditor user
- `audit-requests-master.site_id` -> `supplier-sites`
- `audit-requests-master.supplier_product_id` -> `supplier-master-products`
- `audit-requests-master.tenantOrgId` is tenant-scoped metadata, not a true organization directory ID

## Existing Marketplace / Vendor Intelligence Model
- `public_suppliers`, `public_sites`, `public_apis` provide public discovery/intel
- `supplier-master-products` and `product-site-mappings` provide tenant-backed supplier catalog data
- Onboarded supplier identity and public supplier identity are not unified today

## Existing Collaboration / ACL Primitives
- `digilocker_access_policies`
- `document_share_policies`
- `access_grants`
- These are suitable adapter points for engagement-scoped ABAC

## Existing Risk Hotspots
1. Buyer/supplier/auditor references are mostly user IDs, not org IDs
2. Site ownership is user-based in `supplier-sites`
3. Product-site mappings are user-based in `product-site-mappings`
4. Several legacy fields have misleading names:
   - `auditRfq.supplierOrgId`
   - `auditRfqQuote.auditorOrgId`
   - `digilocker_documents.supplierOrgId`

## Adapter Points Chosen
- Keep tenant isolation unchanged
- Add new org primitives additively
- Add optional org fields beside current user fields
- Resolve org context through claims and fallback inference only when enabled
