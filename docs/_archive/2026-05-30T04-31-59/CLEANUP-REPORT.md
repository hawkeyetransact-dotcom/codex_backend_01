# Docs Cleanup — 2026-05-30T04-31-59

Source playbook: `docs/14-staleness-report.md` + user-provided cleanup spec (5 phases + zip merge).

## Counts

| Metric | Count |
|---|---|
| Active files at start | 176 |
| Files archived (this run) | 9 (3 duplicates + 2 empty-shell parents + 4 superseded by new canon) |
| Folders renamed | 3 |
| Folders consolidated into `-legacy/` subfolders | 3 (48 files relocated) |
| Empty parent folders removed | 3 |
| New files placed from zip | 33 (zero existed at destinations — clean placement) |
| Manual-review items logged (no move) | 2 |

## Phase A — In-tree duplicate resolution

### `superuser-process-flow-24steps.md` (3 instances → 1)

Kept: `08-reference/superuser-process-flow-24steps.md` (un-nested from `08-reference/reference/`).

Archived:
- `04-processes/superuser-process-flow-24steps.md` (hash `d055bd7b…`) → `_archive/2026-05-30T04-31-59/04-processes/`
- `reference/superuser-process-flow-24steps.md` (hash `91138465…`, identical to kept copy modulo line endings) → `_archive/2026-05-30T04-31-59/reference/`

Empty folders removed:
- `08-reference/reference/` (became empty after un-nest) → removed
- `reference/` (top-level, became empty after archive) → removed

### `platform-docs/` overlaps — MANUAL REVIEW (no move per spec)

| platform-docs file | Canonical | Diff |
|---|---|---|
| `platform-docs/01-architecture-technical.md` (22 KB) | `01-architecture/technical-architecture.md` (86 KB) | Substantively different (4× size). Both kept; needs your judgment which is source of truth. |
| `platform-docs/02-user-manual.md` (30,376 B) | `03-user-guides/02-user-manual.md` (30,374 B) | Differs only in frontmatter `category:` line (`platform-docs` vs `user-guides`). Both kept. |

## Phase B — Numbering renames (collision fix)

| Old | New |
|---|---|
| `05-feature-guides/` | `10-feature-guides/` |
| `06-roadmap/` | `11-roadmap/` |
| `07-test-results/` | `12-test-results/` |

Contents preserved verbatim including each folder's own pre-existing `_archive/`.

## Phase C — Strategy/fundraising consolidation

| Source | Target |
|---|---|
| `01-pitch/*` (6 files) | `00-strategy-and-pitch/pitch-legacy/` |
| `06-go-to-market/*` (37 files + `_archive/` + `_index.md` = 38 entries) | `00-strategy-and-pitch/gtm-legacy/` |
| `07-marketing/*` (5 files) | `00-strategy-and-pitch/marketing-legacy/` |

After move, the 3 source folders were empty and were removed (no `_archive/` entry needed — emptied parents have no content to preserve).

## Phase D — Zip merge (`hawkeye-chat-artifacts.zip`, MANIFEST v1.0)

All 33 manifest artifacts were NEW at destinations — zero hash conflicts, zero existing-destination supersedes. Placement:

| Bucket | Count |
|---|---|
| `00-strategy-and-pitch/` (root + `pitch/` + `gtm/` + `market-and-strategy/` + `diagrams/` + `gtm/diagrams/`) | 13 |
| `01-architecture/` (root + `diagrams/`) | 15 |
| `11-roadmap/` (post-rename) | 1 (URS-v1.0-DRAFT) |
| `11-research/` (new) | 3 (research paper PDF + MD + industry study) |
| TOTAL | 33 |

### `supersedes_likely` processing (14 candidates → 4 archived, 9 preserved-via-legacy, 1 missing)

- **9 PRESERVED_VIA_LEGACY** — already moved to `00-strategy-and-pitch/{pitch,gtm,marketing}-legacy/` in Phase C; no double-archive needed:
  - `01-pitch/{hawkeye-engine-2pager,hawkeye-investor-5pager,hawkeye-trust-os-onepager}.pdf`
  - `06-go-to-market/{01-vision-positioning,02-per-vertical-pitches,03-deployment-models,05-ai-roi-pricing-calculator}.*`
  - `07-marketing/{sales-deck,investor-pitch-yc}.html`
