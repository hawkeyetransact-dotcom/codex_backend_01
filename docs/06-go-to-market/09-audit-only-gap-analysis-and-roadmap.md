# Hawkeye Audit Module — Gap Analysis + Roadmap

*Reference: 24-step expert process + remote-audit user flow + ICH Q7 / EU GMP Ch.9 / 21 CFR Part 11 + competitor analysis (Veeva · MasterControl · TrackWise · ETQ · Qualifyze · IQVIA SmartSolve · Greenlight Guru · AuditBoard · Workiva)*

**Last updated:** 2026-04-29
**Owner:** Hawkeye Platform
**Audience:** product · engineering · GTM
**Status:** v1 — for review

---

## §1 — TL;DR

The audit module covers ~60% of the 24-step expert flow with solid scaffolding for onboarding, scheduling, PAQ, deficiency, CAPA, and monitoring. **Five categories of gaps** cause the breakage you are seeing today and block enterprise pharma adoption:

1. **Intimation letter + supplier e-signature** — completely missing as a record type. No supplier acceptance ceremony before audit can proceed.
2. **Internal vs external auditor distinction + COI + availability scheduling** — model fields exist (`AvailabilityBlockModel`, `AuditorQualificationModel.coiDeclarations`) but the buyer's auditor dropdown does **not** filter by date availability or COI status, and the User schema doesn't model "in-house auditor" vs "third-party auditor".
3. **Auditor execution-questionnaire builder** — no UI for the auditor to compose a focused execution checklist by selecting categories/subcategories from a template; questions are auto-generated.
4. **Per-response live evidence (audio/video/photos/notes)** — `auditorAttachments` and `RemoteSessionModel` exist but are not wired into the execution UX; no video/screen-share provider; no real-time evidence streaming during a remote audit.
5. **Formal audit closure certification** — `phaseState` tracks CLOSURE but there is no certification artifact, no signed closure handoff, no QP-release-blocking signal on disqualification.

**Market opportunity is real:** only Qualifyze advertises a true supplier-side portal, no incumbent has shipped GenAI-drafted observations with citation-traceable evidence, no incumbent bundles video + screen-share + in-tool evidence annotation. **Hawkeye's wedge is a remote-audit cockpit + supplier-first portal at SMB-pharma price point** — the white-space between Qualifyze (per-audit marketplace) and Veeva ($30K+ enterprise floor).

The roadmap below is **5 phases over ~5 calendar months**, with the first 2 phases unblocking the demo script and the remaining 3 closing market gaps.

---

## §2 — Reference flow (what we are building toward)

Three reference flows merge into a single canonical model:

### §2.1 The 24-step expert flow (auditable, Annex 16 compliant)

Source: [`docs/04-processes/superuser-process-flow-24steps.md`](../04-processes/superuser-process-flow-24steps.md). Steps 1-4 are PQ (already wired). Steps 5-24 are the audit-only scope this doc covers.

### §2.2 The user's described "remote-audit" flow

> Buyer sends intimation letter and/or PAQ → supplier signs intimation → supplier optionally fills PAQ → if PAQ not sent now, audit returns to buyer → buyer assigns auditor (internal or external) → auditor calendar updates with availability block → buyer's auditor dropdown filtered by date availability → auditor accepts → auditor sends PAQ + agenda → supplier fills PAQ + agenda → auditor sends execution questionnaire (selects questions/categories/subcategories) → auditor reviews + sends to supplier admin → supplier admin assigns sections to multiple users → each user fills questionnaire + attaches evidence → submits to auditor → auditor scans attachments + responses, captures notes/videos/photos/audio per response → prepares audit report → generates CAPAs

### §2.3 ICH Q7 / EU GMP / 21 CFR Part 11 hard requirements

