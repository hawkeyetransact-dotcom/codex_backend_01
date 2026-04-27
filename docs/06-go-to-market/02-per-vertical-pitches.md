# Per-Vertical Pitches

> Five verticals: pharma + medical device shipped at depth; ISO 9001, food safety, automotive shipped as stubs.
> Owner: founder · Last updated: 2026-04-26 · Status: draft

Each pitch follows the same 8-section template:

1. **Headline** — one sentence positioning for the vertical
2. **Market** — sizing band, regulatory drivers, growth signal
3. **Standards in scope** — what the pack speaks
4. **ICP** — who the buyer is, where they are
5. **Top pain points** — 3, in customer language
6. **Top competitors** — who they buy today
7. **Hawkeye pack — what's in it** — modules + AI agents specialized for the vertical
8. **The one differentiator** — the line that wins this vertical

Where market figures are not freshly cited, they are tagged `[directional]` — replace with up-to-date analyst data before customer-facing use.

---

## A. Pharma — *the lighthouse vertical, shipping today*

### Headline
> *"AI-native supplier qualification + audit + CAPA for pharma — full EQMS plus a marketplace of pre-qualified suppliers. $30-60k/yr instead of $300k."*

### Market
- Pharma EQMS sub-segment **~$1.6-1.9B in 2025, growing at ~13% CAGR through 2030** [directional — update with live analyst report].
- Drivers: 21 CFR Part 11 modernization, FDA QMSR effective Feb 2026 (med-device parallel), EMA Annex 1, supplier-base globalization, FDA warning-letter velocity.
- Shared-audit market (Qualifyze + Rx-360 model) growing far faster than legacy EQMS — **proxy for the marketplace thesis.**

### Standards in scope
ICH Q7 §17 · ICH Q9 (QRM) · ICH Q10 §2.7 · 21 CFR 211.84 · 21 CFR Part 11 · 21 CFR 314.81 (FAR) · 21 CFR 803 (MDR) · EU GMP Part II · EU GMP Annex 1 · WHO TRS 957 · WHO PQ.

### ICP
- **Primary**: SMB-mid pharma manufacturers + CMOs/CDMOs (50-1,500 employees), QA team of 5-30, mostly India / EU / Israel / mid-tier US.
- **Secondary**: BigPharma supplier-quality teams (10-50 buyers) buying Hawkeye as a *complement* to MasterControl/Veeva for the supplier-network slice.
- **Buyer**: Audit Program Manager / VP Quality / Head of Supplier Quality.

### Top pain points
1. **Audits don't scale.** A buyer covers 200-1,200 suppliers but can audit 30-60/yr in person. Most are paper-screened only.
2. **Questionnaire fatigue.** Suppliers fill the same 200-question pre-audit questionnaire 40 times a year for different buyers — bad data, late, error-prone.
3. **Findings → CAPA → closure** loop runs in email + Excel. No source-of-truth, no SLA, no trend.

### Top competitors
- **MasterControl** (US, $25k-500k+/yr) — Supplier Excellence as add-on, no marketplace.
- **Veeva Vault QMS** ($600-2,400/user/yr) — supplier portal, no marketplace.
- **TrackWise Digital** ($100k+/yr enterprise) — same internal-tool DNA.
- **Qualifyze** (Germany) — **the marketplace head-to-head**; 5,000+ shared audit reports, pricing per-report.
- **AmpleLogic / Sarjen QEdge / Caliber** (India) — pharma-specific EQMS, no marketplace, India cost base.

### Hawkeye pack — what's in it
- **EQMS core**: Document Control · Change Control · Training · Risk · Management Review · Internal Audit · Deviation · CAPA · Complaint · Equipment · Batch Records · Supplier Pre-Qualification · RFQ · Audit (8-phase lifecycle).
- **Marketplace**: buyer browses suppliers + product catalog + audit history + risk; supplier free profile + premium listing; 3rd-party auditor pool + COI.
- **AI agents (Wave 2 + audit-agents)**: Pre-Audit Questionnaire pre-fill (Gemini · KB-grounded) · Supplier-Intel (openFDA + warning letters + EMA + WHO PQ fusion) · Audit Report Assembler (ICH Q7 framing) · Observation Drafter (cross-tenant pattern reuse) · CAPA RCA Drafter (5-Whys / fishbone) · Risk Brainstormer.
- **Schedulers**: OVERDUE flagger (training / MRM / CAPA / equipment) · Auto-EXPIRE (PQ + RFQ) · FAR clock (3-day) · MDR clock (5/15/30 day).

