# EQMS Automation Catalog — applying audit-agent patterns across all modules

The audit-agent stack (`auditPrepAgent`, `auditAutofillAgent`, `auditReportAgent`, `supplierIntelAgent`) demonstrates a pattern that generalises to every EQMS module. Each module gets **one draft agent · one fusion agent · one anchor point** — all built on the same primitives (`llmGateway`, `groundedGenerationService`, `tool-calling runtime`, `publicDataFusionService`, `entityResolutionService`).

This catalog is the ship-order map for extending the pattern across the remaining 14 modules.

## The pattern

```
                         ┌─────────────────────────────┐
                         │  PRIMITIVES  (already built)│
                         │  · grounded-gen runtime     │
                         │  · tool-calling runtime     │
                         │  · public-data fusion       │
                         │  · entity resolution        │
                         │  · AI audit trail           │
                         └─────────────────────────────┘
                                      │
         ┌─────────────┬───────────────┼───────────────┬───────────────┐
         ▼             ▼               ▼               ▼               ▼
    DRAFT AGENT   FUSION AGENT    AUTOFILL AGENT  ANCHOR (SHA-256)  SIGNAL AGENT
  produces a     merges tenant   populates form   integrity hash    detects
  structured     records with    fields from      on each approved  patterns
  artifact       public data     library docs     artifact          across artifacts
  (JSON) with    with explicit   with confidence                    (cross-module)
  citations      provenance      per field
```

Every module slots into this pattern. The only per-module work is: prompt template (one file), retrieval-set builder (fetch relevant tenant + public data), and output schema.

## Module-by-module catalog

| # | Module | DRAFT AGENT | FUSION AGENT | AUTOFILL | ANCHOR |
|---|---|---|---|---|---|
| 1 | **Audit Mgmt** | `auditPrepAgent` ✅ questionnaire | `supplierIntelAgent` ✅ tenant+public | `auditAutofillAgent` ✅ form-from-docs | `auditReportAgent` ✅ SHA-256 hash |
| 2 | **Document Control** | `sopAuthorAgent` — drafts SOP rev from reg source diff | `regFrameworkMapperAgent` — tags doc across 21 CFR + ISO 13485 + ISO 9001 + IATF | reuse autofill for doc metadata | `docReleaseAnchor` — hash on publish |
| 3 | **CAPA** | `capaRcaDrafter` ✅ (Wave 1) | `capaPatternAgent` — mines similar CAPAs across tenant | `capaAutofillAgent` — from linked deviation | `capaClosureAnchor` — hash on effectiveness verified |
| 4 | **Change Control** | `changeImpactClassifier` — notifiable / CBE-30 / PAS | `regChangeDetectorAgent` — watches FDA/EMA for affected regs | autofill from linked product/site | `changeApprovalAnchor` — hash on approved |
| 5 | **Deviation / Event Mgmt** | `deviationFiveWhyScaffolder` ✅ (Wave 1) | `deviationSignalDetector` ✅ (Wave 3) clustering | autofill from batch record | `deviationCloseAnchor` — hash on closure |
| 6 | **Complaint Mgmt** | `complaintTriageAgent` — severity + linked CAPA suggestion | `complaintTrendAgent` — cross-complaint clustering | autofill from product master | `complaintCloseAnchor` |
| 7 | **Training Mgmt** | `trainingAutoAssignAgent` — on SOP rev, auto-assign read-and-understood | `competencyGapAgent` — cross-role gap analysis | autofill curriculum from role | `trainingRecordAnchor` — per attestation |
| 8 | **Risk Mgmt** | `riskScenarioBrainstormer` — from SOP, generate failure modes | `ichQ9CrossRefAgent` — link to regulatory risk guidance | autofill from linked process | `riskApprovalAnchor` |
| 9 | **Supplier Quality** | `supplierRiskDossier` ✅ (Wave 2 — upgrade to new fusion service) | ✅ uses `supplierIntelAgent` | autofill supplier profile fields | `qualifiedSupplierListAnchor` — hash on each qualification |
| 10 | **Management Review** | `mrmInputPopulator` — auto-populate quarterly inputs from cross-modules | N/A | autofill from last quarter | `mrmMinutesAnchor` — hash on MRM close |
| 11 | **Asset / Equipment** | `equipmentQualAgent` — draft IQ/OQ/PQ from spec | `manufacturerRecallFusion` — fuse equipment-model recalls (FDA) | autofill from calibration cert OCR | `calCertAnchor` — per calibration |
| 12 | **Chain of Custody** | `cocBreakDrafter` — narrative when break detected | `cocTransferAgent` — barcode/RFID ingest | — | `cocRecordAnchor` |
| 13 | **Transaction Review** | `amlDueDiligenceDrafter` — memo from transaction | `sanctionsPepAgent` — OFAC + PEP screen fusion | — | `transactionApprovalAnchor` |
| 14 | **Regulatory Intel** | `regSummariser` — daily multi-agency summary | ✅ uses `publicDataFusionService` | — | — (feeds other modules) |
| 15 | **AI Assistant** | AskHawk ✅ | active-learning loop ✅ (Wave 2) | — | ✅ AuditTrail already captures every AI decision |
| 16 | **RFQ / Procurement** | `rfqDrafter` ✅ (Wave 2 partial — extend) | `auditorFitScore` ✅ (ccaa-4) | autofill RFQ from audit context | `rfqAwardAnchor` |

Legend:
- ✅ built — code exists
- (plain) — not yet built, scaffolded by this pattern in ~1-2 weeks each

## Implementation velocity

Each new agent follows the same 6-file template (observed from the audit-agents build):

```
src/services/ai/{module}-agents/
  _shared.js                       — (reuse audit-agents/_shared.js where possible)
  {agentName}.js                   — ~100 LOC prompt + schema + call to groundedGenerate
  ...additional agent files         — ~100 LOC each
src/controllers/{module}AgentsController.js    — thin pass-through
src/routes/{module}AgentsRoutes.js              — 1-line per endpoint
frontend/components/ai/{module}-agents/
  {ComponentName}.tsx              — ~150 LOC MUI runner
frontend/lib/{module}AgentsApi.ts  — typed client
```

Expected build time per module: **3-5 days for agents + UI + smoke tests**, assuming the underlying tenant models already exist. The template + guidance in this catalog + the audit-agents build above lets any mid-level engineer replicate it.

## Shared services that scale across modules

- `publicDataFusionService` — extend with more adapters (EMA EudraGMDP, WHO PQ, ICH portals) — 1 week each. Every module benefits.
- `entityResolutionService` — already powers supplier dedupe; extend to products (ATC/CAS), sites (FEI), materials. 2 weeks.
- `aiAuditTrail` — already captures every AI decision. No per-module work.
- `llmGateway` — pluggable provider. No per-module work.