| Requirement | Source | Hawkeye implication |
|---|---|---|
| Annual internal audit schedule covering all GMP scope | ICH Q7 §2.4 + EU GMP Ch.9 | Audit program calendar with scope-coverage tracking |
| Risk-based supplier qualification + audit strategy | ICH Q7 §7 + EU GMP Ch.7 | Supplier risk band drives audit cadence + checklist depth (Q9(R1) formality spectrum) |
| Quality Agreement between Contract Giver / Acceptor | EU GMP Ch.7 | First-class QualityAgreement record, signed, audit-rights clause exposed |
| Audit report retained permanently, never deleted post-CAPA | EU GMP Ch.9 | Append-only AuditReport collection; no destructive delete |
| Auditor independence from area being audited | EU GMP Ch.9 + ISO 19011 | Cannot assign auditor with conflict-of-interest at supplier or area |
| 21 CFR Part 11 audit trail (append-only, time-stamped, ≥ record retention) | 21 CFR §11.10(e) | Already partially in place (`AuditTrailService`); needs lock-on-signature for AuditReport |
| E-signature with two distinct components, unique-per-individual | 21 CFR §11.50, §11.200 | Existing `ElectronicSignatureModel` covers this; **needs to be extended to IntimationLetter recordType** |
| QP-blockable supplier disqualification | EU GMP Annex 16 | Supplier qualification status + audit-date provenance must surface to batch-release flow |

### §2.4 Canonical 26-step flow (24 expert steps + 2 reconciled additions)

Synthesized below. Step numbers prefixed `S` to disambiguate from expert `#001-#024`.

| # | Step | Owner | Triggers next |
|---|------|-------|---------------|
| S01-S04 | (PQ — already shipped) | Buyer · Supplier | Approved PQ |
| S05 | Pre-Audit Communication / Intimation Letter | Buyer QA | Supplier signature |
| **S05a** | **Internal vs External auditor decision** | Buyer QA | Auditor pool filter |
| S06 | Auditor COI declaration + Auditee acceptance | Auditor → Supplier | COI signed |
| S07 | Audit Scheduling (calendar-aware) | Buyer QA | Mutually agreed dates |
| **S07a** | **Auditor availability check + dropdown filter** | System | Available auditors list |
| S08 | Pre-Audit Documentation request (SMF, SOPs, specs) | Auditor | Docs uploaded |
| S09 | Pre-Audit Questionnaire (PAQ) | Auditor → Supplier | PAQ submitted |
| **S09a** | **Supplier admin assigns PAQ sections to teammates** | Supplier admin | Sections assigned |
| S10 | Audit Agenda | Auditor → Supplier | Agenda accepted |
| **S10a** | **Auditor builds execution checklist from template** | Auditor | Execution checklist signed off |
| S11 | Audit Checklist standard verification | Auditor | Ready to execute |
| S12 | Audit Execution (remote / on-site / hybrid) | Auditor + Supplier | Findings captured |
| **S12a** | **Live remote evidence capture (video/screen-share/notes/photos)** | Auditor + Supplier | Per-response media attached |
| S13 | Opening meeting | Auditor + Buyer + Supplier | Minutes recorded |
| S14 | Closing meeting reporting | Auditor → Supplier | Closing minutes signed |
| S15 | Facility Certification (Approved / Conditional / Rejected) | Auditor + Buyer QA | Decision communicated |
| S16 | Deficiency Reporting | Auditor → Supplier | Deficiencies categorized |
| S17 | Deficiency Validation/Acceptance | Auditor + Supplier | Agreed list |
| S18 | Audit Report | Auditor → Supplier | Report issued |
| S19 | CAPA Plan | Supplier QA | CAPAs submitted |
| S20 | Review & Acceptance of CAPA Plan | Auditor + Buyer QA | CAPAs accepted |
| S21 | Audit Closure Certification | Auditor → Buyer | Closure signed |
| S22 | CAPA tracking | Buyer QA | Effectiveness verified |
| S23 | Supplier monitoring/rating | Buyer QA | Risk band updated |
| S24 | Follow-up / requalification audit planning | Buyer QA | Next audit scheduled |

The **bold rows** are the 5 reconciled additions that close the gaps between the 24-step expert flow and the user's described modern remote-audit reality.

---

## §3 — Current state mapping (per step)

Compiled from a code walk of `backend/src/routes/`, `backend/src/controllers/`, `backend/src/models/`, and `frontend/app/(console)/audits/`. Detail per step:

