# Hawkeye eQMS Intelligence Architecture (Dev)

## 1) Platform Positioning
- Hawkeye is an **audit intelligence overlay**.
- Internal CAPA/deviation/change workflows remain in enterprise eQMS (TrackWise, MasterControl, Veeva, Eurofins).
- Hawkeye ingests internal quality signals and combines them with Hawkeye external audit/CAPA data for risk and audit preparation.

## 2) System Context
```mermaid
flowchart TD
    TW[TrackWise]
    MC[MasterControl]
    VV[Veeva Vault QMS]
    EF[Eurofins]

    TW --> IL[Hawkeye Integration Layer]
    MC --> IL
    VV --> IL
    EF --> IL

    IL --> NR[Normalization Layer]
    NR --> IC[(InternalCAPAReference)]
    NR --> CER[(ComplianceEventCanonical)]

    HC[(Hawkeye External CAPA - capas)]
    HA[(Hawkeye Audits - audit-requests-master)]
    HC --> XP[Projection Layer]
    HA --> XP
    XP --> EC[(ExternalCAPA)]
    XP --> EA[(ExternalAudit)]

    IC --> RS[RiskScoringService]
    EC --> RS
    RS --> RI[(CAPARiskIndicator)]

    RI --> DQ[DynamicQuestionnaireEngine]
    IC --> DQ
    DQ --> AQ[Audit Preparation Recommendations]

    IC --> EAG[EvidenceAggregator]
    EC --> EAG
    EAG --> AI[AI Compliance / RAG pipeline hooks]

    RI --> DB[Unified Dashboard APIs]
    IC --> DB
    EC --> DB
```

## 3) Internal vs External CAPA Separation
```mermaid
flowchart LR
    subgraph Internal[eQMS managed]
      A1[Internal CAPA/Event]
      A2[Status/Closure in eQMS]
    end

    subgraph Hawkeye[Hawkeye managed]
      B1[Supplier Audit Observation]
      B2[External CAPA Workflow]
      B3[Closure Evidence]
    end

    A1 --> C1[InternalCAPAReference source=eQMS]
    B2 --> C2[ExternalCAPA source=Hawkeye]

    C1 --> U[Unified CAPA Dashboard]
    C2 --> U
```

## 4) Additive Implementation Scope
- New models only:
  - `InternalCAPAReference`
  - `ExternalCAPA`
  - `ExternalAudit`
  - `CAPARiskIndicator`
- New connectors only:
  - TrackWise, MasterControl, Veeva, Eurofins under `src/integrations/eqms/*`
- New APIs only:
  - mounted at `/api/eqms-intel/*`

No existing audit/questionnaire/auth/risk endpoints were replaced.
