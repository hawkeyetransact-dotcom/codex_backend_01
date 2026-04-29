# Hawkeye Audit Flow — Swim-Lane Diagram

*Persona-lane process map for the canonical 26-step audit lifecycle (the 24-step expert flow + 2 reconciled additions for remote-audit reality). Shipped state as of 2026-04-29 — all P0/P1 gaps closed except G7 (remote-audit video cockpit, deferred).*

---

## §1 — How to read

**Five lanes**, each owned by a persona group. Boxes flow top-to-bottom within a lane; **arrows that cross lanes are persona handoffs**. Color encoding tells you what just shipped vs. what was already there:

| Color | Meaning |
|---|---|
| 🟢 green | **Just shipped** as part of the gap-closing roadmap (commit 589d8ac + 569c438) |
| 🔵 blue | Already wired before the gap sprint |
| 🟣 purple | AI / System automation — runs without a human click |
| 🟡 yellow | Deferred to a later phase (G7 — remote-audit cockpit) |

**Lanes:**

| Lane | Color | Owner | Personas | Their job |
|---|---|---|---|---|
| 🟧 BUYER PROCUREMENT | yellow | Karan | Karan Mehta | Initiates supplier engagements (PQ creation) |
| 🟦 BUYER QA / AUDIT PROGRAM | blue | Priya · Elena | Priya Nair (Audit PM) · Dr Elena Vasquez (VP QA) | Owns the audit programme, assigns auditors, approves CAPA, signs closure |
| 🟪 AUDITOR | purple | Maria · Rahul | Maria Santos (Lead) · Rahul Kapoor (Co) | 3rd-party or internal — runs the audit + drafts report + generates CAPAs |
| 🟩 SUPPLIER | green | Asha + team | Asha Sharma (QA Head) · Amit · Deepa · Raj · Meera | Signs intimation, fills PAQ, assigns sections, submits CAPA |
| 🟥 AI / SYSTEM | red | (automated) | — | Closure-loop hooks, scorecard refresh, observation drafter |

---

## §2 — Swim-lane (full 26 steps)

