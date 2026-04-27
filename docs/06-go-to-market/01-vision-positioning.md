# Hawkeye — Vision & Positioning

> Master positioning brief. Everything else in `06-go-to-market/` reads from this.
> Owner: founder · Last updated: 2026-04-26 · Status: locked

---

## 1. The one-line pitch

> **Hawkeye is the vertical-native workflow OS for regulated industries — packaged per vertical with a marketplace and AI agents, starting with pharma supplier-audit. New verticals ship in weeks, not years.**

Two parts you must always say together:

- **Engine + packs** — one configurable workflow OS, packaged as industry packs (pharma · med-device · ISO 9001 · food safety · automotive). Each pack ships in 8-10 weeks once the runtime is finished.
- **Marketplace + AI** — every pack ships with a buyer/supplier/auditor marketplace and AI agents that pre-fill questionnaires, draft observations, fuse public regulatory data, and assemble reports.

## 2. The market reality (in one paragraph)

The pharma EQMS market is bifurcated into three coherent clusters: **(1) BigPharma enterprise EQMS suites** — MasterControl, Veeva Vault QMS, TrackWise — where Supplier Quality is a sub-module of a $50k-500k+/yr platform sold per-named-user. **(2) Salesforce-native mid-market suites** — Dot Compliance, ComplianceQuest ($30/user/mo+), Qualityze — that bundle supplier modules into per-seat SaaS. **(3) Network/marketplace plays** — Qualifyze (5,000+ shared audit reports, 24k suppliers in directory), Rx-360 consortium ($2.5k-5k per audit-report license), TraceLink (serialization not audits). The bottom-right of the 2x2 (SMB-mid + marketplace-native) has **exactly one direct competitor: Qualifyze**. Indian SMB players (AmpleLogic, Sarjen QEdge, Caliber) compete on price + India cost base but have no marketplace. *(Sources in `docs/01-pitch/` competitive deck.)*

## 3. Where Hawkeye sits — the 2x2 map

```
                    SINGLE-VERTICAL                MULTI-VERTICAL ENGINE
NETWORK /     │  Qualifyze (pharma only,    │  ★ HAWKEYE TARGET
MARKETPLACE   │   no engine, mature data)   │   pharma live · vertical #2 in 8-10wk
              │                              │   No one is here today
INTERNAL      │  AmpleLogic, Sarjen,        │  MasterControl, Veeva, ETQ, ComplianceQuest
TOOL          │  Caliber (pharma-only)      │  (horizontal but heavy, configured per
              │                              │   customer, no marketplace)
```

The upper-right quadrant (multi-vertical engine **plus** marketplace) is empty. That's our position — but we can't claim it credibly until vertical #2 ships.

## 4. The product, packaged

### Three layers, sold as one experience

```
┌──────────────────────────────────────────────────────────────────────┐
│   AI AGENT LAYER                                                     │
│   Pre-fill · Supplier-Intel · Observation Drafter · Report Assembler │
│   CAPA RCA · Brainstormer · ⊕ vertical-specific agents per pack      │
├──────────────────────────────────────────────────────────────────────┤
│   VERTICAL PACKS — ship one per quarter                              │
│   Pharma GMP (live) · Med-Device QMSR (Q4) · ISO 9001 (Q1'27)        │
│   Food Safety · Automotive IATF · Aerospace (roadmap)                │
├──────────────────────────────────────────────────────────────────────┤
│   ENGINE — Workflow OS                                               │
│   WorkflowDefinition · MilestoneInstance · SLA · Module gating       │
│   Vocabulary overrides · Tenant + RBAC + Multi-org marketplace       │
└──────────────────────────────────────────────────────────────────────┘
```

### What each vertical pack contains

Every pack ships with the same 5 things, just specialized:

