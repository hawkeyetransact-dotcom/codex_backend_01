# HawkEye Platform — Master Architecture Plan
**Author perspective:** Senior Product Architect
**Date:** 2026-03-26
**Scope:** Phase 0 → Phase 4 evolution — Audit-Only → EQMS → Universal Workflow OS → Trust Marketplace

---

## 1. North Star Vision

> **HawkEye becomes the trust infrastructure layer for global B2B commerce** —
> not an intermediary, but the protocol that makes intermediaries unnecessary.

Any party (manufacturer, lab, auditor, logistics provider, regulator, buyer, farmer, supplier) can join the HawkEye network, define what "verified" means in their domain, run workflows that generate immutable evidence, and expose their trust score to the market. Buyers discover, evaluate, transact with, and monitor suppliers without needing a bank of relationship managers or manual due diligence processes. The platform's AI removes friction; the immutable ledger removes doubt; the marketplace removes geography.

Analogues to learn from:
- **What Stripe did for payments** — removed the bank relationship, became the trust protocol
- **What SAP Core + BTP did for enterprise** — stable core, unlimited extensibility
- **What AWS did for infrastructure** — pay-as-you-grow, modular, composable
- **What GitHub did for code** — made work visible, auditable, collaborative, networked

---

## 2. Architecture Principles

| # | Principle | Meaning |
|---|-----------|---------|
| **P1** | Core Stays Clean | The certified core modules (Audit, EQMS) are never modified for customer customization. Extensions live in a separate runtime layer |
| **P2** | Everything Is an Event | All state changes are immutable events. The current state is a projection of the event log, not the source of truth |
| **P3** | Trust Is Computed, Not Asserted | Trust scores emerge from verified evidence in the graph — no one self-declares compliance |
| **P4** | Vocabulary Is Configurable, Logic Is Not | Tenants can rename "supplier" to "farm" and "audit" to "inspection" — but the underlying workflow logic is the same certified engine |
| **P5** | AI Is Infrastructure | AI is not a feature bolted on — it is embedded at every layer: ingestion, processing, decision support, report generation, risk scoring |
| **P6** | Deploy What You Need | A pharma auditor activates Audit + Pharma Pack. A food company activates Audit + EQMS + Food Safety Pack. A real estate firm activates CoC Tracker + Transaction Review. Same codebase, different surface |

---

## 3. The Layered Architecture ("The Stack")

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — TRUST MARKETPLACE                                            │
│  Supplier discovery · Verified listings · Procurement workflows         │
│  Chain of custody · Ownership records · Peer-to-peer transactions       │
│  Escrow · Rating · Reputation graph                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 4 — EXTENSION RUNTIME  (HawkEye Studio / BTP equivalent)        │
│  Low-code workflow builder · Custom forms · Industry pack overlays      │
│  Third-party integrations · Custom AI agents · Webhook registry         │
│  Vocabulary overrides · Custom dashboards · White-label portal          │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 3 — AI & AUTOMATION RUNTIME  (HawkEye Intelligence)             │
│  AskHawk Copilot · Auto-fill engine · RAG pipeline                      │
│  Risk prediction · Anomaly detection · RPA connectors                   │
│  AR/VR inspection overlays · IoT/Robotics ingestion adapters            │
│  Computer vision (defect detection, document verification)              │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — CORE QMS MODULES  (HawkEye EQMS — SAP Core equivalent)     │
│  Audit · CAPA V2 · Document Control · Nonconformance                   │
│  Change Control · Risk Register · Training · Complaints                 │
│  Management Review · Equipment/Calibration · Supplier Quality           │
│  [ All modules certified against ISO 9001 / ICH Q7 / ISO 13485 ]       │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 1 — PLATFORM CORE  (HawkEye Core — always on)                  │
│  Party Model · Workflow Engine · Subject Model · Event Ledger           │
│  Module Registry · Vocabulary Service · Tenant Config                  │
│  Identity & Auth · Permissions · Audit Trail · Notifications            │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 0 — TRUST INFRASTRUCTURE  (Immutable foundation)                │
│  Append-only event store · Cryptographic signing                        │
│  Chain of custody primitives · Digital credentials/certificates         │
│  Data ingestion fabric (ERP, IoT, manual, file, API, sensor, AR/VR)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Platform Core — The Five Primitives

