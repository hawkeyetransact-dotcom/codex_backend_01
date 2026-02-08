## Compliance Engine APIs (No-Cost, Modular)

This module adds a standalone compliance evaluation pipeline that is **separate from autofill**:

- Autofill/manual response capture stays in existing questionnaire APIs.
- Compliance evaluation runs in auditor APIs and can use different regulatory standards by configuration.

### Design goals

- Modular endpoints:
  - Standards registry: `/api/compliance/standards/*`
  - Auditor compliance runs: `/api/auditor/compliance/*`
- No paid LLM dependency:
  - Rule engine is deterministic (`RULES_V1`)
  - Uses existing stored questionnaire responses and metadata
  - Optional DigiLocker evidence suggestions are keyword-ranked and tenant-scoped
- Tenant-safe:
  - All endpoints require `authenticate` + `requireTenantActive`
  - Audit access is validated before run/read/update

---

## 1) Standards Registry APIs

Base path: `/api/compliance/standards`

- `GET /`
  - Query:
    - `includeControls=true|false`
    - `includeArchived=true|false`
  - Roles: `auditor`, `admin`, `tenant_admin`, `superadmin`
- `POST /bootstrap/defaults`
  - Seeds default packs (tenant-local) if missing:
    - `ICH_Q7_CFR21`
    - `ISO9001_QMS`
  - Roles: `admin`, `tenant_admin`, `superadmin`
- `POST /`
  - Create a tenant standard/version
  - Roles: `admin`, `tenant_admin`, `superadmin`
- `GET /:standardKey/:version`
  - Get one standard version
  - Roles: `auditor`, `admin`, `tenant_admin`, `superadmin`
- `PUT /:standardKey/:version`
  - Update one standard version
  - Roles: `admin`, `tenant_admin`, `superadmin`

### Standard payload shape

```json
{
  "standardKey": "ICH_Q7_CFR21",
  "version": "1.0.0",
  "name": "ICH Q7 + 21 CFR",
  "description": "Custom tenant pack",
  "domain": "GMP",
  "scope": "TENANT",
  "status": "ACTIVE",
  "controls": [
    {
      "controlId": "DOCUMENT_CONTROL",
      "title": "Document Control",
      "clauseRef": "ICH Q7 6.1",
      "standardRefs": ["21 CFR 211.100"],
      "keywords": ["sop", "record", "revision"],
      "expectedAnswer": "YES",
      "requiredEvidence": true,
      "weight": 1.2
    }
  ],
  "metadata": {
    "owner": "QA",
    "notes": "Tenant specific mapping"
  }
}
```

---

## 2) Auditor Compliance Run APIs

Base path: `/api/auditor/compliance`

- `GET /runs`
  - Query:
    - `auditId` (optional)
    - `page`, `pageSize`
- `POST /runs`
  - Create run from live questionnaire responses
  - Body:
    - `auditId` (required) or `auditRequestId` (alias)
    - `standardKey` (required)
    - `standardVersion` (required)
    - `mode`: `ADVISORY|FINAL` (optional)
- `GET /runs/:runId`
- `GET /runs/:runId/questions`
  - Query:
    - `page`, `pageSize`
    - `verdict`
    - `reviewStatus`
    - `hydrateSuggestions=true` to compute latest DigiLocker suggestions for the requested page
- `PATCH /runs/:runId/questions/:questionId/verdict`
  - Body:
    - `auditorVerdict`: `COMPLIANT|NON_COMPLIANT|INSUFFICIENT|NOT_APPLICABLE`
    - `reason` (optional)
- `POST /runs/:runId/finalize`
  - Locks run and writes final verdicts
  - Backfills legacy `auditQuestions.isComplient` as:
    - `COMPLIANT -> Yes`
    - `NON_COMPLIANT|INSUFFICIENT -> No`
- `POST /runs/:runId/recompute`
  - Body:
    - `refreshSnapshot=true|false` (default `false`)
    - `preserveAuditorOverrides=true|false` (default `true`)

Roles on all run endpoints: `auditor`, `admin`, `tenant_admin`, `superadmin`

---

## 3) Data Model

Collections introduced:

- `compliance_standard_registry`
- `compliance_response_snapshots`
- `compliance_runs`
- `compliance_question_results`

These are additive and do not replace existing questionnaire collections.

---

## 4) Cost Model

- Engine mode is deterministic (`RULES_V1`) and does not call paid external AI APIs.
- Existing autofill APIs remain as-is; this module itself is no-cost by default.

---

## 5) Operational Notes

- The module is safe to deploy incrementally:
  1. deploy code
  2. call `POST /api/compliance/standards/bootstrap/defaults` per tenant
  3. run `POST /api/auditor/compliance/runs`
- You can add new standard packs without code changes by creating standard versions via API.