| # | Step | Backend route | Frontend page | Status |
|---|---|---|---|---|
| S05 | Pre-Audit Communication / Intimation Letter | `auditPhaseRoutes.js` (artifact upsert) | `AuditArtifactDetail.tsx` (renders intimation template) | 🟥 **Missing supplier signature ceremony** — no `recordType: "INTIMATION_LETTER"` in `ElectronicSignatureModel` |
| S05a | Internal vs External auditor decision | — | — | 🟥 **No model field** distinguishing internal employee vs external 3rd-party auditor on `AuditorProfileModel` |
| S06 | Auditor COI declaration + acceptance | `auditorQualificationRoutes.js` | — | ⚠ **Model exists, no UI** for buyer/supplier to view/accept COI |
| S07 | Audit Scheduling | `auditScheduleRoutes.js` | `/audits/[id]/summary` | ✅ Working |
| S07a | Auditor availability dropdown filter | `auditorRoutes.js /availability` GET/POST | — | ⚠ **`AvailabilityBlockModel` exists**, `AuditorSelector` does NOT filter by date availability |
| S08 | Pre-Audit Documentation request | `documentControlRoutes.js` (generic) | `/document-control` | ⚠ Generic doc control, no audit-bound request |
| S09 | Pre-Audit Questionnaire | `preAuditRoutes.js` + `v2/questionnaires.js` | `/audits/[id]/questionnaire` | ✅ Working |
| S09a | Supplier admin assigns PAQ sections | `questionnaireAssignmentRoutes.js` | partially in `/audits/[id]/questionnaire` | ⚠ **Backend assignment model exists** but only "one user per category"; no multi-user-per-section, no UI for supplier admin to bulk assign |
| S10 | Audit Agenda | `preAuditRoutes.js` | `/audits/[id]/summary` | ✅ Working |
| S10a | Auditor execution-checklist builder | `auditorController.js createPreviewAuditQuestions` | — | ❌ **No UI** for auditor to select categories/subcategories and compose a focused execution checklist |
| S11 | Audit Checklist standard verification | `auditPhaseRoutes.js` | `/audits/[id]/template/management` | ✅ Working |
| S12 | Audit Execution | `auditPhaseController.js`, `auditorController.js` | `/audits/[id]/report` (combined) | ⚠ Functional but no dedicated execution-mode UI; auditor edits in report tab |
| S12a | Live remote evidence (video/screen-share/notes/photos/audio) | `remoteAuditRoutes.js` + `RemoteSessionModel` | — | ❌ **Model exists, no provider integration** (Zoom/Teams/Jitsi), no live capture |
| S13 | Opening meeting | — | — | 🟥 No model, no UI |
| S14 | Closing meeting reporting | `auditPhaseController.js` (notes) | — | ⚠ Notes model exists, no formal closing workflow with sign-off |
| S15 | Facility Certification | `auditPhaseController.js` (`facilityOutcome` field) | — | ⚠ Field exists, no certification UI / signed artifact |
| S16 | Deficiency Reporting | `AuditReport.observations[]` | `/audits/[id]/report` | ✅ Working |
| S17 | Deficiency Validation/Acceptance | `auditRequestRoutes.js POST /:id/deficiency-validation` | — | ⚠ Endpoint exists, no UI |
| S18 | Audit Report | `auditorRoutes.js` (report endpoints) + new `/review` | `/audits/[id]/report` | ✅ Working |
| S19 | CAPA Plan | `capaV2Routes.js` + `capaRoutes.js` | `/buyer/capas` + `/supplier/capas` | ✅ Working (after CapaV2 mirror fix) |
| S20 | Review & Acceptance of CAPA | `capaV2Routes.js` (status workflow) | `/buyer/capas/[id]` | ✅ Working |
| S21 | Audit Closure Certification | — | — | 🟥 Phase advances to CLOSURE but no certification artifact |
| S22 | CAPA tracking | `capaV2Routes.js` (`lastActivityAt`, `targetDate`) | `/supplier/capas` | ✅ Working |
| S23 | Supplier monitoring/rating | `supplierRiskRoutes.js` + closure hooks | `/buyer/suppliers/[id]/quality-events` | ⚠ Risk score exists, not visibly tied to audit history |
| S24 | Follow-up / requalification audit planning | `auditRequestsMasterModel.js auditType: 'RECERTIFICATION'` | — | ⚠ Field exists, no scheduler / reminder service |

**Coverage:** 11 ✅ working · 11 ⚠ partial · 4 🟥 missing entirely · `RemoteSession` infrastructure inert.

---

## §4 — Market study (competitor matrix + ICH Q7 implications)

### §4.1 Competitor feature matrix (compressed)