Everything in HawkEye is built from five universal primitives. These never change — only their configurations do.

### 4.1 Party
> Any entity that participates in a workflow

- Current: Supplier, Buyer, Auditor, Admin
- Universal: Manufacturer, Lab, Farm, Logistics, Regulator, Inspector, Broker, Insurer, Financial Institution
- Key fields: type, certifications, risk score, trust score, verification status
- Already built in `workflow_os` branch as `PartyModel`

### 4.2 Subject
> Any entity that workflows are performed *on*

- Current: Audit request (the subject is an implicit supplier facility)
- Universal: Product, Batch, Lot, Facility, Equipment, Document, Property, Asset, Container, Shipment
- Key fields: type, identifiers (batch number, serial, GTIN), custody chain, quality history
- Already built in `workflow_os` branch as `WorkflowSubjectModel`

### 4.3 Workflow
> A sequence of phases, tasks, artifacts, and decisions applied to a Subject by Parties

- Current: 8-phase audit workflow (hardcoded)
- Universal: Any domain workflow defined by a `WorkflowDefinition` — audit, inspection, certification, onboarding, change control, transaction review
- Built-in definitions are read-only. Tenants can create custom definitions via Studio
- Already built in `workflow_os` branch as `WorkflowDefinitionModel`

### 4.4 Event
> An immutable record of something that happened in the system

- Current: Audit trail (mutable MongoDB documents, not true event log)
- Universal: Every state change, decision, upload, signature, escalation is an Event. Events are append-only and cryptographically signed
- Already built as `WorkflowEventModel` — but needs immutability upgrade (see Phase 2)

### 4.5 Trust Score
> A computed confidence metric for a Party or Subject, derived from verified events

- Current: Supplier risk metrics (point-in-time, manually computed)
- Universal: Continuously updated score computed from audit outcomes, CAPA closure rates, certification age, inspection frequency, NC history, market signals
- Not yet built — Phase 3 deliverable

---

## 5. Module Registry — On-Demand Activation

### 5.1 Module Taxonomy

```
MODULE REGISTRY
│
├── ALWAYS_ON (Core — included in every plan)
│   ├── AUDIT_MANAGEMENT          → 8-phase GxP audit lifecycle
│   ├── CAPA_MANAGEMENT           → V2 with candidates, triage, RCA, effectiveness
│   ├── DOCUMENT_CONTROL          → DCM with approval workflow, versioning
│   ├── SUPPLIER_QUALITY          → Qualification, risk, monitoring
│   ├── AI_ASSISTANT              → AskHawk copilot + auto-fill
│   └── RFQ_PROCUREMENT           → RFQ, quotation, auditor marketplace
│
├── EQMS_TIER (Standard/Premium plans)
│   ├── NONCONFORMANCE_MANAGER    → NC/Deviation creation to closure
│   ├── CHANGE_CONTROL            → ECO/change request workflow
│   ├── RISK_REGISTER             → Product/process FMEA + risk matrix
│   ├── TRAINING_MANAGEMENT       → Assignments, completion, qualification
│   ├── COMPLAINT_MANAGEMENT      → Customer complaint to closure
│   ├── MANAGEMENT_REVIEW         → Periodic review with KPI inputs
│   └── ASSET_CALIBRATION         → Equipment master, calibration schedule
│
├── WORKFLOW_OS_TIER (Enterprise plan)
│   ├── CHAIN_OF_CUSTODY          → End-to-end traceability across supply chain
│   ├── TRANSACTION_REVIEW        → P2P transaction due diligence
│   ├── WORKFLOW_STUDIO           → Low-code custom workflow builder
│   ├── DATA_FABRIC               → Universal data connector hub
│   └── REGULATORY_INTEL          → FDA 483, WHO alerts, public inspection data
│
└── AI_ADVANCED_TIER (Add-on)
    ├── COMPUTER_VISION           → Visual defect detection, doc verification
    ├── AR_VR_INSPECTION          → Remote co-present audit, AR checklist overlay
    ├── IOT_INGESTION             → Real-time sensor data → quality events
    ├── RPA_CONNECTORS            → ERP/LIMS/LES data sync (SAP, Oracle, etc.)
    └── PREDICTIVE_RISK           → ML-based risk prediction, anomaly detection
```