### The one differentiator
> **"Marketplace + AI on top of the workflow OS — buy the EQMS, get access to 100+ pre-audited suppliers and AI agents that pre-fill 80% of every questionnaire."**

---

## B. Medical Device — *vertical pack #2, shipping Q4 2026*

### Headline
> *"FDA QMSR + ISO 13485 + EU MDR — one workflow OS, AI-assembled Design History Files, and a supplier marketplace for components and contract sterilizers."*

### Market
- Med-device QMS sub-segment **~$1.2-1.5B in 2025**, accelerating with **FDA QMSR effective Feb 2026** (replaces 21 CFR 820, harmonizes with ISO 13485) [directional].
- EU MDR transition forcing reclassification + technical-file upgrades through 2027 — large pull for QMS modernization.

### Standards in scope
ISO 13485:2016 · FDA QMSR (Feb 2026, replaces 21 CFR 820) · ISO 14971 (risk) · IEC 62366 (usability) · IEC 62304 (software) · EU MDR 2017/745 · EU IVDR 2017/746 · MDSAP.

### ICP
- **Primary**: Class II/III device manufacturers + IVD makers (50-1,000 employees), small QMS team but heavy regulatory burden.
- **Secondary**: Contract sterilizers, contract manufacturers (CDMOs for med-device), suppliers of injection-molded components.
- **Buyer**: Director of Quality / Reg Affairs Lead.

### Top pain points
1. **Design controls + DHF compilation.** DHF is a binder that nobody fully controls; reviewers hate it; FDA inspectors find gaps.
2. **Complaint → MDR clock** is mission-critical — 5/15/30 day (21 CFR 803) — and most teams run it in Outlook tasks.
3. **Supplier qualification for medical components** is unevenly enforced — small suppliers refuse to engage; their absence shows up as 483s.

### Top competitors
- **Greenlight Guru** ($30-50k/yr SMB-friendly) — strong design-controls UX, weaker supplier-audit and AI.
- **MasterControl Med Device** ($50k+) — same EQMS as pharma.
- **ZenQMS** (~$25-60k/yr) — SMB-friendly EQMS.
- **Qualio** (~$20-50k/yr) — generic life-science SMB.
- **Veeva Vault QualityOne** — mid-market.

### Hawkeye pack — what's in it
- **Reuse from pharma** (~70%): Document Control · Change Control · CAPA · Risk · Training · Internal Audit · Supplier Pre-Qual · Audit · Marketplace · AI agents.
- **Vertical-specific additions**:
  - **Design Controls + DHF assembler** module (design inputs/outputs, V&V matrix, traceability, DHF binder generator).
  - **Complaint module — MDR clock automation** (already shipped — 5d MDR / 15d critical / 30d otherwise).
  - **EU MDR technical-file template**.
  - **Sterilization-validation tracking** (ISO 11135 / 11137 dosimetry) for sterilizer-supplier audits.
- **Vocabulary swap**: "GMP audit" → "QMS audit" · "deviation" → "nonconformance" · "Field Alert Report" → "Medical Device Report".
- **Vertical AI agent**: **DHF Assembler** — reads design-input docs + V&V protocols + risk file → drafts the Design History File outline with traceability matrix.

### The one differentiator
> **"AI-assembled Design History Files. Saves 40-60 hours per device family per year. No competitor has this."**

---

## C. ISO 9001 — *the cheapest pack, fastest to ship (Q1 2027)*

### Headline
> *"Generic ISO 9001:2015 QMS for SMB manufacturers and services — vocabulary-overlay pack, $15-30k/yr."*

### Market
- ISO 9001 has the largest installed base of any QMS standard — **~1.1M ISO 9001 certificates worldwide** [ISO Survey 2023, directional].
- Most SMB ISO 9001 buyers don't have an EQMS — they run Word + SharePoint. The market is **deep but price-sensitive**.

