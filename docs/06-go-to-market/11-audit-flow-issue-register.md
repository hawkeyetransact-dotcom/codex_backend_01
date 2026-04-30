# Audit-Flow Manual-Test Issue Register

*Issues found during the live step-by-step walkthrough on 2026-04-29.
Triage rule: only fix when it blocks the next step. Otherwise log here
and keep moving.*

---

## How to read

| Status | Meaning |
|---|---|
| 🟢 OPEN — defer | Logged, not blocking, fix in a later sprint |
| 🟡 OPEN — block | Blocks current walkthrough, must fix to proceed |
| 🔵 IN PROGRESS | Being worked right now |
| ✅ FIXED | Shipped + verified |

---

## §1 — Issues from Priya (Buyer · Audit Program Mgr) login

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 1 | Top bar after login | Section labels (`Discover · Procure · Audits · EQMS · Admin`) are too faint to read. Want a smarter menu UX — e.g. a folder icon + hover dropdown for each section instead of always-visible static labels. | UX polish | 🟢 OPEN — defer |
| 2 | Top bar after login | The `Admin` section is not visible for Priya. Priya's role is `buyer`, but the Admin Panel item is gated to `admin / tenant_admin / superadmin` only. Either expand the gating or add a "no items in this section" affordance. Need to clarify intent first. | UX clarification | 🟢 OPEN — defer |
| 3 | All audit / RFQ / PQ pages | Request ID naming is inconsistent across the system — `hawkeyeRequestId`, `internalRequestId`, `supplierRequestId`, `pqNumber`, `auditNumber`, `complaintNumber`, `deviationNumber`, `qaNumber` etc. Want one canonical convention exposed in the UI. | Data/UX consistency | 🟢 OPEN — defer |

---

## §2 — Issues from Priya creating a new audit + loading intimation artifact

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 4 | Audit detail → Intimation letter artifact | **Lead Auditor field defaults to Priya** (the buyer who created the audit). Should default to blank or `[To be assigned]` until an actual auditor is assigned to the audit. The current behaviour is misleading because the buyer goes on to assign a different external auditor afterwards — but the artifact already shows Priya's name as the auditor. | Data correctness | 🟢 OPEN — defer |
| 5 | Audit detail → Intimation letter artifact | **Supplier signature block appears already populated/defaulted at the initiated stage** — the artifact shows what looks like a supplier signature already in place even though the intimation has not yet been sent and the supplier has not yet had a chance to sign it. Need to confirm whether this is an intentional placeholder or a bug. If placeholder, label it explicitly as "Awaiting supplier signature". | UX clarification | 🟢 OPEN — defer |

---

## §3 — Issues from Priya assigning the lead auditor

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 7 | After auditor assignment → intimation letter artifact | **Intimation letter artifact does not refresh with the newly assigned auditor's name.** Priya assigned Maria as Lead Auditor; the audit card updated correctly, but the intimation letter PDF/preview still shows the previous default (Priya). The artifact needs to either re-render on auditor assignment, or be regenerated on-demand when the buyer opens it. Likely cause: artifact is cached / generated at audit-creation time, not lazily on view. | Data correctness | 🟢 OPEN — defer |
| 8 | Auditor assignment dialog | **COI warning not verified.** Priya did not see a COI warning when assigning Maria. Could be either: (a) Maria genuinely has no COI for this supplier (correct behaviour), or (b) the COI filter isn't wired into the dialog (see Issue #6 — `supplierIdForCoi` not passed to `<AuditorSelector>`). Needs a dedicated test: seed an auditor with an active COI declaration for the same supplier and verify the dropdown excludes them / shows a warning. | Test pending | 🟢 OPEN — defer |

---

