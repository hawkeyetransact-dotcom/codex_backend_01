---
doc: API_SPEC
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: eqms-intelligence
status: current
---

# eQMS Intelligence API Specification

Base path: `/api/eqms-intel`

All endpoints require authentication and tenant-scoped access.

## Systems
- `GET /systems`
  - Returns supported connector systems and capabilities.

## Internal CAPA (eQMS)
- `POST /sync/internal-capas`
  - Body:
    - `system` (required): `trackwise|mastercontrol|veeva|eurofins`
    - `supplierId` (optional)
    - `siteId` (optional)
    - `connectionId` (optional)
    - `limit` (optional, default 500)
- `GET /internal-capas`
  - Query: `supplierId`, `siteId`, `externalSystem`, `status`, `page`, `limit`

## External CAPA (Hawkeye projection)
- `POST /sync/external-capas`
- `GET /external-capas`
  - Query: `supplierId`, `siteId`, `status`, `page`, `limit`

## External Audit (Hawkeye projection)
- `POST /sync/external-audits`
- `GET /external-audits`
  - Query: `supplierId`, `siteId`, `status`, `auditType`, `page`, `limit`

## CAPA Risk Indicators
- `POST /risk/recompute`
  - Body or Query:
    - `supplierId` (required)
    - `siteId` (optional)
- `GET /risk/indicators`
  - Query: `supplierId`, `siteId`, `riskLevel`, `page`, `limit`

## Dynamic Questionnaire
- `POST /questionnaire/recommendations`
  - Body or Query:
    - `supplierId` (required)
    - `siteId` (optional)
    - `auditType` (optional)
  - Output: contextual recommendation packs and questions.

## Evidence Aggregation
- `POST /evidence/collect`
  - Body/Query: `supplierId`, `siteId`, `connectionId`, `includeInternal`, `includeExternal`
- `POST /evidence/index`
  - Body:
    - `evidenceItems[]` (required)
- `POST /evidence/link`
  - Body:
    - `auditId` (required)
    - `evidenceItems[]` (required)

## Unified Dashboard + Analytics
- `GET /dashboard/unified-capas`
  - Query: `supplierId`, `siteId`, `status`, `page`, `limit`
- `GET /dashboard/audit-intelligence`
  - Query: `top` (optional)

## Error format
```json
{
  "error": "message"
}
```

## Success format
```json
{
  "success": true,
  "data": {}
}
```