1. **Standards library** — the regulatory citations the pack speaks (pharma = ICH Q7, 21 CFR 211, EU GMP · med-device = ISO 13485, FDA QMSR · ISO 9001 = ISO 9001:2015 + ISO 19011)
2. **Module template** — which modules are on (e.g., pharma turns on Batch Records + CHAIN_OF_CUSTODY; ISO 9001 leaves them off)
3. **Vocabulary overlay** — `audit → "GMP Audit"` for pharma vs `"Surveillance Audit"` for ISO 9001
4. **AI prompts** — vertical-specific system prompts for each agent
5. **Marketplace seed** — directory of suppliers/auditors known to that vertical

### How modules are bundled (this is your "Supplier Mgmt inside EQMS" answer)

**Supplier Management is NOT a separate product. It is an EQMS module — bundled, not standalone.** Every module pack contains:

| Module group | Modules | Notes |
|---|---|---|
| **Quality core** | Document Control · Change Control · Training · Risk Register · Management Review · Internal Audit | Standard EQMS — table stakes |
| **Event handling** | Deviation · CAPA · Complaint · Audit (supplier-driven) | Where the workflow OS earns its keep |
| **Supplier Management** *(bundled)* | Supplier Pre-Qualification · Audit Request / RFQ · Auditor Network + COI · Monitoring · Requalification scheduler | **Sold as part of EQMS**, not a separate SKU. Marketplace is the multi-tenant version of these. |
| **Operations** | Equipment · Batch Records · Design Control | Vertical-conditional (only for pharma + med-device packs) |
| **Cross-cutting** | Regulatory Intel · AI Assistant · RFQ Procurement | Always on |

This packaging matters because **competitors sell Supplier Quality as an upsell** (MasterControl Supplier Excellence is an add-on to Quality Excellence; ComplianceQuest charges supplier-users at a lower per-seat tier). **Hawkeye includes Supplier Management in the base EQMS pack and monetizes the marketplace separately** (per-shared-audit fees, premium supplier listings, auditor commissions). Cleaner story, fewer pricing conversations.

## 5. Right-to-win — what's defensible