| Vendor | Auditor execution tools | Supplier portal | Internal vs external | Remote audit | Auditor availability | AI features | Pricing | Weakness |
|---|---|---|---|---|---|---|---|---|
| **Veeva Vault QMS** | Audit Program Planning, Auditor Qualification | External Response Collaboration auto-provisions accounts | Both (modeled) | None native | Auditor qualification gating; no scheduler | Vault AI being added | $25K base + ~$600-2,400/user/yr · large pharma $1-5M+/yr | Heavy implementation, expensive at low end |
| **MasterControl Audit** | Wizard-driven lifecycle, supplier scorecard tied to risk | Limited internal-user oriented | Both (FDA, ISO, internal/external types) | None native | None native | Some AI in newer modules | Quote-only enterprise | G2: outdated UI, audit trail buried, no bulk attachment download |
| **TrackWise (Sparta/Honeywell)** | Workflow engine; "400+ audits/yr" | Limited | Internal, third-party, regulatory | None | None | TrackWise AI / QualityWise-AI (event triage) | Quote-only enterprise | Legacy on-prem heritage; rigid workflows |
| **ETQ Reliance** | Plan→checklist→execute→CAPA · **mobile any-device** | Supplier perf tracking, no full portal | Both | Mobile = field-friendly | None | Some smart recommendations | Mid-market enterprise | Configuration complexity |
| **Qualifyze** | **Marketplace** — outsource the audit; 5,000+ shared reports | **Yes — auditee portal** (only competitor with this) | External-supplier-focused | **Yes — explicit remote audits via video conf + doc exchange** | AI-powered scheduling | "AI-powered platform · 65% faster · 50% cost saving" | Per-audit pricing | Marketplace dependence |
| **IQVIA SmartSolve** | Mobile audit + tight CAPA integration | Across 20+ life-sciences modules | Both | Mobile-friendly | None | Generic ML | Quote-only | Older Pilgrim UX surfaces |
| **Greenlight Guru** | Internal/external/supplier/regulatory audits | Supplier mgmt module | Both (medical-device-centric) | None | None | None visible | Mid-market SaaS | **Med device only — gaps on Q7/Annex 16** |
| **AuditBoard** | Strongest UX in space; 200+ integrations | None pharma-specific | Cross-industry | None | None | Strong reporting/automation | $30-150K/yr typical | **No GxP/Part 11 hardening** |
| **Workiva Wdesk** | Risk assessment, scoping, evidence collection | None | Internal-audit-focused (SOX origin) | None | None | Workiva Gen AI assistant '25 | Enterprise quote-only | **Not pharma-native** — used at pharma cos for SOX |

### §4.2 White-space (where nobody has shipped)

1. **Supplier-first portal as a first-class user experience** (sign intimation, fill PAQ, assign sections, respond to CAPA in their own UI) — Qualifyze partial; everyone else absent.
2. **Integrated remote-audit cockpit** — video + screen-share + in-tool evidence annotation as one product, not Zoom + email + portal.
3. **GenAI-drafted observations with citation-traceable evidence** — the PDA Letter pattern (summarization + clickable source traces + human approval). Incumbents talk AI but ship triage/scheduling.
4. **Auditor availability + COI + qualification dropdown filter** — undermarketed by everyone.
5. **Risk-based formality (ICH Q9(R1) "formality spectrum")** as a first-class UX concept — high-risk supplier visibly gets deeper checklist than low-risk.

### §4.3 ICH Q7 / regulatory pressure shaping the roadmap

- **EU GMP Chapter 9** = audit reports never deletable post-CAPA closure → append-only `AuditReport` collection, lock-on-signature.
- **EU GMP Chapter 7** = Quality Agreement is mandatory between Contract Giver/Acceptor → add `QualityAgreement` first-class record with audit-rights clause exposed.
- **EU GMP Annex 16** = QP must confirm supplier audits within prior 3 years → expose **supplier qualification status with audit-date provenance** to batch-release flow; surface **disqualification → batch-block signal**.
- **21 CFR Part 11** = e-signature with two components, unique per individual, never reused → already in place but **must extend to `INTIMATION_LETTER` recordType**.
- **ICH Q9(R1)** (Step 4 in 2023, amended 2025) = "formality spectrum" — high-risk audits visibly more formal → **risk-band-driven checklist depth** must be in the UX.
- **2024-2025 FDA inspection trends** — data integrity 79% of warning letters, CMO oversight a 2025 enforcement focus, foreign sites 33% of warning letters → ship strong **data-integrity question pack** + **CMO oversight pack** as defaults.

---

## §5 — Gap analysis (top 12, prioritized)

