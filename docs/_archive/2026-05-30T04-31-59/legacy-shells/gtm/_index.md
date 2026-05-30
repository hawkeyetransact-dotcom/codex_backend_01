# Hawkeye — Go-To-Market Pack

> Owner: Hawkeye founder · Last updated: 2026-04-26

This pack is the canonical set of marketing + product-strategy documents for Hawkeye.
Everything reads from `01-vision-positioning.md` — open that first.

| # | Doc | Status | What it answers |
|---|---|---|---|
| 1 | [Vision & Positioning](01-vision-positioning.md) | ✅ live | What is Hawkeye, who's it for, where does it sit vs MasterControl / Veeva / Qualifyze, how is Supplier Management bundled into EQMS, what's our right-to-win |
| 2 | Per-Vertical Pitches | ⏳ next | Vertical-specific pitches: pharma (deep) · med-device (deep) · ISO 9001 / food safety / automotive IATF 16949 (stubs) — each with ICP, KPI, ROI claim, pricing |
| 3 | Deployment Models | ⏳ pending | SaaS · Private Cloud · On-prem · Hybrid — module-by-module deployment, LLM strategy per model (cloud LLM vs on-prem llama / Ollama vs hybrid agentic gateway), price diff |
| 4 | Admin Panel Spec | ⏳ pending | Tenant admin · org admin · RBAC · module gating · vocabulary overrides · AI permissions matrix · audit log viewer · subscription/usage view |
| 5 | AI ROI + Usage Pricing Calculator | ⏳ pending | Usage events to track, ROI math (time-saved × hourly-rate × runs), tier model (free quota → metered → unlimited), permission model |
| 6 | Two-Track Sales Kit | ⏳ pending | Track A — Executive 1-pager (agentic value + time/cost saved) · Track B — IT/Security validation pack (architecture, data flows, auth/authz, encryption, SOX/SOC2/HIPAA/GxP/Part 11) |

## Sequence

1. **Now (this batch)**: Doc 1 only — Vision & Positioning. Everything else flows from it.
2. **Next batch**: Docs 2 + 3 (vertical pitches + deployment models) — both customer-facing.
3. **After that**: Docs 4 + 5 (admin panel + AI pricing) — internal product specs that feed engineering and pricing pages.
4. **Last**: Doc 6 (sales kit) — easiest to write once 1-5 are locked.

## Notes

- Docs are markdown for fast iteration. Once locked, port to PDF via the existing Playwright builder pattern (`scripts/build-module-feature-guide.mjs`).
- Each doc should fit on 1-5 printable pages. If a doc grows past 10 pages, split it.
- Source-of-truth conflicts (e.g., pricing in Doc 1 vs Doc 5) → Doc 5 wins. Cross-link, don't duplicate.