| Moat | What it is | Why competitors can't copy quickly |
|---|---|---|
| **Vertical-pack engine** | One workflow runtime + many vertical packs (vs MasterControl's one product configured per customer, or Qualifyze's one vertical) | Requires ~8-10wk to seed each new vertical — so by the time competitors copy pharma, we have med-device + ISO 9001 shipping |
| **Three-sided marketplace** | Buyer + supplier + auditor in one product (vs MasterControl's buyer-only) | Supply density (suppliers + auditors) takes years to build — Qualifyze's 5-year head start is a 2-year catch-up window |
| **AI-native agents** | Pre-fill / observation drafter / report assembler grounded in a vertical KB — Gemini Flash-Lite cost-base | LLM cost-base advantage (free Gemini tier) erodes as competitors adopt; KB-grounding moat persists |
| **India cost base** | Engineering + audit operations both run from India | Same advantage as Qualityze, Caliber, AmpleLogic. Necessary, not sufficient. |
| **Configurable workflow without rip-and-replace** | Tenant can override vocabulary + module gating + define new workflows via API | MasterControl/Veeva require services engagements to reconfigure; Hawkeye is config-not-code |

**Order of moat strength**: Marketplace > Engine > AI agents > Cost base.

## 6. Three audiences, three pitches

### Buyer (SMB / mid-market pharma + med-device QA)
> *"Stop buying a $200k/yr enterprise EQMS or a $50k/yr supplier-audit add-on. Hawkeye gives you full EQMS including Supplier Management, plus access to a pre-qualified supplier marketplace, for $30-60k/yr — and our AI agents pre-fill the boring 80% of every questionnaire."*

### Investor
> *"The supplier-audit market is bifurcated: enterprise EQMS treats it as an upsell, and Qualifyze owns the marketplace slice. We sit in the unoccupied upper-right of the 2x2: a vertical-native workflow OS where each new vertical ships in weeks (not years), monetized as marketplace transactions on top of recurring SaaS. We have the workflow runtime, the AI agents, the multi-tenant marketplace primitives, and the India cost base."*

### Enterprise EQMS partner (MasterControl, Veeva, TrackWise BD)
> *"You sell the EQMS. We're the supplier-audit network layer your enterprise customers ask for and you don't want to build. Bidirectional connector — we push qualified suppliers and audit reports into your suite, you write back deviations. Your customers stay locked in; you get a marketplace adjacency without R&D."*

## 7. Pricing — high level (full detail in Doc 5)

Two SKU layers, sold together:

| Layer | What it is | Price |
|---|---|---|
| **Engine + AI core** | Workflow runtime · agent runtime · marketplace access · base UI | $10k-25k/yr platform fee |
| **Vertical pack** | Standards library · module template · vocabulary · AI prompts · marketplace seed | $20k-60k/yr per pack |
| **Per-shared-audit** | Marketplace transaction (buyer pulls audit report) | $2k-4k per report (undercut Rx-360 by 20%) |
| **Premium supplier listing** | Verified badge + AI prefill + faster discovery | $1.5k-5k/yr |
| **Auditor marketplace commission** | % of auditor billings booked through Hawkeye | 15-25% |

A pharma-only buyer pays **engine + 1 pack ≈ $30-60k/yr base**. A pharma + med-device buyer pays **engine + 2 packs ≈ $60-100k/yr base**. AI usage is included in the platform fee up to a quota (full metering tier model in Doc 5).

## 8. Deployment — high level (full detail in Doc 3)

Four deployment options. **SaaS is the default; everything else is upsell.**

| Model | When | Who LLM is |
|---|---|---|
| **SaaS (default)** | SMB pharma · greenfield · cost-sensitive | Cloud — Gemini Flash-Lite (free tier) → Claude Sonnet for premium agents |
| **Private Cloud** (single-tenant on AWS/Azure/GCP) | Mid-market with privacy/SOX requirements | Cloud LLM via VPC endpoint |
| **Hybrid** | Customer's data stays in their VPC, Hawkeye agents run in our cloud | Cloud LLM with PII redaction proxy |
| **On-prem** | BigPharma · regulatory-restricted geographies (China, Russia) · CRO with airgapped network | On-prem llama 3.1 / Mixtral / Ollama — vertical-pack-tuned |

The on-prem LLM story is the hardest sell to engineering and the easiest sell to security. We need a credible answer (it's there in Doc 3) — model choice + serving stack + agent feature parity.

## 9. 12-month milestones

| Quarter | Milestone | Why it matters |
|---|---|---|
| **Q2 2026 (now)** | Pharma supplier-audit + AI agents shipping. 5-10 design-partner SMB pharma logos | Land the wedge |
| **Q3 2026** | WorkflowTask runtime complete · Admin panel + AI permissions GA · 10-20 paying SMB logos | Engine becomes real, not aspirational |
| **Q4 2026** | Vertical pack #2 (med-device QMSR) ships · 1 enterprise partner integration (MasterControl OR Veeva) | Two-vertical claim becomes true; partner channel opens |
| **Q1 2027** | Vertical pack #3 (ISO 9001) ships · public marketplace MVP (500+ supplier profiles, 100+ audit reports) | Multi-vertical + marketplace flywheel both live |

## 10. What we are NOT

This is the discipline list. Don't drift here.

- **Not a MasterControl killer.** We never win the $300k/yr enterprise replacement bake-off. We sell *into* their accounts as the supplier-network layer.
- **Not a generic workflow tool** (vs Pega / Camunda / Zapier). We are vertical-native — every workflow is grounded in a regulatory standard.
- **Not a single-vertical product.** Pharma is the lighthouse, not the franchise.
- **Not Salesforce-native.** Free of the per-seat Salesforce platform tax — that's a structural pricing advantage we should not give up.
- **Not free.** No freemium SaaS tier on the buyer side. Free supplier profiles only (supply density is the moat).

## 11. What's next in this pack

- **Doc 2** — Per-vertical pitches (pharma deep, med-device deep, three stubs)
- **Doc 3** — Deployment models brief (the on-prem LLM story is in here)
- **Doc 4** — Admin panel spec (tenant + RBAC + AI permissions matrix)
- **Doc 5** — AI ROI + usage-based pricing calculator
- **Doc 6** — Two-track sales kit (executive vs IT)

Sequence is locked in `_index.md`.