```mermaid
flowchart TB
    %% ── Color classes ──────────────────────────────────────────────────────
    classDef shipped fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d
    classDef existing fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a
    classDef ai fill:#f3e8ff,stroke:#9333ea,stroke-width:1.5px,color:#581c87
    classDef deferred fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f,stroke-dasharray:5 3

    %% ── BUYER PROCUREMENT lane (Karan) ────────────────────────────────────
    subgraph PROC["🟧 BUYER PROCUREMENT — Karan"]
      direction TB
      S01["S01-S04 · Open Pre-Qual<br/>+ supplier intake"]:::existing
    end

    %% ── SUPPLIER lane (Asha + team) ──────────────────────────────────────
    subgraph SUP["🟩 SUPPLIER — Asha + Amit + Deepa + Raj + Meera"]
      direction TB
      S02_S["S02 · Submit PQ checklist"]:::existing
      S05_S["S05 · Sign Intimation Letter<br/>(21 CFR Part 11 e-sig)"]:::shipped
      S08_S["S08 · Upload SMF + SOPs"]:::existing
      S09_S["S09 · Receive PAQ"]:::existing
      S09a_S["S09a · Supplier Admin assigns<br/>PAQ sections to teammates"]:::shipped
      S10_S["S10 · Acknowledge agenda"]:::existing
      S12_S["S12 · Respond live during execution"]:::existing
      S14_S["S14 · Closing meeting"]:::existing
      S16_S["S16 · Receive deficiency list"]:::existing
      S19_S["S19 · Submit CAPA plan"]:::existing
    end

    %% ── BUYER QA lane (Priya + Elena) ────────────────────────────────────
    subgraph QA["🟦 BUYER QA / AUDIT PROGRAM — Priya + Elena"]
      direction TB
      S05_Q["S05 · Send Intimation Letter"]:::existing
      S05a_Q["S05a · Decide internal vs<br/>external auditor"]:::shipped
      S07_Q["S07 · Schedule audit"]:::existing
      S20_Q["S20 · Review supplier CAPA"]:::existing
      S21_Q["S21b · Approve closure cert<br/>(buyer signs APPROVED)"]:::shipped
      S22_Q["S22 · CAPA tracking"]:::existing
      S23_Q["S23 · Supplier monitoring + rating"]:::existing
      S24_Q["S24 · Re-qualification planning"]:::existing
      G9_Q["G9 · Audit Program Calendar<br/>(annual GMP scope coverage)"]:::shipped
      G10_Q["G10 · Quality Agreement<br/>(buyer drafts + signs)"]:::shipped
    end

    %% ── AUDITOR lane (Maria + Rahul) ─────────────────────────────────────
    subgraph AUD["🟪 AUDITOR — Maria + Rahul"]
      direction TB
      S02_A["S02 · Decide PQ"]:::existing
      S06_A["S06 · COI declaration"]:::existing
      S08_A["S08 · Doc request"]:::existing
      S09_A["S09 · Send PAQ"]:::existing
      S10_A["S10 · Send agenda"]:::existing
      S10a_A["S10a · Build execution<br/>checklist (G5 builder)"]:::shipped
      S11_A["S11 · Standard verification"]:::existing
      S12_A["S12 · Execute audit<br/>(remote / on-site / hybrid)"]:::existing
      S12a_A["S12a · Live evidence cockpit<br/>(video + screen-share)"]:::deferred
      S13_A["S13 · Opening meeting"]:::existing
      S14_A["S14 · Closing meeting reporting"]:::existing
      S15_A["S15 · Facility certification"]:::existing
      S16_A["S16 · Deficiency reporting"]:::existing
      S17_A["S17 · Deficiency validation"]:::existing
      S18_A["S18 · Audit report"]:::existing
      S20_A["S20 · Approve CAPA plan"]:::existing
      S21_A["S21a · Author closure cert<br/>(auditor signs AUTHORED)"]:::shipped
    end

    %% ── AI / SYSTEM lane ─────────────────────────────────────────────────
    subgraph SYS["🟥 AI / SYSTEM — automated hooks"]
      direction TB
      H_AVAIL["S07a · Auditor dropdown<br/>filtered by availability + COI"]:::shipped
      H_NOTIFY["Notify on every state transition<br/>(actionUrl deeplink)"]:::existing
      H_AGG["Aggregator · 7 collections joined<br/>per supplier (Tier 1+2+3)"]:::existing
      H_AI_DRAFT["G12 · AI observation drafter<br/>(citation-traceable)"]:::shipped
      H_AI_REPORT["AI Report Assembler<br/>(narrative)"]:::ai
      H_SCORECARD["Scorecard refresh<br/>(CAPA close → snapshot)"]:::existing
      H_FORCAUSE["For-cause audit hook<br/>(complaint → audit)"]:::existing
    end

    %% ── Cross-lane handoff arrows ────────────────────────────────────────
    S01 --> S02_S
    S02_S --> S02_A
    S02_A --> S05_Q
    S05_Q --> S05_S
    S05_S -.->|signed| H_NOTIFY
    H_NOTIFY -.->|notify buyer| S05a_Q
    S05a_Q --> H_AVAIL
    H_AVAIL -.->|filter dropdown| S07_Q
    S07_Q --> S06_A
    S06_A -.->|COI declared| S05_S
    S07_Q --> S08_A
    S08_A --> S08_S
    S08_S --> S09_A
    S09_A --> S09_S
    S09_S --> S09a_S
    S09a_S --> S09_S
    S09_A --> S10_A
    S10_A --> S10_S
    S10_A --> S10a_A
    S10a_A --> S11_A
    S11_A --> S13_A
    S13_A --> S12_A
    S12_A -.->|optional| S12a_A
    S12_A <--> S12_S
    S12_A --> S14_A
    S14_A --> S14_S
    S14_A --> S15_A
    S15_A --> S16_A
    S16_A --> S16_S
    S16_S --> S17_A
    S17_A --> S18_A
    S18_A -.->|notify buyer| H_NOTIFY
    S18_A --> H_AI_DRAFT
    S18_A --> H_AI_REPORT
    S18_A --> S19_S
    S19_S --> S20_A
    S20_A --> S20_Q
    S20_Q --> S21_A
    S21_A --> S21_Q
    S21_Q -.->|locks cert| H_SCORECARD
    H_SCORECARD --> S22_Q
    H_SCORECARD --> S23_Q
    S22_Q --> S24_Q
    H_AGG -.->|feeds| S23_Q
    G9_Q -.->|drives| S07_Q
    G10_Q -.->|signed| S05_S
    H_FORCAUSE -.->|spawns| S05_Q
```

