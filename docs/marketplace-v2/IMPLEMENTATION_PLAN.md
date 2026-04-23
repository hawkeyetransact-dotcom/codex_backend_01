---
doc: IMPLEMENTATION_PLAN
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: marketplace
status: current
---

# Marketplace Catalog V2 Pre-Code Analysis

## 1. Current Functionality Inventory

### Backend routes and modules already in use
- `src/routes/supplierProductRoutes.js`
  - bulk Excel upload (`/add-products`)
  - single legacy add (`/add-product`)
  - newer supplier canonical create (`POST /api/supplier-products`)
  - list/update/delete/detail endpoints
- `src/routes/productSiteMappingRoutes.js`
  - site-product upsert path for supplier-side mapping
- `src/routes/apiMasterRoutes.js`
  - API master search/list/status/refresh
- `src/routes/buyerRoutes.js`
  - buyer marketplace supplier/product paths consume legacy supplier products and mappings
- `src/routes/digilockerRoutes.js`
  - evidence document upload, versioning, tagging, question attachment, checklist
- `src/routes/orgDirectoryRoutes.js`, `src/routes/engagementRoutes.js`, `src/routes/qualificationCaseRoutes.js`
  - recently added additive org/engagement/qualification layer

### Existing backend models relevant to marketplace work
- `src/models/supplierMasterProductModel.js`
  - current supplier product master; tightly coupled to CAS, plant_id, apiTechnology
- `src/models/productSiteMappingModel.js`
  - current supplier/site/product association layer
- `src/models/apiMasterModel.js`
  - current canonical API master only for API-class products
- `src/models/publicIntelModels.js`
  - public suppliers, sites, APIs, inspections, actions, filings, sources
- `src/models/digilockerDocumentModel.js`
  - tenant-owned controlled evidence library with site/product hooks
- `src/models/documentModel.js`
  - generic redaction/sharing-aware document store
- `src/models/orgDiscoveryModels.js`
  - org catalog items and marketplace listings, but not yet a normalized pharma product library
- `src/models/engagementModels.js`
  - collaboration boundary already available
- `src/models/qualificationModels.js`
  - qualification layer already available

### Existing frontend product and marketplace surfaces
- `app/(console)/products/*`
  - current product catalog UI for supplier product add/edit/view/list
- `components/products/form.tsx`
  - product form based on `schemas/products.ts`
- `components/onboard/products.tsx`
  - onboarding product add + import from documents
- `components/mass-upload/form.tsx`
  - generic bulk upload UI wired to supplier products / sites / audit history
- `app/(console)/supplier-marketplace/*`
  - buyer discovery page for supplier marketplace
- `components/supplier/ApiLibrary.tsx`, `components/library/ApiLibrary.tsx`
  - existing API master claiming flow
- `components/digilocker/*`
  - evidence upload and attachment UX already available

### Existing data handling and shared utilities
- `src/config/featureFlags.js`
- `src/services/moduleConfigService.js`
- `src/middlewares/authMiddleware.js`
- `src/middlewares/validate.js`
- `src/utils/normalization.js`
- `actions/products.ts` and `schemas/products.ts` on the frontend

### Existing workflow engines that must not regress
- audit requests / RFQs / audit execution questionnaire
- DigiLocker uploads and evidence attachment
- org directory / engagements / qualification cases
- supplier onboarding and mass upload

## 2. Impact Analysis

### Files/modules that will be touched
#### Backend additive extensions
- `src/config/featureFlags.js`
- `src/services/moduleConfigService.js`
- `src/app.js`
- new `src/models/productCatalogV2Models.js`
- new `src/services/marketplaceCatalog/*`
- new `src/controllers/marketplaceCatalogController.js`
- new `src/routes/marketplaceCatalogRoutes.js`
- new `src/validators/marketplaceCatalogValidators.js`

#### Frontend additive extensions
- route constants and sidebar config for a new V2 catalog screen
- new page/workspace under `app/(console)/product-library-v2`
- new API client and form schema consumers
- admin overview toggle additions for marketplace flags

