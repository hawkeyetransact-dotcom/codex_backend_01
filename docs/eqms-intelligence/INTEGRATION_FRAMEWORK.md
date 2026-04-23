---
doc: INTEGRATION_FRAMEWORK
version: 1.0
updated: 2026-04-22
owner: Hawkeye Platform
category: eqms-intelligence
status: current
---

# Integration Framework Design (eQMS Intelligence)

## Connector Interface
`AuditEvidenceProvider` standardizes all eQMS connectors:
- `fetchInternalCAPA()`
- `fetchAuditFindings()`
- `fetchDeviationRecords()`
- `fetchEffectivenessChecks()`
- `fetchSupportingDocuments()`
- `fetchTrainingRecords()`
- `getCAPARecords()`
- `getAuditRecords()`
- `getDocuments()`
- `getAuditTrail()`
- `syncUpdates()`

## Connector Registry
- `src/integrations/eqms/registry.js`
- Systems:
  - `trackwise`
  - `mastercontrol`
  - `veeva`
  - `eurofins`

## Normalization Flow
1. Connector reads canonical integration events.
2. `internalCapaNormalizationService` maps records to `InternalCAPAReference`.
3. Upsert by unique key `(tenantId, externalSystem, externalCAPAId)`.

## External Data Projection
- Existing Hawkeye `capas` model -> projected to `ExternalCAPA`.
- Existing Hawkeye `audit-requests-master` -> projected to `ExternalAudit`.

## Risk and Questionnaire
- `riskScoringService` computes `CAPARiskIndicator` from internal+external CAPAs.
- `dynamicQuestionnaireEngine` derives focused questionnaire packs from risk/CAPA history.

## Evidence and AI Hook
- `evidenceAggregator` collects and classifies evidence from internal/external CAPA records.
- `indexEvidence()` emits indexable payload for existing RAG ingestion workers.

## Safety
- Additive route namespace: `/api/eqms-intel/*`
- Existing flows untouched.
