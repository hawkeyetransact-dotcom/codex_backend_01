# Risk Incremental Fix Plan (Dev Branch)

## Objective
Deliver buyer-level risk aggregation behavior for demo readiness by reusing existing supplier scoring outputs and applying the smallest safe extension first.

## Guardrails
- No broad refactor.
- Preserve existing schemas/routes/API contracts.
- Reuse existing supplier scoring and snapshots.
- Isolate to risk/FDA/mapping path.
- Keep backward compatibility for existing tenant-scoped behavior.

---

## Stage 0 — Inspection and Data Validation

### Purpose
Confirm what already exists and whether issue is code, data, or both.

### Files touched
- `docs/risk-current-state-analysis.md` (documentation only)

### Risk level
- Low (documentation only)

### Rollback
- N/A

### Validation method
- Code inventory complete for models/services/routes/frontend.
- Validate collection existence and read paths.

### Code/data change required
- No production code change.

---

## Stage 1 — Confirm Supplier-Level Logic is Working

### Purpose
Ensure supplier scoring path is intact before buyer-side changes.

### Files touched
- Read-only verification of:
  - `src/services/risk/riskOrchestrator.js`
  - `src/controllers/riskSupplierController.js`
  - `src/controllers/riskAdminController.js`
  - `src/jobs/riskQueue.js`

### Risk level
- Low (verification only)

### Rollback
- N/A

### Validation method
- Trigger recalc for sample supplier; verify new row in `supplier-risk-snapshots`.
- Verify `/api/supplier/me/risk` returns latest + trend.

### Code/data change required
- Usually no code change.
- Data backfill may be required if snapshots missing.

---

## Stage 2 — Validate Collection Population

### Purpose
Check if required records are missing/stale (signals, metrics, snapshots).

### Files touched
- Optional data scripts:
  - `scripts/seed-risk-suppliers.js`
  - `scripts/seed-risk-demo.js`

### Risk level
- Low to Medium (data mutation only)

### Rollback
- Re-run with corrected data or clean target demo records by supplier IDs.

### Validation method
- Count records per supplier:
  - `supplier-public-signals`
  - `supplier-risk-metrics`
  - `supplier-risk-snapshots`
- Confirm latest snapshot timestamps.

### Code/data change required
- Prefer data fix first if empty/stale.

---

## Stage 3 — Identify Buyer-Supplier Mapping Path

### Purpose
Determine canonical source for buyer-to-supplier visibility for risk summary.

### Files touched
- Read and use:
  - `src/models/auditRequestsMasterModel.js`
  - `src/controllers/riskBuyerController.js`

### Risk level
- Low (analysis)

### Rollback
- N/A

### Validation method
- Verify `audit-requests-master` has `supplier_id` rows for buyer scope:
  - by `tenantOrgId`
  - and/or `create_by_buyer_id`

### Code/data change required
- Likely code change in controller query logic.

---

## Stage 4 — Design Smallest Buyer Aggregation Extension

### Purpose
Add buyer supplier resolution without altering scoring formula or model structure.

### Files touched
- `src/controllers/riskBuyerController.js`

### Risk level
- Medium (read-path behavior change)

### Rollback
- Revert single controller patch.
- Fallback behavior remains as old tenant-profile query.

### Validation method
- API-level checks:
  - `GET /api/buyer/suppliers/risk-summary`
  - `GET /api/buyer/suppliers/:supplierId/risk`
- Verify:
  - mapped suppliers are visible
  - unauthorized suppliers still blocked
  - legacy same-tenant behavior unchanged

### Code/data change required
- Yes (small controller patch only).

---

## Stage 5 — Test with Seed/Demo Data

### Purpose
Ensure behavior works in realistic demo data conditions.

### Files touched
- Optional script execution:
  - `npm run seed:risk-suppliers`
  - `npm run seed:risk-demo`
- Test file updates if needed:
  - `test/riskApi.test.js`

### Risk level
- Low to Medium

### Rollback
- Remove/adjust seeded demo records.
- Revert test changes if flaky.

### Validation method
- Cross-tenant supplier linked via audit request appears in buyer risk summary.
- Buyer detail endpoint returns latest snapshot and trend.
- Run:
  - `npm run risk:validate`
  - `npm run risk:backfill` (only when dry run reports gaps)

### Code/data change required
- Test changes recommended; data seeding as needed.

---

## Stage 6 — Wire Minimal UI Only If Needed

### Purpose
Only patch UI if backend fix alone does not surface expected data.

### Files touched (if needed only)
- `app/(console)/buyer/suppliers/page.tsx`
- `app/(console)/buyer/suppliers/[id]/risk/page.tsx`
- `lib/riskApi.ts`

### Risk level
- Low (display layer)

### Rollback
- Revert UI changes; backend remains intact.

### Validation method
- Table rows render returned API data.
- Detail page opens and shows latest/trend/buyer-specific score.

### Code/data change required
- Usually no change required if API contract unchanged.

---

## Stage 7 — Scoring Refinement (Only After Path Proven)

### Purpose
Tune weights/formula only after data, mapping, and aggregation are verified.

### Files touched (future stage)
- `src/services/risk/scoringV1.js`
- `src/services/risk/scoringV2.js`
- `src/services/risk/buyerWeighting.js`
- Optional model/version metadata fields (if needed)

### Risk level
- High (business meaning and trend comparability impact)

### Rollback
- Feature-flag versioning (e.g., keep prior model version active).
- Recompute snapshots with previous version if required.

### Validation method
- Side-by-side score deltas on same supplier cohort.
- Dashboard distribution comparison by band.

### Code/data change required
- Yes, but explicitly deferred.

---

## Recommended First Fix (Now)
Implement Stage 4 only:
- Extend buyer risk controller supplier scope to resolve mapped suppliers from `audit-requests-master`.
- Preserve existing tenant-profile filter as fallback.
- Add one automated test for cross-tenant mapped supplier visibility.

This gives immediate buyer aggregation correctness without touching formulas, schema names, or unrelated modules.