### 5.2 Activation Mechanism

```
Tenant Configuration Flow:
  subscriptionPlan   → determines available module pool
  tenantModuleConfig → admin toggles modules within allowed pool
  vocabularyConfig   → admin renames domain terms per industry
  industryProfile    → pre-selects module set + vocab preset

Runtime:
  UniversalPlatformContext → fetches active modules from /api/universal/module-config/active
  Navigation             → megaMenuConfig built dynamically from active modules
  Page access            → route-level module guard (existing pattern extended)
  Feature flags          → FF_ flags for UI behavior; module flags for business logic
```

### 5.3 Industry Profile Presets (Out of the Box)

| Profile | Pre-activated Modules | Vocabulary Overrides |
|---------|----------------------|---------------------|
| **Pharma GMP** | Audit, CAPA, DCM, NC, Change Control, Supplier Quality | audit, supplier, batch, site, deficiency |
| **Medical Device** | + Risk Register, Complaint Management, Design Control | nonconformance, device, complaint, corrective action |
| **ISO 9001** | Audit, CAPA, DCM, NC, Change Control, Risk, Training, Mgmt Review | audit, nonconformance, interested party |
| **Food Safety** | Audit, CAPA, NC, HACCP Risk Register, Complaint, CoC | inspection, establishment, hazard, critical control point |
| **Organic Farming** | Audit, CoC, Supplier Quality, AI Assistant | inspection, farm, lot, certificate of origin |
| **Forest CoC** | CoC Tracker, Transaction Review, Supplier Quality | chain of custody, forest unit, certificate, claim |
| **Automotive** | Audit, CAPA, NC, Change Control, Risk (FMEA), Training | PPAP, control plan, PFMEA, concession |
| **General Manufacturing** | Audit, CAPA, DCM, NC, Risk, Training, Mgmt Review | standard ISO 9001 vocabulary |

---

## 6. Phase Roadmap

### PHASE 0 — GxP Audit Suite (Current Dev Branch) — Q2 2026

**Goal:** Make the audit module production-ready for regulated pharma/life sciences use.
**Repo:** `dev` branch of `codex_frontend_01` + `codex_backend_01`