P0 = blocks the demo script today · P1 = blocks first-customer pilot · P2 = blocks enterprise sale · P3 = nice to have

| # | Gap | Priority | Where it bites |
|---|---|---|---|
| G1 | No supplier e-signature on intimation letter (S05) | **P0** | Demo step 5 fails; supplier just acknowledges, doesn't sign |
| G2 | Buyer auditor dropdown not filtered by availability + COI (S05a/S07a) | **P0** | User reports buyer can pick unavailable auditor → broken assignment |
| G3 | Internal vs external auditor not modeled | **P0** | User explicitly asked for this; no UI exists today |
| G4 | Supplier admin can't assign PAQ sections to multiple teammates (S09a) | **P0** | Demo UC-5 demands it; backend half-built |
| G5 | Auditor execution-checklist builder MIA (S10a) | **P0** | Auditor can't compose focused checklist; demo UC-6 papered over |
| G6 | Audit-only flow has multiple navigation/state bugs | **P0** | "Phase closed" errors, stale auditor placeholder, broken CAPA mirror — partly addressed already |
| G7 | No live remote evidence capture (audio/video/screen-share/notes/photos per response) (S12a) | P1 | Differentiator vs incumbents; user explicitly asked |
| G8 | No formal closure certification artifact (S21) | P1 | Audit advances through CLOSURE without a signed handoff |
| G9 | Internal audit program calendar (annual schedule with scope coverage) missing | P1 | ICH Q7 §2.4 + EU GMP Ch.9 mandatory; needed for self-inspection use case |
| G10 | Quality Agreement record + audit-rights clause | P2 | EU GMP Ch.7 mandatory for supplier qualification; QP needs it for Annex 16 |
| G11 | Risk-band-driven checklist depth (Q9(R1) formality spectrum) | P2 | Differentiator + 2025 FDA expectation |
| G12 | AI observation drafter with citation-traceable evidence | P2 | Market white-space; PDA Letter pattern |

---

## §6 — Roadmap (5 phases, ~5 calendar months)

Each phase ends with a **demoable + sellable** milestone. Backend-first within each phase, then frontend, then polish.

### Phase 1 — Stabilize the audit-only happy path (3-4 weeks)

**Theme:** make the demo script work end-to-end without surprises. Hits gaps **G1, G2, G3, G4, G5, G6**.

- **G3 → User schema:** add `auditorAffiliation: enum('internal', 'external')` and `auditorOrgId` to `AuditorProfileModel`.
- **G2/G7a → Availability filter:** `AuditorSelector` component calls a new `GET /api/auditors/available?supplierProposedDates=...&durationDays=...&auditorAffiliation=...` that joins `AuditorQualification.coiDeclarations` × `AvailabilityBlockModel` and returns only auditors with no conflict + no COI block. Buyer dropdown re-renders from this.
- **G1 → Intimation letter signature:** extend `ElectronicSignatureModel.recordType` enum with `INTIMATION_LETTER`; add `POST /api/audits/:id/intimation/sign` endpoint; add a "Sign intimation letter" CTA on the supplier-side audit detail page; lock the artifact `data` on signature with `signatureId` reference.
- **G4 → Multi-user PAQ section assignment:** extend `QuestionnaireSectionAssignmentModel` to support `assignedToUserIds[]` (array, not single); add a "Assign sections" page for supplier admin where they bulk-assign categories to teammates; section-level filter on `/audits/[id]/questionnaire` so each assignee sees only their sections.
- **G5 → Execution-checklist builder:** new auditor page `/audits/[id]/execution/builder` that lists all available audit-question categories from the active template, lets the auditor check/uncheck and reorder, then writes the curated set into `AuditQuestions[]` with `inExecutionScope: true`. The execution UI then filters by this flag.
- **G6 → Audit-only navigation/state:** continuation of the previous bug-fix batches — verify HK-0000086, HK-0000087 flows work with the buyer-tenant-scope query already shipped.

**Exit criteria:** every step S05-S20 in the canonical 26-step flow has a working UI and backend; one persona walkthrough run captures all of them with no empty screenshots.

### Phase 2 — Closure + audit program (3-4 weeks)

**Theme:** close the audit cleanly and surface the loop back to the buyer's supplier program. Hits gaps **G8, G9, G10, G11**.

