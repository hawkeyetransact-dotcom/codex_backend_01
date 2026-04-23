---
doc: risk-current-state-analysis
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: roadmap
status: current
---

# Risk Module Current-State Analysis (Dev Branch)

## Scope
- Branch/worktree inspected: `dev` (`_wt_backend_dev_artifacts_20260223` and `_wt_frontend_dev_artifacts_20260223`).
- Focus intentionally limited to risk/FDA/buyer-supplier aggregation path.
- No broad refactor; inspection-first analysis.

## 1) Existing Schemas / Collections Found

### Core risk collections
- `supplier-public-signals`  
  File: `src/models/SupplierPublicSignal.js`  
  Purpose: Manual/imported public risk signals (483 count, warning letter flag, import alert flag, recalls, sources).
- `supplier-risk-metrics`  
  File: `src/models/SupplierRiskMetrics.js`  
  Purpose: Operational metrics (on-time rate, CAPA quality, response SLA, evidence quality).
- `supplier-risk-snapshots`  
  File: `src/models/SupplierRiskSnapshot.js`  
  Purpose: Persisted scored outputs by timestamp (`finalScore`, `finalScoreV2`, `riskBand`, `breakdown`, `reasons`, `v2`).
- `supplier-risk-events`  
  File: `src/models/SupplierRiskEvent.js`  
  Purpose: Audit/event trail for risk recalculation and manual overrides.
- `supplier-network-links`  
  File: `src/models/SupplierNetworkLink.js`  
  Purpose: Supplier network exposure edges used by V2.
- `evidence-findings`  
  File: `src/models/EvidenceFinding.js`  
  Purpose: Evidence-level findings used by V2 trust adjustments.
- `buyer-risk-profiles`  
  File: `src/models/BuyerRiskProfile.js`  
  Purpose: Buyer-specific weighting profiles; no buyer snapshot aggregation collection exists.

### FDA collections
- `FdaInspection`  
  File: `src/models/fdaInspectionModel.js`
- `FdaCitation`  
  File: `src/models/fdaCitationModel.js`
- `Fda483`  
  File: `src/models/fda483Model.js`
- `FdaDashboardSnapshot`  
  File: `src/models/fdaDashboardSnapshotModel.js`

### Relationship / workflow collections relevant to buyer-supplier mapping
- `audit-requests-master`  
  File: `src/models/auditRequestsMasterModel.js`  
  Fields relevant to mapping: `tenantOrgId`, `create_by_buyer_id`, `supplier_id`, `site_id`, `supplier_product_id`, `isArchived`.
- `supplier-profiles`  
  File: `src/models/supplierProfileModel.js`  
  Contains `user_id` (supplier user) and `tenant_id`.
- `supplier-sites`  
  File: `src/models/supplierSiteDataModel.js`  
  Used for supplier-specific FDA filtering support.

## 2) Existing Risk Logic Found

### Supplier scoring pipeline (implemented)
- Orchestrator: `src/services/risk/riskOrchestrator.js`
- Scoring:
  - V1: `src/services/risk/scoringV1.js`
  - V2 optional: `src/services/risk/scoringV2.js` gated by `RISK_V2_ENABLED`
- Supporting logic:
  - `trend.js`, `evidenceTrust.js`, `networkExposure.js`, `auditorNormalization.js`, `breakdown.js`, `reasons.js`, `improvements.js`
- Triggering:
  - Manual/admin endpoints enqueue recalculation: `src/controllers/riskAdminController.js`
  - Queue: `src/jobs/riskQueue.js`
  - Cron scheduler: `src/jobs/riskCron.js` (`RISK_CRON_ENABLED`)
- Persistence:
  - Writes snapshots to `supplier-risk-snapshots`
  - Logs events to `supplier-risk-events`

### Buyer risk logic (partially implemented)
- Summary endpoint: `getBuyerRiskSummary` in `src/controllers/riskBuyerController.js`
  - Current behavior before fix: fetch suppliers via `SupplierProfile` (tenant filtered), join latest supplier snapshots.