### Standards in scope
ISO 9001:2015 · ISO 19011 (audits) · sector-specific overlays (AS9100 for aerospace, IATF for auto — separate packs).

### ICP
- **Primary**: SMB manufacturers + service businesses (20-500 employees) building toward / maintaining ISO 9001 certification.
- **Buyer**: Quality Manager (often single-person QA team) or part-time Quality Lead reporting to Operations.

### Top pain points
1. **Internal audits done annually in panic** before certification body visit — no continuous quality posture.
2. **Document control** lives in network shares — change control is unsigned.
3. **Management review** happens once a year, by panic, by Excel.

### Top competitors
- **ETQ Reliance** ($25k+/yr) — heavy.
- **Intelex** (Fortive) — mid-market, expensive.
- **Mango QHSE** (NZ) — SMB-friendly.
- **Q-Pulse** — UK SMB.
- **Ideagen Q-Pulse / Plato** — mid-market.

### Hawkeye pack — what's in it
- **Reuse from pharma** (~80%): Document Control · Change Control · Training · Risk · Internal Audit · Management Review · CAPA · Supplier Pre-Qual.
- **Vocabulary swap**: "GMP audit" → "Quality audit" · "deviation" → "nonconformity" · "ICH Q7" → "ISO 9001 §7-§10".
- **Modules disabled in pack**: Batch Records · Equipment · Complaint MDR clock · FAR clock.
- **Vertical AI agent**: **ISO 9001 audit-readiness scorer** — reads tenant's documents + recent CAPAs + management-review minutes → outputs readiness % + top-5 risks before cert-body visit.

### The one differentiator
> **"$15-30k/yr ISO 9001 EQMS that includes internal-audit + management-review + supplier mgmt — and the AI tells you what to fix before your cert auditor finds it."**

---

## D. Food Safety — *vertical pack #4, roadmap 2027*

### Headline
> *"FSMA + HACCP + BRCGS — supplier compliance + recall blast-radius simulator + AI allergen risk scoring."*

### Market
- Food safety QMS market **~$0.8-1.1B**, growing on FSMA Sec 204 traceability (effective Jan 2026) [directional].
- Driver: traceability-by-lot mandates + brand-protection ROI.

### Standards in scope
FSMA (FDA) · HACCP · BRCGS Food Safety Issue 9 · SQF · ISO 22000 · GFSI.

### ICP
- **Primary**: Food + beverage manufacturers (20-2,000 employees), copackers, ingredient suppliers.
- **Buyer**: VP Food Safety / Quality Manager / Compliance Director.

### Top pain points
1. **Recall blast radius** — when a contaminated lot is traced back, "which of my 800 customers got which lot?" is unanswered.
2. **Supplier compliance audits** for ingredient suppliers — no shared-audit network exists.
3. **Allergen control + label-claim drift** when supplier substitutes an ingredient mid-spec.

### Top competitors
- **SafetyChain** ($30-100k/yr) — HACCP + SPC focus.
- **FoodLogiQ / Trustwell** — traceability + supplier compliance.
- **Compli** — HACCP plans.
- **TraceGains** — ingredient/spec mgmt.
- **Mango QHSE** — SMB.

### Hawkeye pack — what's in it
- **Reuse from pharma** (~50%): Document Control · CAPA · Supplier Pre-Qual · Audit (rebranded) · Training · Risk Register.
- **Vertical-specific additions**:
  - **HACCP plan module** (CCP definition, monitoring frequency, deviation handling).
  - **Lot traceability + recall blast-radius simulator** — query "which lots used this raw material?" + "which customers got which finished lots?".
  - **Allergen matrix + spec-drift detector**.
- **Vertical AI agent**: **Recall Blast-Radius Simulator** — give it a lot ID + suspected hazard → returns affected finished-product lots + customer ship-list + recall-notice draft.

### The one differentiator
> **"FSMA Sec 204 traceability + AI recall blast-radius simulator. Most competitors stop at HACCP — we close the loop to your customers."**

---

## E. Automotive (IATF 16949) — *vertical pack #5, roadmap 2027*