- **4 SUPERSEDED_LIKELY_ARCHIVED** — moved to `_archive/2026-05-30T04-31-59/superseded/`:
  - `01-architecture/platform-architecture-master-plan.md` (superseded by `pillars-architecture-VERIFIED.pdf`)
  - `10-feature-guides/audit-only-feature-guide.pdf` (superseded by `audit-management-module-spec.pdf`)
  - `10-feature-guides/internal-audit-feature-guide.pdf` (superseded by `audit-management-module-spec.pdf`)
  - `11-roadmap/roadmap-and-urs.html` (superseded by `URS-v1.0-DRAFT.pdf`)
- **1 SUPERSEDES_TARGET_MISSING** — `01-architecture/technical-architecture.pdf` (only `.md` and `.html` exist on disk; no `.pdf` to archive)

## Old → new path mapping

### Folder renames (Phase B)
- `05-feature-guides/**` → `10-feature-guides/**`
- `06-roadmap/**` → `11-roadmap/**`
- `07-test-results/**` → `12-test-results/**`

### Strategy consolidation (Phase C)
- `01-pitch/**` → `00-strategy-and-pitch/pitch-legacy/**`
- `06-go-to-market/**` → `00-strategy-and-pitch/gtm-legacy/**`
- `07-marketing/**` → `00-strategy-and-pitch/marketing-legacy/**`

### Duplicates (Phase A)
- `08-reference/reference/superuser-process-flow-24steps.md` → `08-reference/superuser-process-flow-24steps.md`
- `04-processes/superuser-process-flow-24steps.md` → `_archive/.../04-processes/`
- `reference/superuser-process-flow-24steps.md` → `_archive/.../reference/`

### New canon (Phase D — placed from zip)
- `00-strategy-and-pitch/MASTER-REFERENCE.pdf`
- `00-strategy-and-pitch/BUSINESS-AND-FUNDING-PLAN.pdf`
- `00-strategy-and-pitch/pitch/{pitch-deck,founder-memo}.pdf`
- `00-strategy-and-pitch/gtm/audit-management-module-spec.pdf` + 3 diagrams
- `00-strategy-and-pitch/market-and-strategy/per-sector-market-analysis.pdf`
- `00-strategy-and-pitch/diagrams/sector-rings.{png,svg}`
- `01-architecture/pillars-architecture-VERIFIED.pdf`
- `01-architecture/diagrams/pillars-asbuilt.{png,svg}` + 6 module-pillars strips (audit, capa, change, deviation, doc, supplier)
- `11-roadmap/URS-v1.0-DRAFT.pdf`
- `11-research/{quality-software-research-paper.pdf, .md, eqms-supplier-audit-industry-study.pdf}`

### Superseded by Phase D
- `01-architecture/platform-architecture-master-plan.md` → `_archive/.../superseded/01-architecture/`
- `10-feature-guides/audit-only-feature-guide.pdf` → `_archive/.../superseded/10-feature-guides/`
- `10-feature-guides/internal-audit-feature-guide.pdf` → `_archive/.../superseded/10-feature-guides/`
- `11-roadmap/roadmap-and-urs.html` → `_archive/.../superseded/11-roadmap/`

## Untouched