- Detail endpoint: `getBuyerRiskDetail`
  - Returns latest + trend snapshots for selected supplier.
  - Applies buyer weighting profile if available.
- Buyer weighting profiles: CRUD present via `BuyerRiskProfile`.

### FDA logic
- Ingestion/update and snapshot rebuild: `src/services/fdaDataService.js`
- API endpoints: `src/routes/fdaRoutes.js`, `src/controllers/fdaController.js`
- Supplier role scoping utility: `src/utils/fdaScope.js` (`buildSupplierFdaFilter` from supplier profile/site terms).

## 3) Existing Supplier-Level Behavior
- Supplier can load own risk (`GET /api/supplier/me/risk`) via `src/controllers/riskSupplierController.js`.
- Data returned: latest snapshot, trend (last 6), improvement checklist.
- This path is functional and directly backed by persisted `SupplierRiskSnapshot`.

## 4) Buyer-Level Aggregation Status
- Buyer-level risk exists as API behavior but is not persisted in a dedicated buyer snapshot collection.
- Summary is generated on read by combining supplier profile rows + latest supplier snapshot.
- Buyer-specific weighting exists at detail view level (and profile config level), not as full buyer portfolio materialization.

## 5) Data Flow Trace (FDA historic data path)

### FDA dashboard path
1. Source: FDA DDAPI (`inspections_classifications`, `inspections_citations`) via `fdaDataService.fetchAll`.
2. Normalize/map: `mapInspection`, `mapCitation`.
3. Persist:
   - `FdaInspection`, `FdaCitation`
   - `Fda483` currently left empty from DDAPI path (code comment: endpoint not exposed).
4. Aggregate:
   - `buildDashboardStats` -> `FdaDashboardSnapshot`.
5. Serve:
   - `GET /api/fda/dashboard`, `/inspections`, `/citations`, `/forms483`.
6. UI:
   - Frontend `app/(console)/fda-dashboard/page.tsx` via `/api/next/fda/*`.

### Supplier risk path
1. Source: `SupplierPublicSignal` + `SupplierRiskMetrics` (+ optional findings/network).
2. Score: V1/V2 in orchestrator.
3. Persist: `SupplierRiskSnapshot`.
4. Serve:
   - Supplier self-risk (`/api/supplier/me/risk`).
   - Buyer risk summary/detail (`/api/buyer/suppliers/*`).

## 6) Existing APIs / Routes Found
- Buyer risk:
  - `GET /api/buyer/suppliers/risk-summary`
  - `GET /api/buyer/suppliers/:supplierId/risk`
  - `GET/POST/PUT /api/buyer/risk-profiles...`
- Supplier risk:
  - `GET /api/supplier/me/risk`
- Admin risk:
  - Public signals, risk metrics, recalc, network links, evidence findings under `/api/admin/...`
- FDA:
  - `/api/fda/update`, `/api/fda/dashboard`, `/api/fda/rebuild-snapshot`, `/api/fda/inspections`, `/api/fda/citations`, `/api/fda/forms483`

## 7) Frontend Integration Points Found
- Buyer summary page: `app/(console)/buyer/suppliers/page.tsx`
- Buyer detail page: `app/(console)/buyer/suppliers/[id]/risk/page.tsx`
- Supplier risk page: `app/(console)/supplier/risk/page.tsx`
- Admin risk editors:
  - `app/(console)/admin/suppliers/[id]/public-signals/page.tsx`
  - `app/(console)/admin/suppliers/[id]/risk-metrics/page.tsx`
  - `app/(console)/admin/suppliers/[id]/network/page.tsx`
- API client: `lib/riskApi.ts`
- Next proxy route: `app/api/next/risk/[...slug]/route.ts`

## 8) Current Issue Classification

### What appears to work
- Supplier scoring and snapshot generation.
- Admin edit/recalc path.
- Supplier self-risk read path.

