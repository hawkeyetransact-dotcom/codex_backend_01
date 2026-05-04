# Docs staleness report — review + approve before delete

**Generated:** 2026-04-30 · **Total doc files:** 288 across 22 top-level folders.

Three columns of recommendation. **Nothing is deleted yet — sign off the DELETE column and I'll run `git rm`.**

---

## 🟥 DELETE (low risk, safe to remove)

### A. Office lock files (always delete — never commit)
| File | Reason |
|---|---|
| `docs/06-go-to-market/~$12-sanpras-pitch.pptx` | PowerPoint open-file lock; auto-created by Office. |

### B. Stale Playwright test-result snapshots
| Folder | Reason |
|---|---|
| `docs/07-test-results/2026-04-27T21-04-v1.0.0/` | 3-day-old test run, ~135 files (videos, screenshots, JSON). Superseded by 04-28 run. |
| `docs/07-test-results/2026-04-28T03-23-v1.0.0/` | 2-day-old test run. Superseded by next test run we'll do post-fix. |
| `docs/07-test-results/persona-lifecycle/` | Stale persona-walkthrough output. |

> **Why safe:** these are *generated artifacts* — re-runnable any time via the Playwright specs. Saves ~50 MB of repo bloat.

### C. Date-stamped pitch script duplicate
| File | Reason |
|---|---|
| `docs/06-go-to-market/07-pharma-demo-script-with-screenshots-2026-04-29T19-45-02-904Z.html` | Duplicate of `07-pharma-demo-script.html` — date-stamped variant from a builder run. |
| `docs/06-go-to-market/07-pharma-demo-script-with-screenshots-2026-04-29T19-45-02-904Z.pdf` | Same. |

---

## 🟨 REVIEW (older docs that may be obsolete — your call)

### D. Pre-EQMS-build planning docs (likely obsolete now that we shipped)
| File | Why review |
|---|---|
| `docs/06-roadmap/eqms-action-plan.md` | Pre-build action plan. Most items shipped. May still be useful as ref. |
| `docs/06-roadmap/eqms-db-evolution-proposal.md` | Pre-build proposal. Schema is already in place. |
| `docs/06-roadmap/risk-current-state-analysis.md` | Pre-shipped state. Stale. |
| `docs/06-roadmap/risk-incremental-fix-plan.md` | Pre-shipped plan. Stale. |
| `docs/05-compliance/current-system-gaps.md` | Was the gap audit. Many gaps now closed. |
| `docs/04-processes/status-engine-analysis.md` | Status engine work done. May be archive. |

### E. Outdated walkthrough screenshots (from the failed demo)
| File | Why review |
|---|---|
| `docs/09-test-reports/Screenshot 2026-04-29 ...` (6 files) | Captured during botched demo. Useful only if we want a "what was wrong" archive. |

### F. Pre-LLM-fix observation drafter docs
| File | Why review |
|---|---|
| `docs/05-feature-guides/audit-only-feature-guide.html/pdf` | Generated before today's fixes. Mentions skeleton observation drafter. Regenerate? |
| `docs/05-feature-guides/internal-audit-feature-guide.html/pdf` | Same. |

### G. Pre-redesign navigation references
| File | Why review |
|---|---|
| `docs/03-user-guides/eqms-click-by-click-guide.html` | Points to old Discover/Procure/Audits labels. Out of sync with new MARKETPLACE/SUPPLIER COLLABORATION/EQMS labels. |

---

## 🟩 KEEP (current and load-bearing)

### Pitch + sales (just used / about to use)
- `docs/06-go-to-market/12-sanpras-pitch.{pdf,pptx,html}` — current pitch, just delivered.
- `docs/06-go-to-market/13-sanpras-demo-runbook.{pdf,html}` — runbook for next demo.
- `docs/06-go-to-market/11-audit-flow-issue-register.md` — open issues, growing.
- `docs/06-go-to-market/01-vision-positioning.{md,html,pdf}` through `06b-it-security-validation.{md,html,pdf}` — core GTM kit.
- `docs/06-go-to-market/_index.md` — index.
- `docs/06-go-to-market/09-audit-only-gap-analysis-and-roadmap.{md,html,pdf}` — strategic doc.
- `docs/06-go-to-market/10-audit-flow-swim-lane.{md,html,pdf}` — process diagram.

### Architecture + reference
- `docs/01-architecture/*` — current architecture docs.
- `docs/01-pitch/*` — original investor 2-pager / 5-pager / Trust OS.
- `docs/02-deployment/deployment-guide.html`
- `docs/08-reference/*` — backend structure map, repo topology, technical refs.

### Feature guides (most current)
- `docs/05-feature-guides/*-feature-guide.{html,pdf}` (12 modules) — KEEP, but **regenerate the audit/internal-audit ones** to reflect today's LLM + e-sig changes.

### Process flows
- `docs/04-processes/superuser-process-flow-24steps.md` — canonical flow.
- `docs/04-processes/gmp-audit-data-flow.md`, `eqms-process-flows-v2.{html,pdf}`, `audit-flow-swimlane.html`, `eqms-workflow-pharma.html`.

### User guides
- `docs/03-user-guides/02-user-manual.md` — KEEP.
- `docs/03-user-guides/novex-eqms-demo.{html,pdf}` — main EQMS demo doc.
- `docs/03-user-guides/manual-demo-script.{html,pdf}` — KEEP.
- `docs/03-user-guides/pharma-strategy-board.{pdf,html}`, `pharma-strategy-engineering.{pdf,html}` — strategy packs.

### Other folders to keep as-is
- `docs/askhawk/*`, `docs/eqms-intelligence/*`, `docs/org-directory/*`, `docs/platform-docs/*`, `docs/capa/*`, `docs/marketplace-v2/*`, `docs/doc-intel/*`, `docs/reference/*`.
- `docs/07-marketing/*` — sales material.
- `docs/09-test-reports/eqms-test-results-v2.{html,pdf}`, `walkthrough-report.{html,pdf}`, `executed-demo-script.{html,pdf}`, `test-plan.html`, `eqms-workflow-test-plan.md`, `demo-runbook.md`, `demo-sample-data.json`.

---

## Recommended action

**Tier 1 — definitely do (low risk, removes ~135 stale files):**
- Delete A (Office lock).
- Delete B (test-result snapshots — they're regenerable).
- Delete C (date-stamped pitch script duplicates).

**Tier 2 — your call:**
- Review D / E / F / G item-by-item. I can do this individually with you if you want, or in batches.

**Tier 3 — regenerate (after delete):**
- Re-run `node scripts/build-feature-guide-index.mjs` (or per-module builder) for the audit + internal-audit guides so they reflect today's e-sig + LLM observation drafter changes.
- Re-run `node scripts/build-eqms-process-flows.mjs` if the menu regrouping changed any process diagrams.

---

## How to authorize

- Reply **"delete tier 1"** → I run `git rm` for A+B+C, commit, push.
- Reply **"delete tier 1 + D"** (etc.) → I delete tier 1 plus the D folder/file you name.
- Reply **"keep all, regenerate stale"** → no deletions, I just refresh the regenerable docs.
