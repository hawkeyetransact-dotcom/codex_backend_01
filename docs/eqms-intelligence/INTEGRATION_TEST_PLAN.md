---
doc: INTEGRATION_TEST_PLAN
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: eqms-intelligence
status: current
---

# eQMS Intelligence Integration Test Plan

## 1. Scope
- Validate additive eQMS intelligence module under `/api/eqms-intel/*`.
- Confirm no regression in existing audit/CAPA/questionnaire/auth flows.

## 2. Test Data
- Tenant A with at least one supplier and one buyer.
- Integration canonical events seeded for:
  - providerKey: `trackwise`
  - eventType: `CAPA`, `DEVIATION`, `AUDIT_FINDING`
- Existing Hawkeye `capas` and `audit-requests-master` records.

## 3. Functional Scenarios

### S1: Connector discovery
1. Call `GET /api/eqms-intel/systems`.
2. Expect 4 systems with capability list.

### S2: Internal CAPA sync
1. Call `POST /api/eqms-intel/sync/internal-capas` with `system=trackwise`.
2. Call `GET /api/eqms-intel/internal-capas`.
3. Verify records persisted in `internal-capa-references`.

### S3: External projection sync
1. Call `POST /api/eqms-intel/sync/external-capas`.
2. Call `POST /api/eqms-intel/sync/external-audits`.
3. Verify `external-capas` and `external-audits` populated.

### S4: Risk indicator
1. Call `POST /api/eqms-intel/risk/recompute` with `supplierId`.
2. Call `GET /api/eqms-intel/risk/indicators?supplierId=...`.
3. Validate score and risk level mapping.

### S5: Dynamic questionnaire
1. Call `POST /api/eqms-intel/questionnaire/recommendations`.
2. Validate recommendation packs align with CAPA signals.

### S6: Evidence aggregation
1. Call `POST /api/eqms-intel/evidence/collect`.
2. Call `POST /api/eqms-intel/evidence/index`.
3. Call `POST /api/eqms-intel/evidence/link`.
4. Validate evidence links stored under `external-audits.metadata.evidenceLinks`.

### S7: Unified dashboard
1. Call `GET /api/eqms-intel/dashboard/unified-capas`.
2. Validate source labels:
   - internal rows => `source=eQMS`
   - external rows => `source=Hawkeye`

### S8: Analytics
1. Call `GET /api/eqms-intel/dashboard/audit-intelligence`.
2. Validate `topRiskySuppliers`, closure performance, trend outputs.

## 4. Security Tests
- Cross-tenant read attempts must return no foreign data.
- Role checks:
  - View endpoints require authenticated role in allowed set.
  - Sync/recompute endpoints restricted to manage roles.

## 5. Regression Guardrail
- Re-run:
  - risk APIs (`test/riskApi.test.js`)
  - key lint/build checks.
- Manually validate existing endpoints still respond:
  - `/api/buyer/*`
  - `/api/auditor/*`
  - `/api/integrations/*`

## 6. Exit Criteria
- All S1-S8 pass.
- No existing API regressions.
- No schema conflicts.
