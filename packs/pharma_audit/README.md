# Pharma Audit Pack (`pharma_audit`)

## Overview
This pack encapsulates pharma audit workflow templates and plugin metadata for Workflow OS.

- Pack key: `pharma_audit`
- Version: `1.0.0`
- Manifest: `packs/pharma_audit/manifest.json`

## Included templates
- `standard_gmp_audit` -> `packs/pharma_audit/templates/standard_gmp_audit.json`
- `api_audit` -> `packs/pharma_audit/templates/api_audit.json`
- `psci_saq` -> `packs/pharma_audit/templates/psci_saq.json`

## Node patterns used
- `start`, `end`
- `human_task`, `approval`
- `form`
- `document_request`
- `ai_skill` (for dynamic ICH Q7 mapping/report generation)

## Install and import flow
1. Seed the pack into DB:
- Run backend script: `npm run seed:pharma-pack`

2. Install pack for tenant:
- `POST /api/packs/install` with `{ "packKey": "pharma_audit", "packVersion": "1.0.0" }`

3. Import templates to tenant workflows:
- `POST /api/packs/:id/templates/import`

Example body:
```json
{
  "templateKeys": ["standard_gmp_audit", "api_audit"],
  "publish": true
}
```

## Legacy adaptor compatibility
- If `WORKFLOW_OS_ENABLED=true` and `PHARMA_PACK_ENABLED=true`, new audit requests can auto-start Workflow OS instances (dual-run with legacy flow).