### What appears incomplete/problematic
- Buyer supplier scope in risk summary/detail is currently derived from `SupplierProfile.tenant_id` matching buyer tenant.
- In multi-tenant buyer-supplier setups, suppliers can be outside buyer tenant and linked through `audit-requests-master` relationships.
- As a result, buyer risk summary can be empty/partial even when supplier snapshots exist.

## 9) Most likely root cause
- **Selected classification: mixed issue (primarily mapping/data-scope problem).**
- Why:
  - Supplier-level scoring code exists and is structurally complete.
  - Buyer-level API exists but supplier scope resolution is too strict/tenant-profile based.
  - Demo outcomes can fail if mapping data exists only in audit relationships (not tenant-matching supplier profiles).
  - Secondary factor: stale/missing seeded risk records can further reduce visible results.

## 10) Is issue likely data-only or code?
- Not purely data-only.
- Main gap is a **mapping path mismatch** in buyer aggregation query strategy.
- Data freshness can still be a secondary failure mode (missing signals/metrics/snapshots for mapped suppliers).

## 11) Exact Files Involved and Change Risk

| File | Role in flow | Change risk |
|---|---|---|
| `src/controllers/riskBuyerController.js` | Buyer summary/detail aggregation and access checks | **Medium** (API behavior change if scope broadened) |
| `src/models/auditRequestsMasterModel.js` | Buyer-supplier relationship source | **Low** (read-only usage proposed) |
| `src/models/supplierProfileModel.js` | Supplier identity/profile display fields | **Low** (read-only usage) |
| `src/models/SupplierRiskSnapshot.js` | Snapshot source for scores | **Low** (read-only usage) |
| `src/controllers/riskSupplierController.js` | Supplier self-risk read | **Low** (no change recommended) |
| `src/controllers/riskAdminController.js` | Recalc/edit path | **Low** (no change recommended initially) |
| `src/services/risk/riskOrchestrator.js` | Scoring computation | **High** (avoid changing in first fix) |
| `scripts/seed-risk-demo.js` | Demo seed data | **Low** (safe for data backfill) |
| `scripts/seed-risk-suppliers.js` | Supplier risk backfill | **Low** (safe for data backfill) |
| `app/(console)/buyer/suppliers/page.tsx` | Buyer risk UI table | **Low** (no immediate change required) |
| `lib/riskApi.ts` | Frontend API binding | **Low** (no immediate change required) |

## 12) Safest Extension Path Recommendation
1. Keep supplier scoring pipeline unchanged.
2. Extend buyer scope resolution in `riskBuyerController` to use buyer-supplier linkage from `audit-requests-master` first.
3. Keep existing tenant-profile filter as backward-compatible fallback.
4. Validate with focused test for cross-tenant supplier linked by buyer audit request.
5. Only after mapping/data path is proven, evaluate any scoring refinements.

## 13) Validation Checklist (Current State)
- [ ] Confirm `supplier-risk-snapshots` rows exist for target suppliers.
- [ ] Confirm buyer-linked supplier IDs exist in `audit-requests-master` (`tenantOrgId` and/or `create_by_buyer_id`).
- [ ] Confirm buyer summary endpoint returns those suppliers even when `supplier-profiles.tenant_id` differs.
- [ ] Confirm buyer detail endpoint authorization allows mapped supplier access.
- [ ] Confirm risk band/counts in UI match API rows.
- [ ] Confirm no regression for same-tenant legacy behavior.

## 14) Seed/Backfill Recommendation
- First run dry validation:
  - `npm run risk:validate`
- To auto-create missing public signal/metrics and recalculate missing snapshots for buyer-linked suppliers:
  - `npm run risk:backfill`
- Optional scoped runs:
  - `node scripts/risk_validate_and_backfill.js --dryRun --tenantId <TENANT_OBJECT_ID>`
  - `node scripts/risk_validate_and_backfill.js --apply --tenantId <TENANT_OBJECT_ID>`
  - `node scripts/risk_validate_and_backfill.js --apply --buyerId <BUYER_USER_OBJECT_ID>`