---

## §3 — The two key handoff patterns

**1. Linear audit lifecycle (solid arrows):**

`Karan (S01)` → `Supplier (S02)` → `Auditor (S02 decision)` → `Buyer QA (S05 send intimation, S05a pick auditor type)` → **`Supplier (S05 sign)`** → `Auditor (S06 COI · S08-S11 prep)` → **`Auditor (S10a build execution checklist)`** → `Auditor (S12 execute, S13-S15)` → `Supplier (S19 CAPA)` → `Auditor (S20 approve · S21a sign closure)` → **`Buyer QA (S21b approve closure)`** → System (scorecard refresh)

The bold steps are the four shipped-this-sprint additions that fill what was broken in the demo.

**2. EQMS↔Supplier bridge automation (dotted arrows from System lane):**

- Every quality event (deviation, complaint) feeds the unified Quality Events pane
- For-cause audit hook spawns a new audit when a critical complaint is filed
- CAPA closure auto-refreshes the supplier scorecard
- Audit Program Calendar drives buyer QA scheduling
- Quality Agreement constrains intimation letter content (audit-rights clause must hold)

---

## §4 — What's shipped vs. deferred

| Layer | Shipped | Deferred |
|---|---|---|
| **Backend** | G1 intimation sign · G2 available-auditors filter · G3 auditor affiliation · G4 bulk PAQ assignment · G5 execution scope · G8 closure cert · G9 audit program · G10 quality agreement · G11 formality resolver · G12 observation drafter (skeleton) | G7 video cockpit |
| **Frontend** | G1 sign button · G2 selector prop · G4 bulk-assign page · G5 execution builder · G8 closure cert page | G7 cockpit · G9/G10 management UIs · G12 drafter UI |
| **E2E tests** | 42/42 PASS covering G1, G2, G3, G5, G8, G9, G10, G12 | G4 (needs supplier-team mock) · G7 |

---

## §5 — Process flow as a numbered list (for accessibility)