- **G8 → Closure certification:** new `AuditClosureCertificate` model with `signatureId` reference; `POST /api/audits/:id/close-certificate`; PDF rendered with template; QP-blocking signal exposed via `audit.closureOutcome` and joined into `SupplierRiskSnapshot`.
- **G9 → Audit program calendar:** new `AuditProgramModel` with annual schedule + GMP scope coverage matrix; calendar UI for buyer QA showing planned vs completed per scope area (premises / equipment / personnel / docs / production / QC / distribution / complaints / recalls / self-inspection).
- **G10 → Quality Agreement:** new `QualityAgreementModel`; signed contract record; audit-rights clause exposed as a queryable field; surface as a tab on `/buyer/suppliers/[id]`.
- **G11 → Q9(R1) formality spectrum:** add `riskBand` resolution to template selection so high-risk supplier auto-loads a deeper checklist; surface "Q9 formality: HIGH" badge on the audit detail.

**Exit criteria:** EU GMP Chapter 7+9+Annex 16 inspection-readiness checklist passes manual review; closure certificate renders and is non-deletable; audit program calendar shows annual scope coverage with remaining-scope tracking.

### Phase 3 — Remote-audit cockpit (4-6 weeks)

**Theme:** ship the integrated remote-audit experience that no incumbent has bundled. Hits gap **G7**.

- **Provider integration:** Jitsi Meet self-hosted or Daily.co API (cheaper than Zoom/Teams enterprise) wired into `RemoteSessionModel`; meeting URLs + session tokens minted server-side.
- **Auditor cockpit page:** `/audits/[id]/execution/remote` — left rail with the curated execution checklist, center pane with the embedded video + supplier shared screen, right rail with per-question evidence dock that captures audio/video/photos/notes timestamped to the question.
- **Supplier remote-audit page:** `/supplier/audits/[id]/remote` — joins the same session; can share screen + upload evidence in real time; sees the question the auditor is currently on.
- **Per-response media:** `AuditQuestion.responseMedia[]` array with `{type, mediaRef, capturedAt, capturedBy}`; uploads go through S3 with WebSocket progress; large file support (already 25MB JSON limit; raise S3 multipart for >100MB videos).
- **Recording + retention:** session recording stored in `RemoteSessionModel.recordingRef`; lifecycle policy 7 years (matches batch retention); accessible only to auditor + buyer QA + supplier admin.

**Exit criteria:** an auditor and a supplier can run a full remote audit on a single screen each, end-to-end, with every observation timestamped to the moment in the recording.

### Phase 4 — AI observation + report drafter (4-5 weeks)

**Theme:** ship the GenAI capability nobody has — citation-traceable observation drafting. Hits gap **G12**.

- **Source-of-truth corpus:** ingest the audit's curated checklist + supplier PAQ responses + uploaded evidence + ICH Q7 / EU GMP / 21 CFR cited clauses into a vector store keyed by audit ID.
- **Observation drafter agent:** for each finding the auditor flags, the agent returns a draft observation with **inline citations** ([1], [2]) clickable back to source paragraph in evidence or guidance. Pattern follows PDA Letter: summarization + citations + human approval.
- **Severity + GMP-classification suggester:** based on cited clause + severity heuristics, agent suggests Critical / Major / Minor + suggested CAPA target date; auditor reviews and accepts or overrides.
- **Report assembler:** existing endpoint upgraded to assemble report sections from observations with citations preserved; report PDF includes a "Sources" appendix.
- **Audit-trail:** every AI suggestion logged in `agent-usage-events` with input + output + acceptance/edit decision (already in place).

**Exit criteria:** a real audit ends in a drafted report whose every observation has a clickable citation; auditor edit time decreases >50% measured against baseline; agent-usage cost-per-audit visible in the AI ROI dashboard.

### Phase 5 — Internal audit + program maturity (3-4 weeks)

**Theme:** open the second use-case — internal audit / self-inspection — that doubles addressable market. Hits residual gaps + ICH Q7 §2.4.

- **Internal audit mode:** audit type already has enum value; surface it in the New Audit form; internal audits use the buyer's own employees as auditors (filter `auditorAffiliation === 'internal'`) auditing a buyer site rather than a supplier.
- **Scope-coverage matrix:** Audit Program calendar (Phase 2) extended to track which GMP scope areas have been covered in the current cycle; flag uncovered areas as risk.
- **Management review pack:** auto-generated quarterly summary of audit findings + CAPA closure rates + supplier risk movement, ready for management review per ICH Q10.
- **Requalification audit auto-scheduler:** `auditType: 'RECERTIFICATION'` triggers a calendar invite + email reminder N days before the prior audit's `validUntil`.
- **Public-source audit-readiness dashboard:** for the buyer's own sites, surface FDA 483 / warning letter trends affecting their region/product class and pre-load the relevant question packs.