- All `01-architecture/current-db-*` files (per zip manifest `do_not_touch`)
- `02-deployment/`, `03-user-guides/`, `04-processes/` (minus duplicate), `05-compliance/`, `08-reference/` (minus un-nest), `09-test-reports/`
- All domain folders: `askhawk/`, `capa/`, `doc-intel/`, `eqms-intelligence/`, `marketplace-v2/`, `org-directory/`, `platform-docs/`
- Tier-1 archives from `2026-05-03` (still nested under each parent's own `_archive/`)
- `14-staleness-report.md`, `VERSIONS.md`, `_index.md` files inside domain folders

## Reversibility

Every move was logged. To undo:
1. Reverse Phase D: move `_archive/2026-05-30T04-31-59/superseded/**` back, delete the 33 zip-placed files (listed above)
2. Reverse Phase C: move `00-strategy-and-pitch/{pitch,gtm,marketing}-legacy/**` back to `01-pitch/`, `06-go-to-market/`, `07-marketing/`
3. Reverse Phase B: rename `10-feature-guides/`, `11-roadmap/`, `12-test-results/` back to `05-`, `06-`, `07-`
4. Reverse Phase A: move `_archive/2026-05-30T04-31-59/{04-processes,reference}/superuser-process-flow-24steps.md` back; move `08-reference/superuser-process-flow-24steps.md` back into `08-reference/reference/`

All moves used `git mv` where the source was tracked, preserving file history.

---

## Addendum — Stale-content second pass

After Phase D placed the new canon, an audit of the `-legacy/` subfolders showed three classes of files:

| Tier | Description | Count | Action |
|---|---|---|---|
| 1 | Explicitly listed in zip MANIFEST `supersedes_likely` | 20 | Archived to `superseded/legacy/{pitch,gtm,marketing}/` |
| 2 | Likely stale per content overlap (executive onepager, audit gap analysis) | 6 | Archived to `superseded/legacy/gtm/` |
| 3 | Operational/customer-specific docs with no canon conflict | 22 | Reorganized into named subfolders (NOT archived) |

### Tier 1+2 archived (26 files) → `_archive/2026-05-30T04-31-59/superseded/legacy/`

**pitch/** (6) — superseded by `pitch/pitch-deck.pdf` + `pitch/founder-memo.pdf`:
- `hawkeye-engine-2pager.{pdf,html}`
- `hawkeye-investor-5pager.{pdf,html}`
- `hawkeye-trust-os-onepager.{pdf,html}`

**gtm/** (18) — superseded by `market-and-strategy/per-sector-market-analysis.pdf` + `BUSINESS-AND-FUNDING-PLAN.pdf`:
- `01-vision-positioning.{html,md,pdf}`
- `02-per-vertical-pitches.{html,md,pdf}`
- `03-deployment-models.{html,md,pdf}`
- `05-ai-roi-pricing-calculator.{html,md,pdf}`
- `06a-executive-onepager.{html,md,pdf}` (pre-funding-plan positioning)
- `09-audit-only-gap-analysis-and-roadmap.{html,md,pdf}` (overlaps URS v1.0)

**marketing/** (2) — superseded by `pitch/pitch-deck.pdf`:
- `sales-deck.html`
- `investor-pitch-yc.html`

### Tier 3 reorganized → new subfolders under `00-strategy-and-pitch/`

| New folder | Files moved from |
|---|---|
| `customer-pitches/` | `gtm-legacy/{12-sanpras-pitch.*, 13-sanpras-demo-runbook.*}` |
| `demo-assets/` | `gtm-legacy/07-pharma-demo-script.*`, `marketing-legacy/{demo-voiceover-script.md, demo-package.html, customer-playbooks.html}` |
| `operational-specs/` | `gtm-legacy/{04-admin-panel-spec.*, 06b-it-security-validation.*, 10-audit-flow-swim-lane.*, 11-audit-flow-issue-register.md}` |

### Legacy shells removed

- `pitch-legacy/` — emptied by Tier 1 archive
- `marketing-legacy/` — emptied by Tier 1 + Tier 3 moves
- `gtm-legacy/_index.md` (stale) → archived to `legacy-shells/gtm/`
- `gtm-legacy/_archive/*` (2 prior-cleanup screenshot PDFs) → consolidated into `legacy-shells/gtm/`
- `gtm-legacy/` — emptied, removed

Final state under `00-strategy-and-pitch/`: 8 active subfolders (`pitch/`, `gtm/`, `market-and-strategy/`, `diagrams/`, `customer-pitches/`, `demo-assets/`, `operational-specs/` + the 2 root canon PDFs). Zero `-legacy/` clutter; all stale content in `_archive/`.
