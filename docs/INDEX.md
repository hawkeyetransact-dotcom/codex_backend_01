# Hawkeye Backend Docs — INDEX

Generated: 2026-05-30 (post-cleanup). For the prior structure see `_archive/2026-05-30T04-31-59/CLEANUP-REPORT.md`.

---

## 00-strategy-and-pitch/ — fundraising & GTM canon

The consolidated fundraising/strategy bucket. Canonical docs from the May-2026 Claude.ai prep chat live at the top; older versions are preserved under `*-legacy/` subfolders.

- `MASTER-REFERENCE.pdf` — 30-page consolidated reference (vision, architecture, pharma plug-in, GTM, URS, honesty register). **The canon.**
- `BUSINESS-AND-FUNDING-PLAN.pdf` — India-cost-base financial plan; bottom-up TAM, native AI strategy, 36-month model, cap table to Series A. Revises pitch ask to $1.2–1.5M.
- `pitch/`
  - `pitch-deck.pdf` — 12-slide angel-round deck (asks $3M; should be edited to $1.5M per business plan)
  - `founder-memo.pdf` — 2-page founder-voice memo, deck companion
- `gtm/`
  - `audit-management-module-spec.pdf` — 10-page Audit Management module spec (data model, lifecycle, RBAC, admin, AI governance, e-sign)
  - `diagrams/` — audit-data-model, audit-lifecycle, audit-admin-map (PNG + SVG)
- `market-and-strategy/`
  - `per-sector-market-analysis.pdf` — sector rings, scoring, expansion sequence, "horizontal trap" reckoning
- `diagrams/` — `sector-rings.png/.svg` (industry expansion rings)
- `pitch-legacy/` — old 2-pager / 5-pager / Trust-OS one-pager
- `gtm-legacy/` — earlier GTM bundle (vision, deployment models, demo scripts, Sanpras pitch, ROI calc)
- `marketing-legacy/` — early customer playbooks, demo voiceover, YC pitch

## 01-architecture/ — technical architecture

- `pillars-architecture-VERIFIED.pdf` — 8-page verified-against-code architecture (five-pillar engine, config layer, per-module walkthroughs). **The canon.**
- `current-db-schema-inventory.md`, `current-db-erd.mmd`, `current-db-relationships.md`, `future-eqms-erd.mmd` — DB inventories (untouched)
- `technical-architecture.{md,html}` — earlier narrative architecture
- `architecture-diagram.html` — interactive diagram
- `diagrams/` — `pillars-asbuilt.png/.svg` + 6 per-module pillar strips (audit, capa, change, deviation, doc, supplier)

## 02-deployment/ — deployment guide (untouched)

## 03-user-guides/ — user manual + demo scripts + screenshots (untouched)

## 04-processes/ — workflow + audit-flow docs

The duplicated `superuser-process-flow-24steps.md` was removed; the canonical copy lives in `08-reference/`.

## 05-compliance/ — compliance engine + system-gaps notes

## 08-reference/ — reference material

- `superuser-process-flow-24steps.md` — **canonical copy** (un-nested from `08-reference/reference/`)
- backend-structure-map, master-vs-transaction-data, autofill architecture, repo topology, whopir notes

## 09-test-reports/ — demo runbook + EQMS results + walkthrough reports

## 10-feature-guides/ (renumbered from `05-feature-guides/`)

17 module feature guides. `audit-only-feature-guide` and `internal-audit-feature-guide` were superseded by `00-strategy-and-pitch/gtm/audit-management-module-spec.pdf` and archived.

## 11-roadmap/ (renumbered from `06-roadmap/`)

- `URS-v1.0-DRAFT.pdf` — Part A (foundational) + Part B (white-space). **Draft pending ratification.**
- `eqms-action-plan.md`, `eqms-db-evolution-proposal.md`, `risk-current-state-analysis.md`, `risk-incremental-fix-plan.md`
- `roadmap-and-urs.html` was superseded by the URS PDF and archived.

## 11-research/ — vendor-neutral industry research

- `quality-software-research-paper.pdf` + `.md` — 4-page paper: EQMS/supplier-audit business process, 40-year software evolution, six white spaces
- `eqms-supplier-audit-industry-study.pdf` — 8-page industry study with Hawkeye framing

## 12-test-results/ (renumbered from `07-test-results/`)

Playwright snapshots; tier-1 cleanup archived earlier runs under its own `_archive/` subfolder.

## Domain folders (kept as-is)

- `askhawk/` — KB, contracts, decisions, flows, runbook, role specs
- `capa/` — CAPA module blueprint
- `doc-intel/` — doc intelligence coverage
- `eqms-intelligence/` — API spec, architecture, integration framework, test plan
- `marketplace-v2/` — implementation plan
- `org-directory/` — current state, delta manifest, rollout plan, target schema

## Pending manual review

- `platform-docs/` — held in place. Two files overlap with canonical locations but content differs; needs your eye:
  - `platform-docs/01-architecture-technical.md` (22 KB) vs `01-architecture/technical-architecture.md` (86 KB)
  - `platform-docs/02-user-manual.md` vs `03-user-guides/02-user-manual.md` (only frontmatter `category:` differs)

## _archive/

- `2026-05-30T04-31-59/` — this cleanup (duplicates, supersedes, empty-shell parents)
- Earlier tier-1 archives nested under each parent's own `_archive/` (test snapshots, demo dups, screenshots)

## Other top-level files

- `14-staleness-report.md` — the cleanup playbook this work was based on
- `VERSIONS.md` — version registry