| # | Step | Lane | Who | Status |
|---|---|---|---|---|
| 1 | Open Pre-Qualification | Buyer Procurement | Karan | 🔵 |
| 2 | Submit PQ checklist | Supplier | Asha | 🔵 |
| 3 | Decide PQ (approve/conditional/reject) | Auditor | Maria | 🔵 |
| 4 | Approved PQ → ready to audit | System | — | 🔵 |
| 5 | Send Intimation Letter | Buyer QA | Priya | 🔵 |
| 6 | **Sign Intimation Letter (e-sig)** | Supplier | Asha | 🟢 G1 |
| 7 | **Decide internal vs external auditor** | Buyer QA | Priya | 🟢 G3/G5a |
| 8 | **Auditor dropdown filtered by availability + COI** | System | — | 🟢 G2/S07a |
| 9 | Schedule audit | Buyer QA | Priya | 🔵 |
| 10 | COI declaration | Auditor | Maria | 🔵 |
| 11 | Pre-audit doc request | Auditor | Maria | 🔵 |
| 12 | Upload SMF + SOPs | Supplier | Asha | 🔵 |
| 13 | Send PAQ | Auditor | Maria | 🔵 |
| 14 | **Supplier admin bulk-assigns PAQ sections** | Supplier | Asha | 🟢 G4 |
| 15 | Each teammate fills assigned section | Supplier | Amit · Deepa · Raj · Meera | 🔵 |
| 16 | Send agenda | Auditor | Maria | 🔵 |
| 17 | Acknowledge agenda | Supplier | Asha | 🔵 |
| 18 | **Build execution checklist (curate from template)** | Auditor | Maria | 🟢 G5 |
| 19 | Standard verification | Auditor | Maria | 🔵 |
| 20 | Opening meeting | Auditor + Buyer + Supplier | Maria + Priya + Asha | 🔵 |
| 21 | Execute audit (remote/on-site/hybrid) | Auditor + Supplier | Maria + Asha | 🔵 |
| 22 | **Live evidence capture cockpit** | Auditor + Supplier | (deferred) | 🟡 G7 |
| 23 | Closing meeting | Auditor + Supplier | Maria + Asha | 🔵 |
| 24 | Facility certification | Auditor + Buyer QA | Maria + Priya | 🔵 |
| 25 | Deficiency reporting | Auditor → Supplier | Maria → Asha | 🔵 |
| 26 | Deficiency validation | Auditor + Supplier | Maria + Asha | 🔵 |
| 27 | Audit report | Auditor | Maria | 🔵 |
| 28 | **AI observation drafter (citation-traceable)** | System | — | 🟢 G12 |
| 29 | Per-finding CAPA generated | Auditor | Maria | 🔵 |
| 30 | Submit CAPA plan | Supplier | Asha | 🔵 |
| 31 | Auditor reviews CAPA | Auditor | Maria | 🔵 |
| 32 | Buyer reviews CAPA | Buyer QA | Priya | 🔵 |
| 33 | **Auditor authors closure certificate (AUTHORED sig)** | Auditor | Maria | 🟢 G8a |
| 34 | **Buyer approves closure certificate (APPROVED sig)** | Buyer QA | Elena | 🟢 G8b |
| 35 | Scorecard refresh + audit closed | System | — | 🔵 |
| 36 | CAPA tracking | Buyer QA | Priya | 🔵 |
| 37 | Supplier monitoring + rating | Buyer QA | Priya | 🔵 |
| 38 | **Audit Program Calendar tracks scope coverage** | Buyer QA | Elena | 🟢 G9 |
| 39 | Re-qualification planning | Buyer QA | Priya | 🔵 |
| 40 | **Quality Agreement enforces audit-rights clause** | Buyer QA + Supplier | Elena + Asha | 🟢 G10 |

---

## §6 — Where to find each step in code

| Step | Backend | Frontend |
|---|---|---|
| Sign Intimation (G1) | `src/controllers/intimationSignatureController.js` | `app/(console)/supplier/audits/[id]/page.tsx` |
| Available auditors (G2) | `src/controllers/auditorAvailabilityController.js#listAvailableAuditors` | `components/shared/AuditorSelector.tsx` (`supplierIdForCoi` prop) |
| Auditor affiliation (G3) | `src/models/auditorProfileModel.js` | (passes through G2 selector) |
| Bulk PAQ assign (G4) | `src/controllers/questionnaireAssignmentController.js#bulkAssignSections` | `app/(console)/supplier/audits/[id]/assign-sections/page.tsx` |
| Execution scope (G5) | `src/controllers/executionScopeController.js` | `app/(console)/audits/[id]/execution-builder/page.tsx` |
| Closure cert (G8) | `src/controllers/auditClosureController.js` + `src/models/auditClosureCertificateModel.js` | `app/(console)/audits/[id]/closure/page.tsx` |
| Audit program (G9) | `src/routes/auditProgramRoutes.js` + `src/models/auditProgramModel.js` | (CRUD UI next session) |
| Quality agreement (G10) | `src/routes/qualityAgreementRoutes.js` + `src/models/qualityAgreementModel.js` | (workspace UI next session) |
| Q9(R1) formality (G11) | `src/services/audit/formalityResolver.js` + `formalityTier` fields | (chip in G5 builder) |
| AI observation drafter (G12) | `src/controllers/observationDrafterController.js` | (drafter pane next session) |