**Deliverables:**
- [ ] 3-tier facility outcome (Approved / Conditionally Approved / Rejected + Reaudit)
- [ ] Formal COI declaration per auditor per engagement
- [ ] Preliminary Deficiency Report artifact (separate from 30-day Final Report)
- [ ] Supplier pre-qualification stage (#001–#004 upstream of audit)
- [ ] Opening meeting + Closing meeting formal records with sign-in
- [ ] Auditor competency tagging + audit type validation
- [ ] Monthly supplier scorecard automation
- [ ] Requalification auto-trigger from risk score + closure date
- [ ] Module-driven navigation (dynamic from `tenantModuleConfig`)

**Business outcome:** Billable to pharma companies doing GxP supplier audits. Competes with paper-based + Excel-based workflows. Deploy as "Audit Only" product.

---

### PHASE 1 — EQMS (ISO 9001 Ready) — Q3–Q4 2026

**Goal:** Full ISO 9001:2015 compliance coverage. All 10 clauses software-supported.
**Repo:** Merge `workflow_os` module infrastructure into `dev`. Build EQMS modules on top.

**Deliverables:**
- [ ] **Document Control Module** — Upgrade DigiLocker to full DCM with approval chains, effective dating, superseding, periodic review, SOP number registry
- [ ] **Nonconformance Manager** — NC creation, containment, disposition, root cause → CAPA V2 link
- [ ] **Change Control Module** — ECO lifecycle (already modeled in `workflow_os`, needs UI)
- [ ] **Risk Register** — FMEA-style risk matrix, risk treatment plans, link to audit findings
- [ ] **Training & Competency** — Assignments, completion records, qualification matrix
- [ ] **Complaint Management** — Complaint intake, severity classification, investigation → CAPA link
- [ ] **Management Review** — Scheduled reviews, KPI inputs (audit results, CAPA status, NC trends), action output
- [ ] **Equipment & Calibration** — Instrument master, calibration schedules, out-of-tolerance NC
- [ ] **ISO 9001 Compliance Pack** — Clause-to-feature mapping, built-in ISO 9001 audit templates

**Technical work:**
- Merge `PartyModel`, `ModuleConfigModel`, `vocabularyService`, `UniversalPlatformContext` from `workflow_os` → `dev`
- Build Studio stub (workflow template viewer — read-only, edit in Phase 2)
- Enable `EQMS_TIER` modules in subscription model

**Business outcome:** Competes directly with Qualio, MasterControl SMB tier, ETQ. Sells as "Audit + EQMS" bundle. ISO 9001 certification body endorsement possible.

---

### PHASE 2 — Universal Workflow OS — Q1–Q2 2027

**Goal:** Any domain, any workflow. The platform becomes the horizontal infrastructure layer.
**Repo:** `workflow_os` branch features graduate to main, `dev` absorbs all.

**Deliverables:**

**Workflow Studio (Low-code builder):**
- Drag-and-drop phase/task designer
- Form builder for custom questionnaires
- Condition-based routing and branching
- Approval chain designer
- SLA and escalation rule configuration
- Webhook and integration triggers
- Template export/import
- Version-controlled workflow definitions

**Immutable Event Ledger:**
- Upgrade current MongoDB audit trail → append-only event store (Event Sourcing pattern)
- Every state change written as signed, timestamped, immutable event
- Current state computed as projection (CQRS pattern)
- Foundation for chain of custody and regulatory audit trails that cannot be tampered

**Data Fabric (Universal Ingestion):**
- File connectors: CSV, Excel, JSON, XML, PDF parsing
- API connectors: REST, SOAP, GraphQL polling
- ERP/LIMS connectors: SAP (IDocs/BAPI), Oracle, Salesforce, Veeva
- IoT adapters: MQTT broker, OPC-UA (factory floor sensors)
- Email parser: extract structured data from email chains (for legacy workflows)
- Manual intake forms: configurable intake forms per workflow type
- All ingested data normalized to `WorkflowEvent` or `WorkflowSubject` records

**Chain of Custody (CoC) Module:**
- Subject (product, batch, asset) custody transfer protocol
- Custodian hand-off with digital signature
- QR/RFID scan integration for physical asset tracking
- Certificate of origin, bill of lading, COA digital attachments
- Custody chain visualization (timeline + map)

**Transaction Review Module:**
- P2P transaction due diligence workflow
- Pre-transaction verification checklist
- Multi-party approval with digital signatures
- Transaction record with immutable evidence package

**AI/Automation Runtime expansion:**
- Multi-agent AI for complex workflows (inspection agent, report agent, risk agent)
- RPA connectors for ERP sync (SAP BAPI calls, Oracle API)
- Document intelligence: extract structured data from any uploaded document type

**Business outcome:** Opens HawkEye to non-pharma verticals — food safety, organic certification, forest chain of custody, real estate title verification, high-ticket goods (art, luxury, heavy machinery). Platform fee model emerges.

---

### PHASE 3 — Trust Network & Marketplace — Q3–Q4 2027

**Goal:** Network effects. Every verified party and subject makes the whole network more valuable.

**Deliverables:**

**Trust Score Engine:**
- Continuously computed trust score per Party (supplier, facility, product)
- Inputs: audit frequency/outcomes, CAPA closure rate, NC history, certification currency, market signals, regulatory alerts
- Scoring model: weighted graph traversal across verified events
- Public trust badges: display on marketplace listings
- Score decay: stale certifications automatically reduce score until renewed

**HawkEye Marketplace:**
- Supplier/product discovery with trust score filter
- Verified supplier directory (only parties with active trust score listed)
- Buyer request board: "Looking for GMP-certified API manufacturer, ICH Q7 verified, max risk score 30"
- Supplier response with credential package
- Shortlist → RFQ → Quote → Award workflow (extends existing RFQ module)
- Marketplace transaction fee model

**Verified Credential System:**
- Digital certificates issued by HawkEye after successful audit/inspection
- QR-scannable, cryptographically signed, expiry-aware
- Verifiable by any counterparty without revealing underlying documents
- Integrates with global certificate registries (ISO 17021 bodies, FDA supplier lists)

**P2P Procurement:**
- Buyer discovers → verifies trust score → initiates procurement workflow
- Milestone-based payment triggers (optional payment integration: Stripe, wire)
- Digital PO with smart conditions (release payment on certificate of compliance)
- Dispute resolution workflow

**Network effects:**
- More verifications → better trust scores
- Better trust scores → more buyers discover suppliers
- More transactions → more verification data
- Network moat builds over time

---

### PHASE 4 — Autonomous Operations — 2028+

**Goal:** AI, robotics, AR/VR reduce human effort in audits from weeks to hours.

**Deliverables:**

**AR/VR Remote Audit Platform:**
- Auditor wears AR glasses (HoloLens, Apple Vision Pro, Meta Quest) at their desk
- Inspector at facility streams live video with AR annotations
- Audit checklist overlaid on physical environment (checklist item highlights relevant equipment)
- AI co-pilot reads GMP deficiencies from live video, pre-fills checklist in real time
- Digital twin overlay: compare actual equipment placement vs. approved floor plan
- Session recording as legally valid audit evidence

**IoT Continuous Monitoring:**
- Factory sensors (temperature, humidity, pressure, particle count) stream to HawkEye
- Deviations automatically trigger `WorkflowEvent` with severity classification
- Out-of-tolerance events auto-create NC records with sensor data as evidence
- Predictive models flag equipment likely to fail calibration before it happens
- GMP audit becomes continuous validation, not periodic snapshot

**Robotics Integration:**
- Autonomous inspection robots (Boston Dynamics Spot, custom AMRs) patrol facility
- Robot streams sensor data + visual feed to HawkEye
- Computer vision model identifies physical GMP deficiencies (cracks in walls, missing labels, improper storage)
- Findings automatically populate audit checklist with photo evidence
- Human auditor reviews AI-flagged items only — focus shifts to judgment, not observation

**Predictive Risk Intelligence:**
- ML model trained on historical audit outcomes, CAPA history, market signals
- Predicts probability of audit failure 90 days out
- Recommends proactive interventions
- Regulatory alert correlation: if FDA issues warning letter to a similar facility, flag all suppliers with similar profile

**Digital Twin + Simulation:**
- Virtual facility model built from floor plans + equipment registry
- Run "what-if" simulations: what is our compliance risk if we add this new production line?
- Virtual audit walkthrough before on-site audit

---

## 7. Repo Strategy

### Current State
- `dev` branch (`codex_frontend_01` / `codex_backend_01`) = Phase 0 production codebase
- `feature/universal-workflow-platform` branch = Phase 2 experimental work (`_wt_*` worktrees)

### Target State

```
main ────────────────────────────────────────────────────── production
  │
dev ─────────────────────────────────────────────────────── staging (current Phase 0)
  │
  ├── feature/phase1-eqms ─────────────────────────────── Phase 1 work
  │   (merge workflow_os module infrastructure first)
  │
  └── feature/universal-workflow-platform ────────────── Phase 2 research (existing)
      (graduate features to phase1-eqms as they stabilize)
```

### Merge Strategy: workflow_os → dev

**Safe to merge now** (foundational, no breaking changes):
1. `PartyModel.js` — additive new model
2. `ModuleConfigModel.js` — additive new model
3. `vocabularyService.js` — additive service
4. `UniversalPlatformContext.tsx` — additive context
5. `WorkflowDefinitionModel.js` — additive model
6. `WorkflowSubjectModel.js` — additive model
7. `/api/universal/*` routes — additive, new URL namespace
8. `useVocabulary()` hook — additive
9. `admin/module-config` page — additive

**Merge in Phase 1** (requires EQMS modules to be built alongside):
- `ChangeControlModel.js` + routes + pages (once Change Control UI built)
- `WorkflowEventModel.js` as NC module foundation (once NC Manager built)
- Dynamic navigation generation from module config (replaces static megaMenuConfig)

**Merge in Phase 2** (requires immutability upgrade):
- Event Sourcing layer (replaces mutable audit trail)
- Workflow Studio builder
- Data Fabric connectors

### Core Cleanliness Rule (SAP Principle)
- Core modules (`/api/audits/*`, `/api/capa/*`, `/api/evidence/*`) are **never modified** for customer requests
- Customization points are explicit extension hooks: vocabulary, module config, workflow definitions, Studio templates
- Customer-specific logic lives in their tenant's custom workflow definitions — not in core routes

---

## 8. AI/Robotics/VR/AR Integration Blueprint

### 8.1 AI — Already Embedded, Needs Deepening

| AI Capability | Current State | Target |
|--------------|--------------|--------|
| Auto-fill questionnaire | Built — confidence scoring, RAG | Expand to all module forms |
| AskHawk copilot | Built — RAG over audit docs | Multi-agent: audit agent, CAPA agent, risk agent |
| Report generation | Built — template + AI draft | Full AI-drafted report with human review |
| Risk scoring | Manual computation | ML model trained on outcome history |
| Anomaly detection | Not built | Detect unusual patterns in answers, timing, evidence |
| Document intelligence | Basic extraction | Full layout analysis (tables, figures, signatures) |

### 8.2 Robotics — Phase 4 Integration Points

```
Factory Robot → MQTT/ROS bridge → HawkEye IoT Adapter
                                         │
                                   WorkflowEvent (type: OBSERVATION)
                                         │
                         Auto-populate audit checklist item
                                         │
                              Human auditor reviews flagged item
```

Integration protocol: MQTT for real-time telemetry, REST webhook for discrete events, OPC-UA for industrial PLC data.

### 8.3 AR/VR — Phase 4 Remote Audit Architecture

```
On-site Inspector (AR glasses)          Remote Auditor (desktop or VR)
        │                                           │
   Live video stream ──────────────────────────────►│
   AR overlay receives ◄────────────────────────────│
        │                                           │
        └──── Both connected to HawkEye Session ────┘
                           │
                    Session = WorkflowInstance
                    Checklist items surfaced as AR annotations
                    Evidence captured as video clips per checklist item
                    AI co-pilot runs in parallel, pre-fills answers
```

Technology: WebRTC for video, WebXR for AR/VR overlay, HawkEye session service for state synchronization.

### 8.4 IoT — Continuous Compliance Architecture

```
Sensors → MQTT Broker → HawkEye IoT Adapter → WorkflowEvent stream
                                                         │
                              ┌──────────────────────────┤
                              │                          │
                         In-tolerance             Out-of-tolerance
                              │                          │
                    Logged silently            NC record auto-created
                                               CAPA candidate raised
                                               Responsible party notified
```

---

## 9. Trust Infrastructure Design

### 9.1 Immutable Event Ledger (Phase 2)

Current MongoDB documents are mutable — a critical weakness for regulatory use.

**Target pattern: Event Sourcing + CQRS**

```
Write Path:
  Action (sign document, close CAPA, transfer custody)
    → Command validated
    → Event created (immutable, cryptographically signed with server key + actor key)
    → Event appended to event store (append-only collection, no updates/deletes)
    → Projection updated (read model, mutable — can be rebuilt from events)

Read Path:
  Query hits Projection (fast, denormalized read model)
  Audit trail query hits Event Store directly (authoritative, immutable)
```

**Why this matters:**
- Regulatory agencies (FDA, EMA) require tamper-evident records
- Chain of custody is legally invalid if records can be altered
- Dispute resolution: anyone can re-derive the state from the event log

**Implementation:**
- MongoDB append-only collection with document-level write protection
- Each event: `{id, timestamp, actorId, actorSignature, eventType, payload, previousEventHash}` — forms a hash chain
- Full blockchain not needed at Phase 2 — hash chain + server-side signing is sufficient for regulatory purposes
- True distributed ledger (Hyperledger Fabric or similar) is Phase 3/4 option for multi-party scenarios

### 9.2 Digital Credentials (Phase 3)

Post-successful audit, HawkEye issues a **Verifiable Credential** to the supplier:

```json
{
  "type": "GxPAuditCertificate",
  "holder": { "partyId": "...", "name": "Acme Pharma Ltd" },
  "issuedBy": "HawkEye Trust Network",
  "auditId": "...",
  "standard": "ICH Q7",
  "outcome": "APPROVED",
  "validFrom": "2026-03-26",
  "validUntil": "2027-03-26",
  "signature": "...",
  "verificationUrl": "https://verify.hawkeyesmart.com/cert/..."
}
```

- QR scannable, cryptographically verifiable
- Buyer can verify without accessing the underlying audit documents
- Automatically expires and triggers requalification workflow
- Public registry: buyers search `verify.hawkeyesmart.com` for any supplier certificate

---

## 10. Key Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Event store | MongoDB append-only collection (Phase 2), evaluate Kafka/EventStore for Phase 3 | No new infra needed for Phase 2; Kafka adds real-time streaming for Phase 3 IoT |
| Workflow definition format | JSON schema in MongoDB (existing `WorkflowDefinitionModel`) | Flexible, tenant-editable, no separate workflow engine infra needed at Phase 1-2 |
| AR/VR | WebXR API + WebRTC (browser-first) | No native app required, runs on any AR glasses with WebXR support; native later |
| IoT ingestion | MQTT adapter service (Phase 4) | Industry standard for industrial IoT |
| AI models | Anthropic Claude (existing) + specialized fine-tuned models for GMP domain | Claude for reasoning; fine-tuned for domain-specific entity extraction and risk classification |
| Trust credentials | Hash-chain signed records (Phase 2), W3C Verifiable Credentials standard (Phase 3) | W3C VC standard ensures interoperability with external verifiers |
| Marketplace payments | Stripe (Phase 3) | Modern API, handles B2B invoicing, international |
| Search/discovery | Elasticsearch or MongoDB Atlas Search | Supplier/product discovery needs full-text + filter + geo search |
| Mobile | Progressive Web App first (existing Next.js), then React Native (Phase 3) | PWA covers 90% of use cases; native needed for AR glasses and IoT control panels |

---

## 11. Competitive Positioning by Phase

| Phase | HawkEye vs. | HawkEye advantage |
|-------|------------|------------------|
| 0 (Audit Only) | Paper/Excel + Audit firms | Structured, AI-assisted, mobile, evidence vault, collaborative |
| 1 (EQMS) | Qualio, MasterControl SMB, ETQ | AI-native from day one; no incumbent has real AI auto-fill |
| 2 (Workflow OS) | Salesforce Flow, Monday.com, Zapier | Domain expertise (GxP, ISO) baked in; immutable record foundation |
| 3 (Marketplace) | Thomasnet, Alibaba Verified, Avetta | Trust score from real audit data — not self-declared; procurement integrated |
| 4 (Autonomous) | No direct competitor exists | First mover: AI + AR + IoT continuous compliance |

---

## 12. What to Build Next (Immediate Priority Sequence)

```
NOW (Phase 0 completion):
  1. Dynamic navigation from module config          2 weeks
  2. 3-tier facility outcome model                  1 week
  3. COI declaration workflow                       1 week
  4. Preliminary deficiency report artifact         1 week
  5. Supplier pre-qualification stage               3 weeks

NEXT (Phase 1 start — merge workflow_os foundations):
  6. Merge PartyModel + ModuleConfigModel + vocabularyService → dev   1 week
  7. Document Control Module (DigiLocker upgrade)                     5 weeks
  8. Nonconformance Manager                                           4 weeks
  9. Change Control UI (model already exists in workflow_os)          3 weeks
  10. Risk Register + FMEA                                            4 weeks

THEN (Phase 1 completion):
  11. Training Management                           5 weeks
  12. Management Review                             3 weeks
  13. Complaint Manager                             3 weeks
  14. ISO 9001 compliance pack (clause mapping)     3 weeks
  15. Industry profile presets (Pharma, ISO 9001)   2 weeks

PLATFORM (Phase 2 prerequisites, start in parallel):
  16. Immutable event ledger (Event Sourcing)       6 weeks
  17. Workflow Studio v1 (template viewer + editor) 8 weeks
  18. Data Fabric v1 (file + REST connectors)       6 weeks
```

---

*This document is the authoritative architectural reference for HawkEye platform evolution.*
*Review and update at the start of each phase.*