**Exit criteria:** an internal QA team can run their full annual self-inspection program through Hawkeye; management review pack auto-generates from real data; recertification reminders fire on schedule.

---

## §7 — Recommendations + immediate-next-steps

**Cut from scope (for now):**
- Building our own video provider — use Jitsi/Daily.co.
- Mobile-native app — desktop browser is sufficient for v1; ETQ's mobile UX is their differentiator, not ours.
- A marketplace/shared-audit model like Qualifyze — different business model, not our wedge.

**Double down on (for differentiation):**
- Supplier-first portal experience (existing investment; finish multi-user section assignment in Phase 1).
- Citation-traceable AI observation drafting (Phase 4).
- Integrated remote-audit cockpit (Phase 3).
- Risk-based formality (Q9(R1)) as a visible UX concept (Phase 2/4).

**Ship next, in order:**
1. Stop bug-fix sprint; start Phase 1 with the 6 gaps above (G1-G6).
2. Update [`07-pharma-demo-script.md`](07-pharma-demo-script.md) so its menu paths reference the section-labelled top-bar (already shipped) and add a UC for the new intimation-letter signature ceremony (Phase 1 deliverable).
3. Run the `bugfix-e2e-suite.test.mjs` after every Phase 1 backend change to catch regressions.
4. After Phase 1 lands, add a Phase-2 "Internal Audit Program" demo persona (Sanjay — Buyer QA Director) with a separate UC track.

**Sales / GTM signals to instrument:**
- Per-tenant audit completion time (target: <60% of baseline by end of Phase 4).
- Per-audit AI agent cost (track in AI ROI dashboard; target <$5/audit).
- Auditor finding acceptance rate (target: >80% of AI-suggested observations accepted with minor edit).
- Supplier intimation-signature time-to-sign (target: <72hrs median).

---

## §8 — Open questions for product

1. **Internal-vs-external auditor org modeling** — should an internal auditor be tied to a `BuyerOrg.employees[]` or a separate `InternalAuditorTeam` record? Affects how COI is computed.
2. **Quality Agreement** — should the QA template be tenant-configurable or platform-default? FDA + EU expectations differ slightly.
3. **Recording retention duration** — 7 years matches batch retention but storage cost is non-trivial; tenants may want to override (down to 2-3 years for low-risk suppliers).
4. **AI provider strategy** — keep Gemini Flash-Lite + Claude Sonnet for Phase 4 drafting, or add Anthropic-only for higher fidelity at the cost? Open until pricing data lands.
5. **Mobile** — defer entirely or PWA in Phase 5? ETQ's pharma customers consider mobile near-mandatory for plant-floor on-site audits.

---

## §9 — Sources

**Regulatory:**
- ICH Q7 Guideline (database.ich.org)
- ICH Q9(R1) Step 4 (Federal Register, 2023; correction Jan 2025)
- EU GMP Chapter 7, Chapter 9, Annex 16 (ECA Academy, gmp-compliance.org)
- 21 CFR Part 11 (eCFR)
- ICH Q7 Q&As (database.ich.org)

**Competitor product pages:** Veeva Vault QMS · MasterControl Audit · Sparta TrackWise · ETQ Reliance · Qualifyze · IQVIA SmartSolve · Greenlight Guru · AuditBoard · Workiva Wdesk

**Industry direction:** PDA Letter (AI in pharma audit readiness), Pharma Manufacturing (hybrid inspection model), TCS (remote audit automation), Leucine (2025 FDA Warning Letter trends), Pharmaphorum (controlling AI hallucinations), Clinical Leader (FDA AI guidance)

**Hawkeye internal docs:**
- [`docs/04-processes/superuser-process-flow-24steps.md`](../04-processes/superuser-process-flow-24steps.md)
- [`docs/04-processes/gmp-audit-data-flow.md`](../04-processes/gmp-audit-data-flow.md)
- [`docs/05-feature-guides/audit-only-feature-guide.pdf`](../05-feature-guides/audit-only-feature-guide.pdf)
- [`docs/06-go-to-market/07-pharma-demo-script.md`](07-pharma-demo-script.md)