### Shared interfaces that must stay stable
- `/api/supplier-products/*`
- `/api/product-site-mappings/upsert`
- `/api/api-master/*`
- buyer marketplace response shapes already used by frontend
- DigiLocker upload and attachment endpoints

### What should not be directly replaced
- `supplier-master-products` and `product-site-mappings` as runtime dependencies for existing screens
- `api-master` as existing API library source
- current onboarding product form and mass upload

### Adapter points
- Legacy-to-v2 mapper from `supplier-master-products` + `product-site-mappings` into claim/listing shadows
- V2-to-legacy facade for any UI that still expects current product rows
- DigiLocker document linking as the evidence layer for product claims
- Org catalog items as a discovery/listing complement, not a replacement for the normalized product library

## 3. Regression Risk Matrix

### Low-risk additive modules
- new root sidecar files (`schemas`, `ui`, `sources`, `crawlers`, `parsers`, `pdf_extract`, `normalize`, `entity_resolution`, `etl`, `storage`, `integration`, Python tests)
- new backend v2 models/routes/controllers under dedicated names
- new frontend page under new route
- new feature flags

### Medium-risk shared changes
- adding new flags to `src/config/featureFlags.js`
- exposing flags via `moduleConfigService`
- mounting a new backend route in `src/app.js`
- adding a new menu item or admin toggle on the frontend

### High-risk coupled areas
- altering `supplierProductController.js`
- changing `schemas/products.ts`
- changing existing supplier product payload shape
- mutating buyer marketplace queries to read only new models

Mitigation:
- no replacement of legacy routes in this phase
- new v2 module plus optional compatibility facade only
- legacy screens remain available and unchanged

## 4. Safe Integration Strategy

1. Add new domain models first:
   - canonical products
   - product variants
   - supplier product claims
   - supplier offers/listings
   - site mappings
   - compliance records
   - evidence links
   - provenance and refresh runs
2. Add feature flags and admin/module exposure.
3. Add service-layer compatibility mappers.
4. Add new v2 endpoints; keep existing endpoints untouched.
5. Add a new frontend page and API client for v2 catalog workflows.
6. Keep old product pages operational; do not redirect them.
7. Reuse DigiLocker for evidence attachment metadata instead of inventing a new upload engine.
8. Add reset/reseed/reindex scripts for the new domain.
9. Add tests for new paths and smoke/regression checks for current product creation/listing.

## 5. Data Strategy

- Existing data does not need to be preserved.
- Existing collections remain so old screens keep functioning.
- New v2 collections can be safely truncated and rebuilt.
- A reset script will drop only marketplace-v2-related collections and optional sidecar indexes.
- Demo reseed will create synthetic canonical products, supplier claims, site mappings, offers, evidence, and provenance.
- A compatibility backfill can hydrate v2 shadows from existing supplier products when needed.

## 6. Recommended Implementation Shape

### New V2 objects
- `catalog_products`
- `catalog_product_variants`
- `supplier_product_claims_v2`
- `supplier_product_offers_v2`
- `supplier_product_site_links_v2`
- `compliance_claim_records_v2`
- `product_evidence_links_v2`
- `product_provenance_events_v2`
- `product_merge_events_v2`
- `product_refresh_runs_v2`
- `product_review_queue_v2`

### Existing infrastructure to reuse
- tenant isolation
- org directory and engagements
- qualification cases
- DigiLocker documents
- API master
- frontend MUI + RHF patterns

## 7. Explicit Non-Goals for this phase
- Replacing all existing product screens
- Rewriting buyer marketplace entirely
- Moving existing audit flows to the new product IDs immediately
- Building a full production crawler control plane inside the request lifecycle

## 8. Expected Outcome of this phase
- Hawkeye can run a normalized product-library v2 in parallel with current product flows.
- Suppliers can claim existing canonical products, map them to sites, attach evidence, and create offers.
- The repo contains source manifests, sidecar crawlers/parsers/extractors/ETL assets, reset/reseed utilities, and compatibility layers.
- Existing runtime flows remain operational.