## §4 — Issues from intimation send

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 9 | Audit creation → intimation auto-send | **Intimation letter was auto-sent to the supplier at audit-creation time, *before* the buyer had a chance to assign the auditor.** Result: the supplier received an intimation letter with no Lead Auditor name (or with Priya defaulted as auditor — see Issue #4). This is a process-correctness problem regardless of Pattern A vs B: the buyer should either (a) explicitly press "Send intimation" after assigning the auditor, or (b) if auto-send stays, the letter must be regenerated and re-sent (or supplemented) once the auditor is assigned. Note: confirms Issue #7 from the buyer side — supplier-side artifact is also stale. | Process correctness | 🟢 OPEN — defer |

**Solution options for #9:**
- **A. Remove auto-send.** Buyer must explicitly click "Send intimation" after assigning auditor. Aligns with Pattern A wizard ordering (Issue #6). Simple, but adds one extra click.
- **B. Keep auto-send, regenerate on auditor change.** Re-render the artifact + push a "Lead auditor updated" notification to the supplier when the auditor changes post-send. Lower friction but creates artifact-version churn the supplier has to track.
- **Recommendation: A**, bundled with the Pattern A wizard work in Issue #6.

---

## §5 — Issues from supplier acceptance

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 10 | Supplier audit summary → Accept button | **Two parallel acceptance tracks confuse the supplier.** Asha clicked **Accept** from the audit summary table — the button disappeared (looks done). But when she opened the audit detail and went to the intimation letter, it was *still* unsigned with no proposed audit dates. So the audit looks "accepted" in one view and "pending formal acceptance" in another. The summary-table Accept should either: (a) be removed entirely so the only path to acceptance is the intimation-letter signature + date proposal, or (b) deep-link straight into the intimation letter ("Accept" → opens the letter for signature + date), or (c) show a popup: "You have informally accepted. To formally accept, sign the intimation letter and propose audit dates." Option (b) is the cleanest — one acceptance, one place. | Process correctness / UX | 🟢 OPEN — defer |

**Solution options for #10:**
- **A. Remove the summary-table Accept button.** Only path to acceptance is the intimation letter (sign + propose dates). Single source of truth.
- **B. Deep-link the Accept button into the intimation-letter signature flow.** One click from the table opens the letter modal where the supplier signs + picks dates. Same UX as today but the action goes to the right place.
- **C. Keep both but show a popup after table-click warning that signature + date proposal is still required.** Cheapest fix, doesn't address root cause (two acceptance concepts).
- **Recommendation: B.** Lowest friction for the supplier (still one click from the table) and removes the ambiguity.

---

## §6 — Issues from intimation signature + date proposal

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 11 | Supplier intimation letter → Send to buyer | **"Send to buyer" button gives no UI feedback (data DOES persist).** Asha signed the intimation letter, proposed dates, clicked "Send to buyer". The DB state updated correctly (audit status moved to the next phase — confirmed via subsequent persona check). But the UI gives no signal: no toast, no button-disabled state, no spinner, no banner-clear, no redirect. Supplier has no way to know the action worked — they could click repeatedly. Downgraded from "blocking" to "UX bug" since the data path is correct. Fix: add toast + disable button on submit + clear banner + ideally redirect to audit detail page on success. | UX bug | 🟢 OPEN — defer |

**Investigation checklist for #11 (when fixing):**
- [ ] Open browser DevTools → Network tab, click Send to buyer, capture the request URL + response.
- [ ] If no request fires → handler is not wired (frontend bug).
- [ ] If request fires but errors → check backend logs / the corresponding controller (probably in `intimationSignatureController.js` or related supplier-acceptance route).
- [ ] If request returns 200 but UI doesn't update → frontend not refreshing the audit / not handling the response (state-management bug).
- [ ] Confirm whether `audit.supplierDecision`, `audit.supplierIntimationSignedAt`, and `audit.proposedAuditDates` actually persisted in the DB.

---

## §7 — Issues from auditor (Maria) inbox check

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 12 | Auditor inbox after buyer assignment + supplier acceptance | **Auditor did not see the audit — root cause: persona collision across tenants, NOT a platform bug.** Two `Maria Santos` users exist in the DB: `audit.lead@auditcorp.demo` (audit-only seed, in Acme tenant) and `audit.lead@novex-pharma.demo` (EQMS full-users seed, in Novex tenant). The walkthrough was using the auditcorp Maria for assignment but the operator logged in as the novex Maria. Cross-tenant invisible-to-each-other behaviour is correct; the problem is humans can't tell them apart. **Resolved by logging in as the correct persona.** Underlying fix needed: (a) avoid duplicating personas across seed scripts, (b) add a "tenant hint" or distinct first/last name to one of them, (c) print a single source-of-truth credentials table in the seed-script summary. | Seed-data hygiene | 🟢 OPEN — defer |

**Solution options for #12:**
- **A. Rename the novex Maria** to e.g. `Maria Lopez` so a glance at first/last name disambiguates the two personas across seed scripts.
- **B. Consolidate seed scripts** — one canonical persona file, both seed scripts import the same email→name map. No more drift, no more duplicates.
- **C. Add tenant suffix to display name** in the UI top bar (e.g. "Maria Santos · Acme Pharma") so the operator knows which tenant they're logged into.
- **Recommendation: A + C**. A is a 30-second seed-script edit that solves it for demos. C is a small UX win that helps everyone, not just demos.

---

## §8 — Cross-tenant data isolation (P0)

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 12b | Buyer → external auditor dropdown | **Cross-tenant auditor leak in the auditor-picker dropdown.** Priya (Acme tenant) saw `audit.lead@novex-pharma.demo` (Novex tenant Maria) in her external-auditor dropdown. Confirmed in DB: audit `HK-0000000092-2026` got `auditor_id` set to the Novex Maria's user `_id` and `assignedAuditors[].auditorProfileId` set to her Novex profile, while `tenantOrgId` is Acme's. Buyers should NEVER see users from other tenants in their auditor pickers. This is a data-isolation / multi-tenant-security issue. **P0 — fix before any external customer demo.** | Bug — security/isolation | 🔴 P0 |
| 12c | Buyer → Assign auditor backend | **`assignAuditors` allows cross-tenant assignment with no validation.** The backend accepts an `auditor_id` whose tenant differs from the audit's `tenantOrgId`, persists it, and returns success. The audit is then orphaned — the assigned auditor's inbox query filters by *their* tenant, so they can never see it. Backend must reject cross-tenant assignment with a 400 (or equivalent business error). | Bug — backend validation | 🔴 P0 |
| 13 | Audit detail → Auditee details panel | **Auditee shown as "Ms Priya Sharma"** (with the supplier address). The supplier QA Head is **Asha Sharma**, not Priya. The first name is wrong AND it collides confusingly with Priya Nair (the buyer requester). Looks like a display-mapping bug — possibly pulling the wrong contact field, or accidentally rendering `requester.firstName` against `supplier.lastName`. Whatever it is, the displayed name does not match any seeded user. | Data correctness / display | 🟢 OPEN — defer |
| 14 | Audit detail → Track Progress timeline | **(Positive observation, not a bug)** The Track Progress timeline view is excellent — clear milestone-by-milestone progression with deadlines + completion timestamps + colour-coded status (green=done, blue=in-progress, yellow=pending). Strong UI; protect this in any future redesign. | Observation | 🟢 — keep |

**Hot-fix plan to unblock the walkthrough:**
- Re-assign audit `HK-0000000092-2026` from Novex Maria (`69e64e7c69b2ba745d40bbab`) to Auditcorp Maria (`69ee119e8a9b01a7c13c81ab`) directly via DB update.
- Then log out of any auditor account and log back in as `audit.lead@auditcorp.demo`. The audit should appear.
- Bugs 12b + 12c stay logged as P0 for a dedicated fix session after the walkthrough.

---

## §9 — Process / sequencing issues

| # | Step | Issue | Severity | Status |
|---|---|---|---|---|
| 6 | Audit creation → assign auditor | **Wizard does not enforce Pattern A (industry-standard supplier-first sequence).** Today the buyer can assign an auditor *before* the supplier has accepted the intimation or proposed an audit date. The 24-step expert flow + most pharma platforms expect: (1) buyer creates audit → (2) intimation sent → (3) supplier accepts with proposed date → (4) buyer assigns auditor whose calendar matches that date and who has no active COI for that supplier. Backend supports it (G1 supplier sign endpoint, G2 `/auditors/available?supplierId=X` COI-filtered list, calendar/availability model are all shipped) but the frontend defaults to Pattern B (buyer pre-assigns). Also: the buyer's `Assign auditor` dialog in `components/audits/index.tsx` does **not** pass `supplierIdForCoi` to `<AuditorSelector>`, so the COI filter is dead code from the UI today. | Process correctness | 🟢 OPEN — defer |

**Solution options for #6:**

| Option | Scope | Effort | Trade-off |
|---|---|---|---|
| **A. Pattern A as default wizard, Pattern B as opt-in** | Add a wizard that grays out "Assign auditor" until supplier acceptance lands; add a `Pre-assign auditor (skip supplier acceptance)` toggle for buyers who already have an auditor lined up. Wire `supplierIdForCoi` into the assign dialog. | ~3h frontend | Matches industry expectation + 24-step expert flow. Slight friction for buyers who like to pre-assign — mitigated by the opt-in toggle. |
| **B. Keep Pattern B as default, add supplier-acceptance as optional artefact** | Leave the existing flexibility, just wire the COI dropdown + add a "supplier acceptance" stamp the supplier can sign that doesn't gate anything. | ~1h frontend | Lowest friction, but doesn't match the way pharma QA teams describe their own process — risks "this isn't how we do it" feedback in demos. |
| **C. Configurable per tenant** | Tenant-admin setting picks Pattern A or B as the default wizard. | ~5h (settings UI + backend flag + wizard branching) | Most flexible, most complexity. Probably overkill until ≥2 paying tenants disagree on the default. |

**Recommendation: Option A.** It matches what the user just described as the industry-standard sequence, keeps the escape hatch for buyers who pre-assign, and unblocks the dead COI filter. Defer until the full manual walkthrough is done so we know what else needs to change in the same area.

---

*Issues will be added per persona / per step as we walk through the flow.*