### Headline
> *"IATF 16949 + APQP + PPAP for tier-2/3 auto suppliers — AI-drafted PPAP packages + customer-specific-requirement (CSR) overlays per OEM."*

### Market
- Automotive QMS market **~$0.6-0.9B**, dominated by Plex (Rockwell) + IQS [directional].
- Driver: tier-2/3 supplier consolidation + EV-supply-chain re-shoring.

### Standards in scope
IATF 16949:2016 · APQP (Advanced Product Quality Planning) · PPAP (Production Part Approval Process) · FMEA · MSA · SPC · CSRs (customer-specific requirements) per OEM (Ford, GM, Stellantis, Toyota, etc.).

### ICP
- **Primary**: Tier-2 / tier-3 automotive suppliers (50-2,000 employees) — injection molders, machine shops, electronics assemblers.
- **Buyer**: Quality Manager / APQP Lead.

### Top pain points
1. **PPAP submission packages** are a 30-150 page assembly per part per customer — done by hand in Excel + PDFs. Late PPAP = lost program.
2. **Customer-specific requirements (CSRs)** vary by OEM — what Ford wants for PPAP is different from GM. Each program team rebuilds the CSR matrix.
3. **Supplier APQP cascade** — when you commit a delivery date to your OEM, your suppliers must commit theirs upstream. No shared workflow.

### Top competitors
- **Plex Smart Manufacturing** (Rockwell, $50-200k/yr) — full ERP+QMS, heavy.
- **IQS** ($20-80k/yr) — APQP + PPAP focus.
- **SAP QM** — only inside SAP-shop.
- **Siemens Opcenter Quality** — large enterprise.
- **Omnex** — consulting + tools.

### Hawkeye pack — what's in it
- **Reuse from pharma** (~50%): Document Control · CAPA · Supplier Pre-Qual · Audit (rebranded) · Training · Internal Audit.
- **Vertical-specific additions**:
  - **APQP phase tracker** (5 phases, deliverables, gate reviews).
  - **PPAP package builder** (18 elements: design records, FMEA, control plan, MSA, etc.).
  - **CSR overlay library** (Ford / GM / Stellantis / Toyota / Honda — each as a configurable overlay on top of the IATF baseline).
  - **8D corrective action workflow** (auto industry's CAPA equivalent).
- **Vertical AI agent**: **PPAP Package Auto-Drafter** — reads design records + control plan + FMEA → assembles the 18-element PPAP package + flags missing items + drafts customer-cover-letter.

### The one differentiator
> **"AI-drafted PPAP packages. Cuts PPAP cycle time from 6 weeks to 2. Plex won't build this; IQS doesn't have AI."**

---

## Cross-vertical decision matrix

| Question | Pharma | Med-Device | ISO 9001 | Food | Auto |
|---|---|---|---|---|---|
| Pack ships | **live** | Q4 2026 | Q1 2027 | 2027 | 2027 |
| Buyer ACV (engine + pack) | $30-60k | $40-80k | $15-30k | $25-50k | $30-70k |
| Marketplace fee per shared audit | $2-4k | $3-5k | n/a (cert auditors) | $1-2k (FSVP) | $2-4k (PPAP review) |
| Vertical-specific AI agent | Supplier-Intel | DHF Assembler | Audit Readiness Scorer | Recall Blast-Radius | PPAP Auto-Drafter |
| % code reuse from pharma core | — | ~70% | ~80% | ~50% | ~50% |
| First design-partner target | shipped 5+ | engage Q3 2026 | engage Q4 2026 | engage Q1 2027 | engage Q1 2027 |
| Single biggest competitor | Qualifyze | Greenlight Guru | ETQ Reliance | SafetyChain | Plex |

## What to ship next

- **Med-device discovery** — 5-10 calls with med-device QA leaders to validate the **DHF Assembler** as the wedge (Q3 2026).
- **ISO 9001 SMB pricing test** — public pricing page with $15k entry tier — test-and-learn (Q3 2026).
- **Don't ship food + automotive packs early** — both have heavy domain-specific scope (HACCP / PPAP); only build when there's a paid design partner.
