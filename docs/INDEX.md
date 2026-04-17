# HawkEye Platform — Documentation Index

All documents organized by category. Open `.html` files in Chrome → Ctrl+P → Save as PDF.

---

## 01 — Architecture (7 files)

| Document | Format | Description |
|---|---|---|
| [Technical Architecture](01-architecture/technical-architecture.html) | HTML/PDF | Full system: 14 sections, 161 models, 105+ endpoints, all diagrams |
| [Architecture Diagram](01-architecture/architecture-diagram.html) | HTML/PDF | AWS-style visual diagram, 8 zones, auto-connected arrows |
| [Master Plan](01-architecture/platform-architecture-master-plan.md) | Markdown | North star vision: Phase 0 → Phase 4 evolution roadmap |
| [Technical Architecture (text)](01-architecture/technical-architecture.md) | Markdown | Text-only version of the architecture doc |
| [DB Schema Inventory](01-architecture/current-db-schema-inventory.md) | Markdown | All 161 Mongoose models with collection names |
| [DB Relationships](01-architecture/current-db-relationships.md) | Markdown | ObjectId references and logical entity links |
| [DB ERD Diagram](01-architecture/current-db-erd.mmd) | Mermaid | Entity-relationship diagram (open in mermaid.live) |

## 02 — Deployment & IT Infrastructure (1 file)

| Document | Format | Description |
|---|---|---|
| [Deployment Guide](02-deployment/deployment-guide.html) | HTML/PDF | Cloud (Vercel/AWS) + On-Premise (Docker) install, env vars, security, backup, scaling |

## 03 — User Guides (3 files + screenshots)

| Document | Format | Description |
|---|---|---|
| [Pharma Audit Only Guide](03-user-guides/user-guide-pharma-audit.html) | HTML/PDF | For API Manufacturers (buyer+supplier) — audit module only, 12 sections |
| [Full EQMS Guide](03-user-guides/user-guide-pharma-eqms.html) | HTML/PDF | For API Manufacturers — full EQMS + audit, 14 sections with cross-module cascade |
| [Platform User Manual](03-user-guides/02-user-manual.md) | Markdown | General platform manual |
| [Screenshots](03-user-guides/guide-screenshots/) | PNG | 12 captured screenshots: login, dashboard, all EQMS pages |

## 04 — Processes & Workflows (5 files)

| Document | Format | Description |
|---|---|---|
| [Audit Flow Swimlane](04-processes/audit-flow-swimlane.html) | HTML/PDF | 14-step swimlane: Buyer → Supplier → Auditor with API/DB/event details |
| [GMP Audit Data Flow](04-processes/gmp-audit-data-flow.md) | Markdown | End-to-end data trace from creation to surveillance |
| [Audit Sequence Diagram](04-processes/gmp-audit-sequence.mmd) | Mermaid | Sequence diagram for GMP audit |
| [Status Engine Analysis](04-processes/status-engine-analysis.md) | Markdown | All status enums and state machine logic |
| [Super User Process (24 steps)](04-processes/superuser-process-flow-24steps.md) | Markdown | Industry expert validated 24-step audit workflow |

## 05 — Compliance (2 files)

| Document | Format | Description |
|---|---|---|
| [Compliance Engine](05-compliance/compliance-engine.md) | Markdown | Standalone compliance evaluation pipeline |
| [System Gaps Analysis](05-compliance/current-system-gaps.md) | Markdown | Architectural gap analysis vs industry standards |

## 06 — Roadmap & Requirements (1 file)

| Document | Format | Description |
|---|---|---|
| [Roadmap + URS + Competitor Analysis](06-roadmap/roadmap-and-urs.html) | HTML/PDF | Phased roadmap (P0-P3), 89 user requirements (marked DONE/TODO), 6-vendor competitive analysis, gap analysis |

## 07 — Marketing & Sales (3 files)

| Document | Format | Description |
|---|---|---|
| [Customer Playbooks](07-marketing/customer-playbooks.html) | HTML/PDF | 3 customer demo scripts (Pharma Audit, Full EQMS, Chemical EHS), module configs, vocabulary, onboarding |
| [Investor Pitch — YC](07-marketing/investor-pitch-yc.html) | HTML/PDF | 10-slide pitch: problem, solution, market ($18B), product, traction, competition, ask ($500K) |
| [Sales Deck](07-marketing/sales-deck.html) | HTML/PDF | 7-slide customer deck: pain points, solution, 15 modules, ROI, pricing ($40-120/user) |

## 08 — Reference (5 files)

| Document | Format | Description |
|---|---|---|
| [Backend Structure Map](08-reference/backend-structure-map.md) | Markdown | Directory structure analysis |
| [Repo Topology](08-reference/repo-topology.md) | Markdown | Branch organization and deployment flow |
| [Master vs Transaction Data](08-reference/master-vs-transaction-data.md) | Markdown | Data classification guide |
| [WHOPIR Template Notes](08-reference/whopir-template-source-notes.md) | Markdown | WHO audit report template structure |
| [Super User Process](08-reference/reference/) | Markdown | Reference copy of 24-step process |

## 09 — Test Reports (1 file + generated)

| Document | Format | Description |
|---|---|---|
| [E2E Test Plan](09-test-reports/test-plan.html) | HTML/PDF | 6-layer test strategy: 25 files, 120+ tests, all modules/industries |
| Test Results (generated) | — | Run: `npx playwright show-report e2e-report-full` |
| Demo Video (generated) | .webm | `frontend/test-results-demo/.../video.webm` (8 min, 1080p) |

---

## Quick Reference

| What | Where |
|---|---|
| Frontend | https://hawkeye-frontend-dev-chi.vercel.app |
| Backend API | https://hawkeye-backend-dev.vercel.app |
| API Docs (Swagger) | https://hawkeye-backend-dev.vercel.app/api-docs |
| Health Check | https://hawkeye-backend-dev.vercel.app/health |

| Credential | Email | Password |
|---|---|---|
| Buyer | buyer1.org@legacy.test | Testing@2022 |
| Supplier | lupin@legacy.test | Testing@2022 |
| Auditor | auditor.one@legacy.test | Testing@2022 |

---

## Document Counts

| Folder | Files | Key Formats |
|---|---|---|
| 01-architecture | 7 | HTML, Markdown, Mermaid |
| 02-deployment | 1 | HTML |
| 03-user-guides | 3 + 12 screenshots | HTML, Markdown, PNG |
| 04-processes | 5 | HTML, Markdown, Mermaid |
| 05-compliance | 2 | Markdown |
| 06-roadmap | 1 | HTML |
| 07-marketing | 3 | HTML |
| 08-reference | 5 | Markdown |
| 09-test-reports | 1 + generated | HTML |
| **Total** | **28 + 12 screenshots** | |
