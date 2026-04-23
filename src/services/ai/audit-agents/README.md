# Audit AI Agents

Domain agents that drive the end-to-end audit lifecycle using the Wave 1-3
AI primitives (LLM gateway · grounded-gen · tool-calling runtime · multi-step
agent · GxP audit trail).

Architecture principle: **every agent is a composition of already-built
primitives + a small amount of domain glue**. No agent introduces a new
runtime concept.

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUDIT AGENTS                             │
├─────────────────────────────────────────────────────────────────┤
│  AuditPrepAgent        — draft questionnaire from history+regs  │
│  AuditAutofillAgent    — OCR + field-match + confidence         │
│  AuditReportAgent      — assemble findings → PDF + ledger hash  │
│  SupplierIntelAgent    — public + tenant supplier dossier       │
├─────────────────────────────────────────────────────────────────┤
│                    SHARED DOMAIN SERVICES                       │
│  EntityResolutionService  — tenant vs public vs unknown         │
│  PublicDataFusionService  — openFDA + other public adapters     │
└─────────────────────────────────────────────────────────────────┘
```

Public-data sources:
- **openFDA** — Drug/Device/Food/Tobacco APIs. Free, official. No auth needed.
  https://open.fda.gov/apis/
- **FDA Warning Letters** — scrapeable with robots.txt respected.
- **FDA Establishment Registration** — public search, fetch adapter.
- **Pharma Compass** — commercial; ToS forbids scraping. Plug-in adapter
  accepts a tenant-supplied API key + calls their official API.
- **EMA EudraGMDP / WHO PQ** — public; adapters pending.

All adapters declare `requiresAuth`, `rateLimitPerMin`, and a canonical
output shape so the FusionService can unify them.

## Provenance tagging

Every data point returned by any adapter carries:
- `source: "openFDA" | "pharmaCompass" | "tenant" | "manual"`
- `fetchedAt: Date`
- `confidence: 0..1` (1 for structured lookups, lower for fuzzy match)
- `url?: string` (for linkable provenance)

The UI shows these tags so users never confuse tenant data with public data.
